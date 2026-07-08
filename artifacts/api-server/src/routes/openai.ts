import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
import { getVerticalConfig } from "../lib/verticals";
// Call the Replit model farm directly via fetch — the SDK appends /v1 which breaks routing
async function chatComplete(messages: {role: string; content: string}[], maxTokens = 600): Promise<string> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "";
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";
  const url = `${baseURL}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-5.4", max_completion_tokens: maxTokens, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

const router = Router();
router.use(requireAuth);

const FINAL_STEP = 7;

function getStepLabel(step: number) {
  if (step === 1) return "intro outreach";
  if (step >= FINAL_STEP) return "final breakup email (last attempt before moving on)";
  return `follow-up #${step - 1} (no response to the previous ${step - 1 === 1 ? "email" : `${step - 1} emails`})`;
}

function getStepTone(step: number, offerName: string = "site walkthrough") {
  if (step === 1) return `warm and professional — introduce the value proposition clearly, mention a specific industry challenge, and end with a soft ask for a 15-minute call or ${offerName}`;
  if (step >= FINAL_STEP) return "respectful and concise breakup email — acknowledge you've reached out before, wish them well, leave the door open, do NOT be pushy";
  if (step === 2) return "friendly follow-up — briefly reference the previous email, add a new angle or specific pain point, keep it short, and make the ask easy to say yes to";
  if (step === 3) return "value-driven follow-up — share a concrete result, proof point, or mini case study relevant to their industry, then restate the ask simply";
  if (step === 4) return "curiosity-driven follow-up — ask a short, pointed question about a specific operational pain point; keep it under 100 words and easy to reply to";
  if (step === 5) return "helpful-resource follow-up — offer something of standalone value (a quick tip, checklist idea, or benchmark insight) with a low-pressure ask";
  return `persistence-with-respect follow-up — acknowledge they're busy, briefly recap the core value in one sentence, and offer the ${offerName} as a no-obligation next step`;
}

router.post("/generate-email", async (req, res) => {
  try {
    const { prospectId, step: rawStep = 1, industry: industryInput, campaignContext } = req.body;
    const step = Math.min(Math.max(Math.floor(Number(rawStep)) || 1, 1), FINAL_STEP);

    // Two modes:
    // 1. Prospect mode — generate a personalized email for a real prospect (prospectId given).
    // 2. Template mode — generate a reusable campaign template for a chosen industry,
    //    using merge placeholders ({{contactName}}, {{companyName}}, {{city}}) instead of real data.
    let companyName: string;
    let contactName: string;
    let firstName: string;
    let industry: string;
    let city: string;
    let state: string;
    let templateMode = false;

    let prospect = null;
    if (prospectId) {
      [prospect] = await db
        .select()
        .from(prospectsTable)
        .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.clientId, req.clientId)));
    }

    // The sender is the authenticated client — use their real business name so the
    // AI never invents a company (e.g. "CleanPro"). A signature is appended later by
    // composeEmail(), so the model must NOT write its own sign-off.
    const [client] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.clientId));
    const vc = getVerticalConfig(client?.vertical);
    const businessName = client?.businessName?.trim();
    const senderClause = businessName
      ? `${vc.senderDescriptor} called ${businessName}`
      : vc.senderDescriptor;
    const offeringFocus = vc.key === "it_services"
      ? ` For this email, emphasize ${vc.offerings[(Math.max(1, Number(step)) - 1) % vc.offerings.length]} as the primary service focus, while noting the full range of offerings when natural.`
      : "";
    const noSignatureRule = `Do NOT include any sign-off, closing, signature block, sender name, company name signature, phone number, or email address at the end of the email — a signature is appended automatically. End the email with the call to action only.`;

    if (prospect) {
      // Prospect mode — use the real prospect's name/company/city for a realistic preview,
      // but when a campaign industry is selected, that selection overrides the prospect's
      // own industry so the email content follows the chosen industry.
      companyName = prospect.companyName;
      contactName = prospect.contactName ?? "there";
      firstName = contactName.split(" ")[0];
      industry = industryInput || prospect.industry || "";
      city = prospect.city ?? "";
      state = prospect.state ?? "";
    } else {
      // Template mode — no prospect available, so produce a reusable industry template
      // using merge placeholders instead of real data.
      templateMode = true;
      industry = industryInput ?? "";
      companyName = "{{companyName}}";
      contactName = "{{contactName}}";
      firstName = "{{contactName}}";
      city = "{{city}}";
      state = "{{state}}";
    }

    const challenges = vc.industryChallenges[industry] ?? vc.fallbackChallenges;
    const challengeList = challenges.slice(0, 3).map(c => `• ${c}`).join("\n");
    const industryLabel = industry || "commercial";

    const systemPrompt = templateMode
      ? `You are an expert B2B sales copywriter for ${senderClause}. You are writing a REUSABLE email TEMPLATE for an outbound campaign targeting the ${industryLabel} industry. The template will be merged with real prospect data, so you MUST use these exact merge placeholders verbatim where appropriate: {{contactName}}, {{companyName}}, {{city}}. Do NOT invent specific names, companies, or cities — use the placeholders. The template must be specific to the ${industryLabel} industry and reference its real challenges with ${vc.serviceNoun}.${offeringFocus} Emails are conversational, specific, concise, and never generic. Never use filler phrases like "I hope this finds you well." Keep emails under 200 words. End with one clear, specific call to action. ${noSignatureRule}`
      : `You are an expert B2B sales copywriter for ${senderClause}. Your emails are conversational, specific, concise, and never generic. You write ${vc.serviceNoun} sales emails to ${vc.audience}.${offeringFocus} Always use the prospect's real name and company. Never use filler phrases like "I hope this finds you well." Keep emails under 200 words. Never use bullet points unless the prompt asks. End with one clear, specific call to action. ${noSignatureRule}`;

    const userPrompt = templateMode
      ? `Write a ${getStepLabel(step)} cold email TEMPLATE specifically for the ${industryLabel} industry.

Use these merge placeholders verbatim (do not replace them with real values):
- Greeting name: {{contactName}}
- Company: {{companyName}}
- City: {{city}}

This template targets ${industryLabel} businesses. Known ${industryLabel} ${vc.key === "it_services" ? "IT and technology" : "facility"} challenges to draw from:
${challengeList}

Tone and approach: ${getStepTone(step, vc.offerName)}
${campaignContext ? `\nAdditional campaign context: ${campaignContext}` : ""}

Output format — return ONLY valid JSON with no markdown, no code block, no extra text:
{"subject": "...", "body": "..."}

The subject and body MUST reference the ${industryLabel} industry's real challenges. The body should use real line breaks (\\n) between paragraphs, not HTML.`
      : `Write a ${getStepLabel(step)} cold email for:
- Name: ${firstName} (full: ${contactName})
- Company: ${companyName}
- Industry: ${industry}
- Location: ${city}, ${state}
${campaignContext ? `- Campaign context: ${campaignContext}` : ""}

Known ${industry} ${vc.key === "it_services" ? "IT and technology" : "facility"} challenges:
${challengeList}

Tone and approach: ${getStepTone(step, vc.offerName)}

Output format — return ONLY valid JSON with no markdown, no code block, no extra text:
{"subject": "...", "body": "..."}

The body should use real line breaks (\\n) between paragraphs, not HTML.`;

    const raw = await chatComplete([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    let parsed: { subject?: string; body?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON from the response in case there's extra text
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    res.json({
      subject: parsed.subject ?? vc.fallbackEmailSubject(companyName),
      body: parsed.body ?? raw,
    });
  } catch (err: any) {
    console.error("OpenAI generate-email error:", err?.message);
    res.status(500).json({ error: "Failed to generate email" });
  }
});

export default router;

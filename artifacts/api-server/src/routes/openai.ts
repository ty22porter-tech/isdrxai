import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";
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

const INDUSTRY_CHALLENGES: Record<string, string[]> = {
  "Healthcare": [
    "infection control and HIPAA-compliant cleaning protocols",
    "maintaining sterile exam rooms and waiting areas between patients",
    "high patient volume creating rapid soil buildup",
    "Joint Commission and OSHA cleanliness standards",
  ],
  "Technology": [
    "keeping open-plan offices and dense workstations clean",
    "maintaining a polished appearance for client and investor visits",
    "managing shared kitchens and break rooms for large teams",
    "non-toxic cleaning safe around electronics and equipment",
  ],
  "Legal": [
    "maintaining immaculate conference rooms for high-stakes meetings",
    "confidential document areas requiring trusted, vetted cleaning staff",
    "client-facing spaces that must look flawless at all times",
    "after-hours cleaning to avoid disrupting attorney schedules",
  ],
  "Finance": [
    "regulatory audits requiring spotless, well-documented facilities",
    "security-sensitive areas needing bonded, background-checked staff",
    "trading floor air quality and surface disinfection",
    "maintaining immaculate client-facing spaces",
  ],
  "Commercial Real Estate": [
    "common areas and lobbies across multi-tenant buildings",
    "rapid deep cleaning for move-in/move-out turnovers",
    "tenant retention depending on clean, well-maintained spaces",
    "coordinating cleaning schedules across a full property portfolio",
  ],
  "Logistics & Warehousing": [
    "OSHA floor cleanliness and slip-hazard compliance on warehouse floors",
    "large square footage requiring efficient industrial cleaning equipment",
    "break rooms and restrooms serving large shift workforces",
    "loading dock and equipment area debris buildup",
  ],
  "Manufacturing": [
    "OSHA and ISO cleanliness documentation on production floors",
    "industrial grease, oil, and chemical residue requiring specialized removal",
    "cleaning coordinated around production downtime windows",
    "employee break rooms and restrooms across multiple shifts",
  ],
  "Education": [
    "preventing illness spread in high-density classrooms and cafeterias",
    "restrooms requiring multiple cleanings throughout the school day",
    "child-safe, non-toxic products for student environments",
    "seasonal deep cleans (summer, holidays) for budget planning",
  ],
};

function getStepLabel(step: number) {
  if (step === 1) return "intro outreach";
  if (step === 2) return "follow-up (no response to email 1)";
  return "final breakup email (last attempt before moving on)";
}

function getStepTone(step: number) {
  if (step === 1) return "warm and professional — introduce the value proposition clearly, mention a specific industry challenge, and end with a soft ask for a 15-minute call or site walkthrough";
  if (step === 2) return "friendly follow-up — briefly reference the previous email, add a new angle or specific pain point, keep it short, and make the ask easy to say yes to";
  return "respectful and concise breakup email — acknowledge you've reached out before, wish them well, leave the door open, do NOT be pushy";
}

router.post("/generate-email", async (req, res) => {
  try {
    const { prospectId, step = 1, industry: industryInput, campaignContext } = req.body;

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

    const challenges = INDUSTRY_CHALLENGES[industry] ?? [
      "maintaining a clean, professional environment",
      "finding a reliable and consistent janitorial partner",
    ];
    const challengeList = challenges.slice(0, 3).map(c => `• ${c}`).join("\n");
    const industryLabel = industry || "commercial";

    const systemPrompt = templateMode
      ? `You are an expert B2B sales copywriter for a janitorial company called CleanPro Janitorial Services. You are writing a REUSABLE email TEMPLATE for an outbound campaign targeting the ${industryLabel} industry. The template will be merged with real prospect data, so you MUST use these exact merge placeholders verbatim where appropriate: {{contactName}}, {{companyName}}, {{city}}. Do NOT invent specific names, companies, or cities — use the placeholders. The template must be specific to the ${industryLabel} industry and reference its real cleaning challenges. Emails are conversational, specific, concise, and never generic. Never use filler phrases like "I hope this finds you well." Keep emails under 200 words. End with one clear, specific call to action.`
      : `You are an expert B2B sales copywriter for a janitorial company called CleanPro Janitorial Services. Your emails are conversational, specific, concise, and never generic. You write for commercial cleaning sales to facility managers and operations leaders. Always use the prospect's real name and company. Never use filler phrases like "I hope this finds you well." Keep emails under 200 words. Never use bullet points unless the prompt asks. End with one clear, specific call to action.`;

    const userPrompt = templateMode
      ? `Write a ${getStepLabel(step)} cold email TEMPLATE specifically for the ${industryLabel} industry.

Use these merge placeholders verbatim (do not replace them with real values):
- Greeting name: {{contactName}}
- Company: {{companyName}}
- City: {{city}}

This template targets ${industryLabel} businesses. Known ${industryLabel} facility challenges to draw from:
${challengeList}

Tone and approach: ${getStepTone(step)}
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

Known ${industry} facility challenges:
${challengeList}

Tone and approach: ${getStepTone(step)}

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
      subject: parsed.subject ?? `Janitorial services for ${companyName}`,
      body: parsed.body ?? raw,
    });
  } catch (err: any) {
    console.error("OpenAI generate-email error:", err?.message);
    res.status(500).json({ error: "Failed to generate email" });
  }
});

export default router;

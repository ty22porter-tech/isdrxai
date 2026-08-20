import { db, autopilotEnrollmentsTable, prospectsTable, campaignsTable, usersTable, emailsTable, activityTable, emailLinksTable } from "@workspace/db";
import { eq, and, lte, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendEmail } from "./emailSender";
import { getClientEmailAttachments } from "./clientAttachments";
import { composeEmail, unsubscribeHeaders } from "./emailCompose";
import { getPublicAppUrl } from "./publicUrl";
import { resolveReplyTo } from "./inboundAddressing";
import { getVerticalConfig, offeringForStep, type VerticalConfig } from "./verticals";
import { processEngagementAutomation } from "./engagementAutomation";

const AI_BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "";
const AI_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "";

async function aiGenerate(prompt: string): Promise<string> {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_KEY}` },
    body: JSON.stringify({
      model: "gpt-5.4",
      max_completion_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function generateStepEmail(
  step: number,
  prospect: { companyName: string; contactName: string; industry: string; city: string; state: string; squareFootage?: number | null; employeeCount?: number | null },
  senderBusinessName: string,
  vc: VerticalConfig,
): Promise<string> {
  const firstName = prospect.contactName.split(" ")[0];
  const size = prospect.squareFootage ? `${prospect.squareFootage.toLocaleString()} sq ft` : "";
  const employees = prospect.employeeCount ? `${prospect.employeeCount} employees` : "";
  const details = [size, employees].filter(Boolean).join(", ");

  const senderInfo = `The sender's company is "${senderBusinessName}".`;
  const noSignature = `End the email immediately after the call to action. Do NOT add any sign-off, signature, sender name, company name line, phone number, email address, or placeholder tokens like [Your Name] or [Your Company] — a signature is appended automatically afterward.`;
  const offering = offeringForStep(vc, step);
  const focusClause = vc.key === "it_services"
    ? ` For this email, emphasize ${offering} as the primary service focus.`
    : "";

  const prompts: Record<number, string> = {
    1: `Write a short, professional cold email from ${vc.senderDescriptor} to ${firstName} at ${prospect.companyName} (${prospect.industry} in ${prospect.city}, ${prospect.state}${details ? `, ${details}` : ""}). ${senderInfo}${focusClause} The email should mention their industry's specific challenges with ${vc.serviceNoun}, offer a ${vc.offerName}, and end with a clear call to action. Keep it under 150 words. No subject line. Plain text only. ${noSignature}`,
    2: `Write a brief, friendly follow-up cold email to ${firstName} at ${prospect.companyName}. ${senderInfo}${focusClause} Reference a previous unanswered email about ${vc.serviceNoun}. Keep it under 100 words, acknowledge they're busy, reiterate the value of a ${vc.offerName}. Plain text only. ${noSignature}`,
    3: `Write a short final follow-up email to ${firstName} at ${prospect.companyName}. ${senderInfo}${focusClause} This is the last outreach. Keep it under 80 words. Be direct but respectful, offer one last chance for a ${vc.offerName}, say you won't reach out again after this. Plain text only. ${noSignature}`,
  };

  return aiGenerate(prompts[step] ?? prompts[1]);
}

async function generateCalendlyEmail(
  prospect: { companyName: string; contactName: string },
  vc: VerticalConfig,
): Promise<string> {
  const firstName = prospect.contactName.split(" ")[0];
  const nextStepNoun = vc.key === "it_services" ? "their IT environment" : "their facility";
  return aiGenerate(
    `Write a short, warm, personal email to ${firstName} at ${prospect.companyName} who has shown interest in ${vc.serviceNoun}. Tell them the next step is simple: answer a few quick questions about ${nextStepNoun} and pick a time for a ${vc.offerName}, all on one page. Refer to the "Click here to schedule appointment" link that appears just below your message — do NOT write out any URL or web address yourself. Keep it under 80 words. Plain text only. End immediately after the call to action — do NOT add any sign-off, signature, or placeholder tokens; a signature is appended automatically.`
  );
}

export async function analyzeReplyTone(replyContent: string): Promise<"positive" | "negative" | "neutral"> {
  const result = await aiGenerate(
    `Classify this email reply tone as exactly one word: positive, negative, or neutral.\n\nReply: "${replyContent.slice(0, 500)}"\n\nAnswer with only one word:`
  );
  const tone = result.toLowerCase().trim();
  if (tone.includes("positive")) return "positive";
  if (tone.includes("negative")) return "negative";
  return "neutral";
}

const STEP_DELAYS_MS: Record<number, number> = {
  1: 0,
  2: 3 * 24 * 60 * 60 * 1000,
  3: 4 * 24 * 60 * 60 * 1000,
};

const DAY_MS = 24 * 60 * 60 * 1000;

interface CampaignSequenceStep {
  stepNumber: number; // 2..7 (step 1 is the intro)
  dayDelay: number;
  subject: string;
  body: string;
}

// Same format the Campaigns/Sequences pages use: callScript JSON with followUp1..followUp6.
function parseCampaignSequence(callScript?: string | null): CampaignSequenceStep[] {
  if (!callScript) return [];
  try {
    const data = JSON.parse(callScript);
    const keys = ["followUp1", "followUp2", "followUp3", "followUp4", "followUp5", "followUp6"] as const;
    const steps: CampaignSequenceStep[] = [];
    keys.forEach((key, idx) => {
      const s = data[key];
      if (s?.body && typeof s.body === "string" && s.body.trim()) {
        steps.push({
          stepNumber: idx + 2,
          dayDelay: typeof s.dayDelay === "number" && s.dayDelay > 0 ? s.dayDelay : 3,
          subject: typeof s.subject === "string" ? s.subject : "",
          body: s.body,
        });
      }
    });
    return steps;
  } catch {
    return [];
  }
}

function mergeTpl(tpl: string, prospect: { contactName?: string | null; companyName?: string | null; city?: string | null; state?: string | null; industry?: string | null }): string {
  return tpl
    .replace(/\{\{contactName\}\}/g, prospect.contactName ?? "")
    .replace(/\{\{companyName\}\}/g, prospect.companyName ?? "")
    .replace(/\{\{city\}\}/g, prospect.city ?? "")
    .replace(/\{\{state\}\}/g, prospect.state ?? "")
    .replace(/\{\{industry\}\}/g, prospect.industry ?? "");
}

export async function processAutopilotQueue(): Promise<void> {
  const now = new Date();

  const pending = await db
    .select()
    .from(autopilotEnrollmentsTable)
    .where(
      and(
        eq(autopilotEnrollmentsTable.status, "active"),
        lte(autopilotEnrollmentsTable.nextSendAt, now)
      )
    )
    .limit(20);

  for (const enrollment of pending) {
    try {
      const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, enrollment.prospectId));
      const [client] = await db.select().from(usersTable).where(eq(usersTable.id, enrollment.clientId));

      if (!prospect || !client || !client.outreachEmail) continue;

      if (prospect.optedOut) {
        await db.update(autopilotEnrollmentsTable)
          .set({ status: "unsubscribed" })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      // CAN-SPAM requires a valid physical postal address in every marketing email.
      // Refuse to send until the user supplies one (pauses, resumes once Settings is filled in).
      if (!client.businessAddress?.trim()) {
        await db.update(autopilotEnrollmentsTable)
          .set({ status: "paused", errorMessage: "Add your business mailing address in Settings — it's legally required (CAN-SPAM) before any emails can be sent." })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      const [campaign] = enrollment.campaignId
        ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, enrollment.campaignId))
        : [undefined];
      const sequence = parseCampaignSequence(campaign?.callScript);
      const totalSteps = sequence.length > 0 ? 1 + sequence.length : 3;

      const nextStep = enrollment.currentStep + 1;

      if (nextStep > totalSteps) {
        await db.update(autopilotEnrollmentsTable)
          .set({ status: "completed" })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      let subject: string;
      let coreBody: string;

      // Index-based: enrollment step 2 = first configured follow-up, step 3 = second, etc.
      // This keeps the cadence moving even if a middle follow-up was left blank.
      const vc = getVerticalConfig(client.vertical);
      const seqStep = nextStep >= 2 ? sequence[nextStep - 2] : undefined;
      if (seqStep) {
        // Use the campaign's configured follow-up script for this step.
        subject = mergeTpl(seqStep.subject, prospect) || vc.stepSubject(nextStep, prospect.companyName);
        coreBody = mergeTpl(seqStep.body, prospect);
      } else {
        // Intro email (step 1) or campaigns without a configured sequence: AI-generated.
        subject = vc.stepSubject(Math.min(nextStep, 3), prospect.companyName);
        coreBody = await generateStepEmail(Math.min(nextStep, 3), prospect, client.businessName ?? "our company", vc);
      }

      // Step-based collateral: intro flyer files on step 1 only; the step 3/5
      // case studies are delivered as TRACKED "View" links (not file attachments)
      // so we can record whether the prospect actually engaged with them.
      const caseStudy = nextStep === 3 ? client.step3CaseStudy : nextStep === 5 ? client.step5CaseStudy : null;
      const linkedFiles = caseStudy && typeof (caseStudy as any).path === "string" && typeof (caseStudy as any).name === "string"
        ? [{ name: (caseStudy as any).name as string, path: (caseStudy as any).path as string }]
        : [];
      const trackingToken = randomUUID();
      const composed = composeEmail(coreBody, client, prospect, undefined, { token: trackingToken, linkedFiles });

      const attachmentSource: unknown = nextStep === 1 ? client.attachments : null;
      const fileAttachments = await getClientEmailAttachments(attachmentSource, console);
      const resendId = await sendEmail({
        attachments: fileAttachments.length > 0 ? fileAttachments : undefined,
        fromName: client.businessName ?? client.outreachEmail,
        fromEmail: client.sendingEmail ?? undefined,
        replyTo: resolveReplyTo(client.outreachEmail, prospect.replyToken),
        to: prospect.email,
        subject,
        body: composed.text,
        html: composed.html,
        headers: unsubscribeHeaders(composed.unsubscribeApiUrl, client.outreachEmail),
      });

      const sentAt = new Date();
      const [emailRow] = await db.insert(emailsTable).values({
        clientId: enrollment.clientId,
        prospectId: prospect.id,
        campaignId: enrollment.campaignId,
        subject,
        body: composed.text,
        status: "sent",
        sentAt,
        trackingToken,
        resendId: resendId ?? null,
      }).returning();

      if (composed.trackedLinks.length > 0) {
        await db.insert(emailLinksTable).values(composed.trackedLinks.map(l => ({
          emailId: emailRow.id,
          clientId: enrollment.clientId,
          prospectId: prospect.id,
          kind: l.kind,
          slug: l.slug,
          name: l.name ?? null,
          destination: l.destination,
        })));
      }

      await db.insert(activityTable).values({
        clientId: enrollment.clientId,
        type: "email_sent",
        description: `[Autopilot] Email ${nextStep}/${totalSteps} sent to ${prospect.companyName}: ${subject}`,
        prospectId: prospect.id,
        prospectName: prospect.contactName,
      });

      const upcoming = sequence.length > 0
        ? sequence[nextStep - 1]
        : undefined;
      const nextDelay = sequence.length > 0
        ? (upcoming ? upcoming.dayDelay * DAY_MS : undefined)
        : STEP_DELAYS_MS[nextStep + 1];
      const nextSendAt = nextDelay !== undefined ? new Date(Date.now() + nextDelay) : null;
      const isDone = nextStep >= totalSteps;

      await db.update(autopilotEnrollmentsTable)
        .set({
          currentStep: nextStep,
          lastEmailSentAt: sentAt,
          nextSendAt: isDone ? null : nextSendAt,
          status: isDone ? "completed" : "active",
          errorMessage: null,
        })
        .where(eq(autopilotEnrollmentsTable.id, enrollment.id));

      await db.update(prospectsTable)
        .set({ lastContactedAt: sentAt, status: "contacted" })
        .where(eq(prospectsTable.id, prospect.id));

      if (enrollment.campaignId) {
        await db.update(campaignsTable)
          .set({ emailsSent: db.$count(emailsTable, and(eq(emailsTable.campaignId, enrollment.campaignId))) as any })
          .where(eq(campaignsTable.id, enrollment.campaignId));
      }

    } catch (err: any) {
      await db.update(autopilotEnrollmentsTable)
        .set({ errorMessage: err.message ?? "Unknown error", status: "paused" })
        .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
    }
  }

  const repliedEnrollments = await db
    .select()
    .from(autopilotEnrollmentsTable)
    .where(
      and(
        eq(autopilotEnrollmentsTable.status, "replied"),
        isNull(autopilotEnrollmentsTable.calendlyLinkSentAt)
      )
    )
    .limit(10);

  for (const enrollment of repliedEnrollments) {
    try {
      const tone = enrollment.replyTone ?? "neutral";
      if (tone !== "positive") continue;

      let [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, enrollment.prospectId));
      const [client] = await db.select().from(usersTable).where(eq(usersTable.id, enrollment.clientId));

      if (!prospect || !client || !client.outreachEmail || !client.calendlyUrl) continue;
      if (prospect.optedOut) {
        await db.update(autopilotEnrollmentsTable)
          .set({ status: "unsubscribed" })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      // CAN-SPAM requires a valid physical postal address in every marketing email.
      if (!client.businessAddress?.trim()) {
        await db.update(autopilotEnrollmentsTable)
          .set({ errorMessage: "Add your business mailing address in Settings — it's legally required (CAN-SPAM) before any emails can be sent." })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      // Ensure the prospect has all capability tokens before sending.
      // Each token is scoped to a single capability so that disclosing one
      // (e.g. unsubscribe link in email footer) does not grant access to others.
      const tokenUpdates: Record<string, string> = {};
      if (!prospect.scheduleToken) { const t = randomUUID(); tokenUpdates.scheduleToken = t; prospect = { ...prospect, scheduleToken: t }; }
      if (!prospect.unsubscribeToken) { const t = randomUUID(); tokenUpdates.unsubscribeToken = t; prospect = { ...prospect, unsubscribeToken: t }; }
      if (!prospect.replyToken) { const t = randomUUID(); tokenUpdates.replyToken = t; prospect = { ...prospect, replyToken: t }; }
      if (Object.keys(tokenUpdates).length > 0) {
        await db.update(prospectsTable).set(tokenUpdates).where(eq(prospectsTable.id, prospect.id));
      }

      const vc = getVerticalConfig(client.vertical);
      const scheduleUrl = `${getPublicAppUrl()}/app/schedule/${prospect.scheduleToken}`;
      const subject = vc.offerSubject(prospect.companyName);
      const coreBody = await generateCalendlyEmail(prospect, vc);
      const trackingToken = randomUUID();
      const composed = composeEmail(coreBody, client, prospect, {
        label: "Click here to schedule appointment",
        url: scheduleUrl,
      }, { token: trackingToken });

      // Atomically claim this enrollment BEFORE sending so a concurrent queue run
      // (the 5-min timer racing the inbound-reply trigger) can't double-send the
      // scheduling email. Only the run that flips calendlyLinkSentAt from NULL wins.
      const sentAt = new Date();
      const claimed = await db.update(autopilotEnrollmentsTable)
        .set({ calendlyLinkSentAt: sentAt, status: "calendly_sent" })
        .where(and(
          eq(autopilotEnrollmentsTable.id, enrollment.id),
          isNull(autopilotEnrollmentsTable.calendlyLinkSentAt),
        ))
        .returning();
      if (claimed.length === 0) continue;

      let calendlyResendId: string | undefined;
      try {
        calendlyResendId = await sendEmail({
          fromName: client.businessName ?? client.outreachEmail,
          fromEmail: client.sendingEmail ?? undefined,
          replyTo: resolveReplyTo(client.outreachEmail, prospect.replyToken),
          to: prospect.email,
          subject,
          body: composed.text,
          html: composed.html,
          headers: unsubscribeHeaders(composed.unsubscribeApiUrl, client.outreachEmail),
        });
      } catch (sendErr: any) {
        // Send failed — release the claim so a later run can retry.
        await db.update(autopilotEnrollmentsTable)
          .set({ calendlyLinkSentAt: null, status: "replied", errorMessage: sendErr?.message ?? "Send failed" })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      const [calendlyEmailRow] = await db.insert(emailsTable).values({
        clientId: enrollment.clientId,
        prospectId: prospect.id,
        campaignId: enrollment.campaignId,
        subject,
        body: composed.text,
        status: "sent",
        sentAt,
        trackingToken,
        resendId: calendlyResendId ?? null,
      }).returning();

      if (composed.trackedLinks.length > 0) {
        await db.insert(emailLinksTable).values(composed.trackedLinks.map(l => ({
          emailId: calendlyEmailRow.id,
          clientId: enrollment.clientId,
          prospectId: prospect.id,
          kind: l.kind,
          slug: l.slug,
          name: l.name ?? null,
          destination: l.destination,
        })));
      }

      await db.insert(activityTable).values({
        clientId: enrollment.clientId,
        type: "appointment_set",
        description: `[Autopilot] Calendly booking link sent to ${prospect.companyName}`,
        prospectId: prospect.id,
        prospectName: prospect.contactName,
      });

      await db.update(prospectsTable)
        .set({ status: "appointment_requested" })
        .where(eq(prospectsTable.id, prospect.id));

    } catch (err: any) {
      await db.update(autopilotEnrollmentsTable)
        .set({ errorMessage: err.message ?? "Unknown error" })
        .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
    }
  }
}

export function startAutopilotEngine(logger: { info: (msg: string) => void; error: (msg: string, data?: any) => void }): void {
  const INTERVAL_MS = 5 * 60 * 1000;

  const run = async () => {
    try {
      await processAutopilotQueue();
    } catch (err: any) {
      logger.error("Autopilot engine error", { err: err.message });
    }
    try {
      await processEngagementAutomation();
    } catch (err: any) {
      logger.error("Engagement automation error", { err: err.message });
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
  logger.info("Autopilot engine started (5-min interval)");
}

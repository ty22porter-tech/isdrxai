import { db, autopilotEnrollmentsTable, prospectsTable, campaignsTable, usersTable, emailsTable, activityTable } from "@workspace/db";
import { eq, and, lte, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendEmail } from "./emailSender";
import { composeEmail, unsubscribeHeaders } from "./emailCompose";
import { getPublicAppUrl } from "./publicUrl";
import { resolveReplyTo } from "./inboundAddressing";

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

function stepSubject(step: number, companyName: string, prevSubject?: string): string {
  if (step === 1) return `Quick question about ${companyName}'s cleaning needs`;
  if (step === 2) return `Re: Quick question about ${companyName}'s cleaning needs`;
  return `Last follow-up — ${companyName}`;
}

async function generateStepEmail(
  step: number,
  prospect: { companyName: string; contactName: string; industry: string; city: string; state: string; squareFootage?: number | null; employeeCount?: number | null },
  senderBusinessName: string,
): Promise<string> {
  const firstName = prospect.contactName.split(" ")[0];
  const size = prospect.squareFootage ? `${prospect.squareFootage.toLocaleString()} sq ft` : "";
  const employees = prospect.employeeCount ? `${prospect.employeeCount} employees` : "";
  const details = [size, employees].filter(Boolean).join(", ");

  const senderInfo = `The sender's company is "${senderBusinessName}".`;
  const noSignature = `End the email immediately after the call to action. Do NOT add any sign-off, signature, sender name, company name line, phone number, email address, or placeholder tokens like [Your Name] or [Your Company] — a signature is appended automatically afterward.`;

  const prompts: Record<number, string> = {
    1: `Write a short, professional cold email from a commercial janitorial company to ${firstName} at ${prospect.companyName} (${prospect.industry} in ${prospect.city}, ${prospect.state}${details ? `, ${details}` : ""}). ${senderInfo} The email should mention their industry's specific cleaning needs, offer a free walkthrough, and end with a clear call to action. Keep it under 150 words. No subject line. Plain text only. ${noSignature}`,
    2: `Write a brief, friendly follow-up cold email to ${firstName} at ${prospect.companyName}. ${senderInfo} Reference a previous unanswered email about commercial cleaning services. Keep it under 100 words, acknowledge they're busy, reiterate the value of a free walkthrough. Plain text only. ${noSignature}`,
    3: `Write a short final follow-up email to ${firstName} at ${prospect.companyName}. ${senderInfo} This is the last outreach. Keep it under 80 words. Be direct but respectful, offer one last chance for a free walkthrough, say you won't reach out again after this. Plain text only. ${noSignature}`,
  };

  return aiGenerate(prompts[step] ?? prompts[1]);
}

async function generateCalendlyEmail(
  prospect: { companyName: string; contactName: string },
  scheduleUrl: string,
): Promise<string> {
  const firstName = prospect.contactName.split(" ")[0];
  return aiGenerate(
    `Write a short, warm email to ${firstName} at ${prospect.companyName} who has shown interest in commercial cleaning services. Tell them the next step is to answer a few quick questions about their facility and pick a time for a free 15-minute walkthrough — all on one page using this link: ${scheduleUrl}. Keep it under 90 words. Include the link naturally in the text. Plain text only. End immediately after the call to action — do NOT add any sign-off, signature, or placeholder tokens; a signature is appended automatically.`
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

      const nextStep = enrollment.currentStep + 1;

      if (nextStep > 3) {
        await db.update(autopilotEnrollmentsTable)
          .set({ status: "completed" })
          .where(eq(autopilotEnrollmentsTable.id, enrollment.id));
        continue;
      }

      const subject = stepSubject(nextStep, prospect.companyName);
      const coreBody = await generateStepEmail(nextStep, prospect, client.businessName ?? "our company");
      const composed = composeEmail(coreBody, client, prospect);

      await sendEmail({
        fromName: client.businessName ?? client.outreachEmail,
        replyTo: resolveReplyTo(client.outreachEmail, prospect.scheduleToken),
        to: prospect.email,
        subject,
        body: composed.text,
        html: composed.html,
        headers: unsubscribeHeaders(composed.unsubscribeApiUrl, client.outreachEmail),
      });

      const sentAt = new Date();
      await db.insert(emailsTable).values({
        clientId: enrollment.clientId,
        prospectId: prospect.id,
        campaignId: enrollment.campaignId,
        subject,
        body: composed.text,
        status: "sent",
        sentAt,
      });

      await db.insert(activityTable).values({
        clientId: enrollment.clientId,
        type: "email_sent",
        description: `[Autopilot] Email ${nextStep}/3 sent to ${prospect.companyName}: ${subject}`,
        prospectId: prospect.id,
        prospectName: prospect.contactName,
      });

      const nextDelay = STEP_DELAYS_MS[nextStep + 1];
      const nextSendAt = nextDelay !== undefined ? new Date(Date.now() + nextDelay) : null;
      const newStatus = nextStep >= 3 ? "completed" : "active";

      await db.update(autopilotEnrollmentsTable)
        .set({
          currentStep: nextStep,
          lastEmailSentAt: sentAt,
          nextSendAt,
          status: nextStep >= 3 ? "completed" : "active",
          errorMessage: null,
        })
        .where(eq(autopilotEnrollmentsTable.id, enrollment.id));

      await db.update(prospectsTable)
        .set({ lastContactedAt: sentAt, status: "contacted" })
        .where(eq(prospectsTable.id, prospect.id));

      await db.update(campaignsTable)
        .set({ emailsSent: db.$count(emailsTable, and(eq(emailsTable.campaignId, enrollment.campaignId))) as any })
        .where(eq(campaignsTable.id, enrollment.campaignId));

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

      // Ensure the prospect has a scheduling token so the public link works.
      if (!prospect.scheduleToken) {
        const newToken = randomUUID();
        await db.update(prospectsTable)
          .set({ scheduleToken: newToken })
          .where(eq(prospectsTable.id, prospect.id));
        prospect = { ...prospect, scheduleToken: newToken };
      }

      const scheduleUrl = `${getPublicAppUrl()}/schedule/${prospect.scheduleToken}`;
      const subject = `Let's schedule a walkthrough — ${prospect.companyName}`;
      const coreBody = await generateCalendlyEmail(prospect, scheduleUrl);
      const composed = composeEmail(coreBody, client, prospect);

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

      try {
        await sendEmail({
          fromName: client.businessName ?? client.outreachEmail,
          replyTo: resolveReplyTo(client.outreachEmail, prospect.scheduleToken),
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

      await db.insert(emailsTable).values({
        clientId: enrollment.clientId,
        prospectId: prospect.id,
        campaignId: enrollment.campaignId,
        subject,
        body: composed.text,
        status: "sent",
        sentAt,
      });

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
  };

  run();
  setInterval(run, INTERVAL_MS);
  logger.info("Autopilot engine started (5-min interval)");
}

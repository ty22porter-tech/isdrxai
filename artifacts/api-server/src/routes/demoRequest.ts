import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { conversionEventsTable, db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "../lib/emailSender";
import { logger } from "../lib/logger";
import { identifyActivityLead, activityCookieHash } from "../lib/visitorActivity";

// Public demo-request endpoint: visitors on the marketing landing page submit
// this form; we notify the iSDRX team inbox and set Reply-To to the visitor so
// the team can respond directly from their mail client.
const DEMO_INBOX = "info@isdrxai.com";

// Header-bound fields (subject line) must never contain CR/LF or other
// control characters — that would allow email header injection.
const noControlChars = (s: string) => !/[\r\n\x00-\x1f\x7f]/.test(s);

const DemoRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).refine(noControlChars, "invalid characters"),
  company: z.string().trim().min(1).max(200).refine(noControlChars, "invalid characters"),
  email: z.string().trim().email().max(320).refine(noControlChars, "invalid characters"),
  phone: z.string().trim().max(50).optional().default(""),
  industry: z.enum(["trade-services", "janitorial", "it-services", "other"]).optional().default("other"),
  message: z.string().trim().max(2000).optional().default(""),
  // Honeypot: real users never fill this hidden field; bots do.
  website: z.string().max(500).optional().default(""),
  activityConsent: z.boolean().optional().default(false),
  visitorId: z.string().uuid().optional(),
  sourceLocation: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/).optional().default("book_demo_page"),
});

const INDUSTRY_LABELS: Record<string, string> = {
  "trade-services": "Commercial Trade Services",
  janitorial: "Janitorial / Commercial Cleaning",
  "it-services": "IT Services / MSP",
  other: "Other",
};

// Rate limiting. The per-IP key comes from X-Forwarded-For, which a direct
// attacker can spoof — so a GLOBAL cap is the real backstop bounding total
// notification volume regardless of how many fake IPs are presented.
const submissions = new Map<string, number[]>();
const globalSubmissions: number[] = [];
const PER_IP_LIMIT = 5;          // per 10 minutes
const GLOBAL_LIMIT = 30;         // per hour, across all senders
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  while (globalSubmissions.length && now - globalSubmissions[0] > 60 * 60 * 1000) globalSubmissions.shift();
  if (globalSubmissions.length >= GLOBAL_LIMIT) return true;
  const recent = (submissions.get(ip) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  submissions.set(ip, recent);
  if (recent.length >= PER_IP_LIMIT) return true;
  recent.push(now);
  globalSubmissions.push(now);
  return false;
}

export const demoRequestRouter = Router();

demoRequestRouter.post("/", async (req, res) => {
  const parsed = DemoRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Please fill in your name, company, and a valid email address." });
  }
  const data = parsed.data;

  // Honeypot tripped: pretend success so bots don't adapt.
  if (data.website !== "") return res.json({ ok: true });

  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() || req.ip || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: "Too many requests. Please try again in a few minutes." });
  }

  const lines = [
    `New demo request from the iSDRX AI website:`,
    ``,
    `Name: ${data.name}`,
    `Company: ${data.company}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone || "(not provided)"}`,
    `Industry: ${INDUSTRY_LABELS[data.industry] ?? data.industry}`,
    ``,
    `Message:`,
    data.message || "(none)",
    ``,
    `Reply to this email to respond directly to ${data.name}.`,
  ];

  try {
    await sendEmail({
      fromName: "iSDRX AI Website",
      replyTo: data.email,
      to: DEMO_INBOX,
      subject: `Demo request: ${data.name} at ${data.company}`,
      body: lines.join("\n"),
    });
  } catch (err) {
    logger.error({ err }, "Demo-request notification email failed");
    return res.status(502).json({ ok: false, error: "We couldn't submit your request right now. Please email info@isdrxai.com directly." });
  }

  const completionId = randomUUID();
  try { if (data.activityConsent) await identifyActivityLead(req, data, "book_demo"); }
  catch { req.log.warn("Optional demo visitor attribution failed"); }
  try {
    await db.insert(conversionEventsTable).values({
      eventType: "demo_completed",
      intent: "book_demo",
      location: data.sourceLocation,
      visitorId: data.visitorId,
      sourceKey: `demo:${completionId}`,
      metadata: data.activityConsent && activityCookieHash(req)
        ? { activitySessionHash: activityCookieHash(req)! } : {},
    });

    const admins = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.isAdmin, true));

    for (const admin of admins) {
      await db
        .insert(notificationsTable)
        .values({
          clientId: admin.id,
          sourceKey: `demo-request:${completionId}:${admin.id}`,
          type: "demo_request",
          title: `New demo request from ${data.company}`,
          body: `${data.name} requested a demo. Contact: ${data.email}${data.phone ? ` or ${data.phone}` : ""}.`,
        })
        .onConflictDoNothing({ target: notificationsTable.sourceKey });

      const adminEmail = admin.email?.trim().toLowerCase();
      if (adminEmail && adminEmail !== DEMO_INBOX) {
        sendEmail({
          fromName: "iSDRX AI Website",
          replyTo: data.email,
          to: adminEmail,
          subject: `Demo request: ${data.name} at ${data.company}`,
          body: lines.join("\n"),
        }).catch((err) =>
          logger.error({ err, adminId: admin.id }, "Additional admin demo-request email failed"),
        );
      }
    }
  } catch (err) {
    // The visitor already received a successful form response path because the
    // primary inbox notification was sent. Record the reporting failure without
    // asking them to submit again and risk a duplicate lead.
    logger.error({ err }, "Demo request delivered, but admin reporting failed");
  }

  return res.json({ ok: true });
});

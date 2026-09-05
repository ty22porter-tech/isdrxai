import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "../lib/emailSender";
import { logger } from "../lib/logger";

const INBOX = "info@isdrxai.com";
const noHeaderControls = (value: string) => !/[\x00-\x1f\x7f]/.test(value);
const noUnsafeMessageControls = (value: string) =>
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const cleanHeader = (min: number, max: number) =>
  z.string().trim().min(min).max(max).refine(noHeaderControls, "invalid characters");

export const ContactUsSchema = z.object({
  firstName: cleanHeader(1, 100),
  lastName: cleanHeader(1, 100),
  company: z.string().trim().max(200).refine(noHeaderControls, "invalid characters").optional().default(""),
  email: z.string().trim().email().max(320).refine(noHeaderControls, "invalid characters"),
  phone: cleanHeader(1, 50),
  message: z.string().trim().max(2000).refine(noUnsafeMessageControls, "invalid characters").optional().default(""),
  website: z.string().max(500).optional().default(""),
});

export const UnansweredQuestionSchema = z.object({
  email: z.string().trim().email().max(320).refine(noHeaderControls, "invalid characters"),
  question: z.string().trim().min(1).max(2000).refine(noUnsafeMessageControls, "invalid characters"),
  website: z.string().max(500).optional().default(""),
});

const byIp = new Map<string, number[]>();
const allSubmissions: number[] = [];
const MAX_TRACKED_IPS = 1_000;

function limited(ip: string): boolean {
  const now = Date.now();
  while (allSubmissions[0] && now - allSubmissions[0] > 60 * 60 * 1000) {
    allSubmissions.shift();
  }
  if (allSubmissions.length >= 30) return true;

  for (const [key, times] of byIp) {
    const recent = times.filter((time) => now - time < 10 * 60 * 1000);
    if (recent.length) byIp.set(key, recent);
    else byIp.delete(key);
  }

  const recent = byIp.get(ip) ?? [];
  if (recent.length >= 5) return true;
  if (!byIp.has(ip) && byIp.size >= MAX_TRACKED_IPS) return true;

  recent.push(now);
  byIp.set(ip, recent);
  allSubmissions.push(now);
  return false;
}

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const withHtmlLineBreaks = (value: string) =>
  escapeHtml(value).replace(/\r?\n/g, "<br>");

export const contactUsRouter = Router();

contactUsRouter.post("/unanswered-question", async (req, res) => {
  const parsed = UnansweredQuestionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Please enter a valid email address and your question.",
    });
  }

  const data = parsed.data;
  if (data.website !== "") return res.json({ ok: true });

  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  const ip = forwarded && /^[0-9a-f:.]{2,64}$/i.test(forwarded)
    ? forwarded
    : (req.ip || "unknown").slice(0, 64);
  if (limited(ip)) {
    return res.status(429).json({
      ok: false,
      error: "Too many requests. Please try again in a few minutes.",
    });
  }

  const requestId = randomUUID();
  const text = `New unanswered website question\n\nEmail: ${data.email}\n\nQuestion:\n${data.question}`;
  const internalHtml = [
    "<p><strong>New unanswered website question from Trey</strong></p>",
    `<p><strong>Email:</strong> ${escapeHtml(data.email)}</p>`,
    `<p><strong>Question:</strong></p><blockquote>${withHtmlLineBreaks(data.question)}</blockquote>`,
  ].join("");

  try {
    await sendEmail({
      fromName: "iSDRX AI Website",
      replyTo: data.email,
      to: INBOX,
      subject: "Unanswered website question",
      body: text,
      html: internalHtml,
    });
  } catch {
    logger.error({ requestId, stage: "internal_email" }, "Unanswered-question delivery failed");
    return res.status(502).json({
      ok: false,
      error: "We couldn't submit your question right now. Please email info@isdrxai.com directly.",
    });
  }

  try {
    await sendEmail({
      fromName: "iSDRX AI",
      replyTo: INBOX,
      to: data.email,
      subject: "We received your question",
      body: `Thank you! Your question has been submitted. A member of the iSDRX AI team will contact you by email as soon as possible.\n\nYour question:\n${data.question}`,
      html: `<p>Thank you! Your question has been submitted. A member of the iSDRX AI team will contact you by email as soon as possible.</p><p><strong>Your question:</strong></p><blockquote>${withHtmlLineBreaks(data.question)}</blockquote>`,
    });
  } catch {
    // The question already reached the team. Do not ask the visitor to submit
    // again and risk a duplicate.
    logger.error({ requestId, stage: "acknowledgement_email" }, "Unanswered-question acknowledgement failed");
  }

  void (async () => {
    try {
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isAdmin, true));
      await Promise.all(admins.map((admin) => db.insert(notificationsTable).values({
        clientId: admin.id,
        sourceKey: `unanswered-question:${requestId}:${admin.id}`,
        type: "demo_request",
        title: "New question for Trey",
        body: `A website visitor submitted a question for follow-up. Contact: ${data.email}.`,
      }).onConflictDoNothing({ target: notificationsTable.sourceKey })));
    } catch {
      logger.error({ requestId, stage: "admin_notification" }, "Unanswered-question admin notification failed");
    }
  })();

  return res.json({ ok: true });
});

contactUsRouter.post("/", async (req, res) => {
  const parsed = ContactUsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "Please complete all required fields with valid information." });
  const data = parsed.data;
  if (data.website !== "") return res.json({ ok: true });

  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  const ip = forwarded && /^[0-9a-f:.]{2,64}$/i.test(forwarded)
    ? forwarded
    : (req.ip || "unknown").slice(0, 64);
  if (limited(ip)) return res.status(429).json({ ok: false, error: "Too many requests. Please try again in a few minutes." });

  const requestId = randomUUID();
  const name = `${data.firstName} ${data.lastName}`;
  const submittedMessage = data.message || "(No message provided)";
  const text = `New AI+ contact request\n\nName: ${name}\nCompany: ${data.company || "(not provided)"}\nEmail: ${data.email}\nPhone: ${data.phone}\n\nMessage:\n${submittedMessage}`;
  const internalHtml = [
    "<p><strong>New AI+ contact request</strong></p>",
    `<p><strong>Name:</strong> ${escapeHtml(name)}<br>`,
    `<strong>Company:</strong> ${escapeHtml(data.company || "(not provided)")}<br>`,
    `<strong>Email:</strong> ${escapeHtml(data.email)}<br>`,
    `<strong>Phone:</strong> ${escapeHtml(data.phone)}</p>`,
    `<p><strong>Message:</strong></p><blockquote>${withHtmlLineBreaks(submittedMessage)}</blockquote>`,
  ].join("");

  try {
    await sendEmail({
      fromName: "iSDRX AI Website",
      replyTo: data.email,
      to: INBOX,
      subject: `AI+ contact request: ${name}`,
      body: text,
      html: internalHtml,
    });
  } catch {
    logger.error({ requestId, stage: "internal_email" }, "Contact-us delivery failed");
    return res.status(502).json({ ok: false, error: "We couldn't submit your request right now. Please email info@isdrxai.com directly." });
  }

  try {
    await sendEmail({
      fromName: "iSDRX AI",
      replyTo: INBOX,
      to: data.email,
      subject: "We received your iSDRX AI request",
      body: `Thank you, ${name}.\n\nWe received your request. An agent will contact you to follow up on your message.\n\nYour message:\n${submittedMessage}`,
      html: `<p>Thank you, ${escapeHtml(name)}.</p><p>We received your request. An agent will contact you to follow up on your message.</p><p><strong>Your message:</strong></p><blockquote>${withHtmlLineBreaks(submittedMessage)}</blockquote>`,
    });
  } catch {
    // The request already reached the sales inbox. Never ask the visitor to
    // resubmit and risk creating a duplicate internal lead.
    logger.error({ requestId, stage: "acknowledgement_email" }, "Contact-us acknowledgement failed");
  }

  // Notifications mirror the existing demo-request behavior, but are deliberately
  // non-blocking: email delivery is the visitor-facing source of truth.
  void (async () => {
    try {
      const admins = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.isAdmin, true));
      await Promise.all(admins.map((admin) => db.insert(notificationsTable).values({
        clientId: admin.id,
        sourceKey: `contact-us:${requestId}:${admin.id}`,
        type: "demo_request",
        title: "New AI+ contact request",
        body: `${name} requested information about AI+. Contact: ${data.email} or ${data.phone}.`,
      }).onConflictDoNothing({ target: notificationsTable.sourceKey })));
    } catch {
      logger.error({ requestId, stage: "admin_notification" }, "Contact-us admin notification failed");
    }
  })();

  return res.json({ ok: true });
});
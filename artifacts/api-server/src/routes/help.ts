import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { answerHelp, SUPPORT_CONFIRMATION, SUPPORT_INBOX } from "../lib/helpKnowledge";
import { sendEmail } from "../lib/emailSender";

export const helpRouter = Router();
// Help and billing support remain available to signed-in users without a paid entitlement.
helpRouter.use((req, res, next) => {
  const id = getAuth(req)?.userId;
  if (!id) return res.status(401).json({ error: "Sign in to ask for app help." });
  res.locals.helpUserId = id;
  return next();
});
const safeText = (s: string) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
const question = z.string().trim().min(3).max(2000).refine(safeText);
const page = z.string().trim().max(80).regex(/^[a-zA-Z &/-]*$/).default("Help & Training");
export const helpQuestionSchema = z.object({ question, page });
export const helpSupportSchema = helpQuestionSchema.extend({
  email: z.string().trim().email().max(320).refine(s => !/[\r\n]/.test(s)), requestKey: z.string().uuid(),
});
const limits = new Map<string, { times: number[]; touched: number }>();
function limited(id: string, kind: string, cap: number, windowMs: number) {
  const now = Date.now();
  for (const [key, entry] of limits) if (now - entry.touched > 3600000) limits.delete(key);
  const key = `${kind}:${id}`;
  const times = (limits.get(key)?.times ?? []).filter(t => now - t < windowMs);
  if (times.length >= cap || (!limits.has(key) && limits.size >= 2000)) return true;
  limits.set(key, { times: [...times, now], touched: now });
  return false;
}
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

helpRouter.post("/answer", async (req, res) => {
  const parsed = helpQuestionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a question between 3 and 2,000 characters." });
  if (limited(res.locals.helpUserId, "answer", 10, 600000)) return res.status(429).json({ error: "Please wait a few minutes before asking another question. You can still contact support." });
  return res.json(await answerHelp(parsed.data.question, parsed.data.page));
});

helpRouter.post("/support", async (req, res) => {
  const parsed = helpSupportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid reply email and a question between 3 and 2,000 characters." });
  if (limited(res.locals.helpUserId, "support", 3, 3600000)) return res.status(429).json({ error: `Please wait before submitting again, or email ${SUPPORT_INBOX} directly.` });
  const { email, question, page, requestKey } = parsed.data;
  const body = `App support question\nReference: ${requestKey}\nAccount: ${res.locals.helpUserId}\nReply email: ${email}\nApp section: ${page}\n\nQuestion:\n${question}`;
  try {
    const id = await sendEmail({ fromName: "iSDRX AI Support", to: SUPPORT_INBOX, replyTo: email,
      subject: "iSDRX AI app support question", body, html: `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escape(body)}</pre>`,
      idempotencyKey: `app-help:${res.locals.helpUserId}:${requestKey}`,
    });
    if (!id) throw new Error("No provider acknowledgement");
    return res.json({ ok: true, message: SUPPORT_CONFIRMATION, reference: requestKey });
  } catch {
    req.log?.error({ reference: requestKey }, "App support email delivery failed");
    return res.status(502).json({ error: `We couldn’t confirm your question was sent. Please retry, or email ${SUPPORT_INBOX} directly.` });
  }
});

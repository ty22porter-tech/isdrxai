import { Router } from "express";
import { z } from "zod";
import { db, conversionEventsTable } from "@workspace/db";

const ConversionClickSchema = z.object({
  eventId: z.string().uuid(),
  intent: z.enum(["book_demo", "start_trial", "buy_now", "get_started"]),
  location: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/),
  visitorId: z.string().uuid(),
});

const requestsByIp = new Map<string, number[]>();
const PER_IP_LIMIT = 120;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) ?? []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= PER_IP_LIMIT) {
    requestsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

export const conversionEventsRouter = Router();

conversionEventsRouter.post("/", async (req, res) => {
  const parsed = ConversionClickSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false });
  }

  const data = parsed.data;
  await db
    .insert(conversionEventsTable)
    .values({
      eventType: "cta_click",
      intent: data.intent,
      location: data.location,
      visitorId: data.visitorId,
      sourceKey: `cta:${data.eventId}`,
    })
    .onConflictDoNothing({ target: conversionEventsTable.sourceKey });

  return res.json({ ok: true });
});
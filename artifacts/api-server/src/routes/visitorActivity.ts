import { Router } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ActivityInput, grantActivityConsent, recordVisitorActivity, revokeActivityConsent } from "../lib/visitorActivity";

export const visitorActivityRouter = Router();
const counts = new Map<string, { count: number; until: number }>();
visitorActivityRouter.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.get("origin");
  try {
    if (!origin || new URL(origin).host !== req.get("host")) {
      res.status(403).json({ error: "Invalid request origin." }); return;
    }
  } catch { res.status(403).json({ error: "Invalid request origin." }); return; }
  // Bound process-local abuse controls, without persisting IP addresses.
  const now = Date.now();
  for (const [key, value] of counts) if (value.until < now) counts.delete(key);
  const key = req.ip ?? "unknown";
  const counter = counts.get(key) ?? { count: 0, until: now + 60000 };
  if (counter.count++ >= 120 || counts.size >= 10000) {
    res.status(429).json({ error: "Please retry shortly." }); return;
  }
  counts.set(key, counter);
  next();
});

async function knownUserId(req: Parameters<typeof getAuth>[0]) {
  const userId = getAuth(req).userId;
  if (!userId) return null;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.id ?? null;
}
visitorActivityRouter.post("/consent", async (req, res): Promise<void> => {
  const parsed = z.object({ allow: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid consent choice." }); return; }
  if (!parsed.data.allow) await revokeActivityConsent(req, res);
  else {
    if (req.get("Sec-GPC") === "1") {
      await revokeActivityConsent(req, res);
      res.status(403).json({ error: "Your browser privacy preference disables identified activity tracking." }); return;
    }
    await grantActivityConsent(req, res, await knownUserId(req));
  }
  res.json({ ok: true });
});
visitorActivityRouter.post("/", async (req, res): Promise<void> => {
  const parsed = ActivityInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid activity." }); return; }
  if (req.get("Sec-GPC") === "1") { await revokeActivityConsent(req, res); res.status(204).end(); return; }
  await recordVisitorActivity(req, res, await knownUserId(req), parsed.data);
  res.json({ ok: true });
});
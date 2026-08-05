import { Router } from "express";
import { db, videoViewsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";

const router = Router();

router.post("/", async (req, res) => {
  const { clientId, ref, event } = req.body;
  if (!clientId || !ref || !event) {
    return res.status(400).json({ error: "Missing required fields: clientId, ref, event" });
  }
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? null;
  const userAgent = (req.headers["user-agent"] as string) ?? null;
  await db.insert(videoViewsTable).values({ clientId, ref: String(ref), event: String(event), ip, userAgent });
  return res.json({ ok: true });
});

router.get("/", requireAuth, async (req, res) => {
  const views = await db
    .select()
    .from(videoViewsTable)
    .where(eq(videoViewsTable.clientId, req.clientId))
    .orderBy(desc(videoViewsTable.createdAt));
  res.json({ views });
});

export default router;

import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const rows = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.clientId, req.clientId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.clientId, req.clientId), isNull(notificationsTable.readAt)));
  res.json({
    unread,
    notifications: rows.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      prospectId: n.prospectId,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

router.post("/:id/read", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.clientId, req.clientId), isNull(notificationsTable.readAt)));
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await db.update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.clientId, req.clientId), isNull(notificationsTable.readAt)));
  res.json({ ok: true });
});

export default router;

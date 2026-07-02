import { Router } from "express";
import { db, usersTable, prospectsTable, emailsTable, callsTable, appointmentsTable, videoViewsTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get("/clients", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const clients = await Promise.all(users.map(async (user) => {
    const [prospects] = await db.select({ count: count() }).from(prospectsTable).where(eq(prospectsTable.clientId, user.id));
    const [emails] = await db.select({ count: count() }).from(emailsTable).where(eq(emailsTable.clientId, user.id));
    const [calls] = await db.select({ count: count() }).from(callsTable).where(eq(callsTable.clientId, user.id));
    const [appointments] = await db.select({ count: count() }).from(appointmentsTable).where(eq(appointmentsTable.clientId, user.id));
    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      stats: {
        prospects: prospects.count,
        emails: emails.count,
        calls: calls.count,
        appointments: appointments.count,
      },
    };
  }));
  res.json({ clients });
});

router.patch("/clients/:id", async (req, res) => {
  const { id } = req.params;
  const { status, isAdmin, sendingEmail } = req.body;
  const update: Record<string, any> = {};
  if (status) update.status = status;
  if (typeof isAdmin === "boolean") update.isAdmin = isAdmin;
  // Admin-managed per-client sending address (the authenticated From: domain
  // provisioned for that client during onboarding). Empty string clears it,
  // reverting the client to the shared platform sending domain.
  if (typeof sendingEmail === "string") {
    const trimmed = sendingEmail.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ error: "Invalid sending email address" });
    }
    update.sendingEmail = trimmed || null;
  }
  const [user] = await db.update(usersTable).set(update).where(eq(usersTable.id, id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ ...user, createdAt: user.createdAt.toISOString() });
});

router.get("/video-views", async (_req, res) => {
  const views = await db
    .select()
    .from(videoViewsTable)
    .orderBy(desc(videoViewsTable.createdAt))
    .limit(500);
  res.json({ views });
});

export default router;

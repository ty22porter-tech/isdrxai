import { Router } from "express";
import { db, usersTable, trialCodesTable } from "@workspace/db";
import { and, eq, isNull, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/requireAuth";

const router = Router();
router.use(requireAuth);

// Excludes ambiguous characters (0/O, 1/I/L) for easy manual entry.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `TRIAL-${s}`;
}

function trialEndDate(trialDays: number, now: Date): Date {
  return trialDays === 0
    ? new Date("2999-12-31T00:00:00Z")
    : new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
}

async function generateUniqueCode(
  values: { label: string | null; trialDays: number; createdBy: string },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const inserted = await db
      .insert(trialCodesTable)
      .values({ code, ...values })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) return inserted[0];
  }
  return null;
}

// Client: redeem a trial code to unlock a free trial (no card required).
router.post("/redeem", async (req, res) => {
  const code = String(req.body?.code ?? "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "code_required", message: "Please enter a trial code." });

  const user = req.dbUser;
  if (user.status === "active") {
    return res.status(400).json({ error: "already_active", message: "Your subscription is already active — no trial code needed." });
  }
  // One free trial per client: once a trial has been granted, they must subscribe.
  if (user.trialEndsAt) {
    return res.status(400).json({ error: "trial_already_used", message: "You've already used a free trial. Please subscribe to continue." });
  }

  const [tc] = await db.select().from(trialCodesTable).where(eq(trialCodesTable.code, code));
  if (!tc) return res.status(404).json({ error: "invalid_code", message: "That code isn't valid." });
  if (tc.redeemedBy) return res.status(409).json({ error: "already_redeemed", message: "That code has already been used." });

  const now = new Date();
  // trialDays === 0 means the code never expires (used for internal live testing).
  const trialEndsAt = trialEndDate(tc.trialDays, now);

  // Claim the code and grant the trial atomically. The claim's WHERE only matches
  // while the code is still unredeemed, so two clients racing on the same code
  // cannot both win; if the claim loses the race the whole transaction rolls back.
  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(trialCodesTable)
        .set({ redeemedBy: user.id, redeemedAt: now })
        .where(and(eq(trialCodesTable.code, code), isNull(trialCodesTable.redeemedBy)))
        .returning();
      if (claimed.length === 0) throw new Error("already_redeemed");
      await tx.update(usersTable).set({ trialEndsAt }).where(eq(usersTable.id, user.id));
    });
  } catch (err) {
    if (err instanceof Error && err.message === "already_redeemed") {
      return res.status(409).json({ error: "already_redeemed", message: "That code has already been used." });
    }
    throw err;
  }

  return res.json({ ok: true, trialEndsAt: trialEndsAt.toISOString(), trialDays: tc.trialDays });
});

// Admin: list all trial codes (newest first).
router.get("/", requireAdmin, async (_req, res) => {
  const codes = await db.select().from(trialCodesTable).orderBy(desc(trialCodesTable.createdAt));
  res.json({
    codes: codes.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      redeemedAt: c.redeemedAt ? c.redeemedAt.toISOString() : null,
    })),
  });
});

// Admin: generate a new unique trial code.
router.post("/", requireAdmin, async (req, res) => {
  const label = typeof req.body?.label === "string" ? req.body.label.trim() || null : null;
  let trialDays = Number(req.body?.trialDays);
  if (trialDays === 0) {
    // 0 = unlimited (never expires) — admin-only option for live testing.
  } else {
    if (!Number.isFinite(trialDays) || trialDays < 1) trialDays = 14;
    trialDays = Math.min(Math.floor(trialDays), 365);
  }

  const c = await generateUniqueCode({ label, trialDays, createdBy: req.clientId });
  if (c) {
    return res.json({ ...c, createdAt: c.createdAt.toISOString(), redeemedAt: null });
  }
  return res.status(500).json({ error: "generate_failed", message: "Couldn't generate a unique code, please try again." });
});

// Admin: grant an additional trial directly. This intentionally bypasses the
// one-trial-per-client redemption rule while retaining a redeemed code as the audit record.
router.post("/grant", requireAdmin, async (req, res) => {
  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  if (!clientId) {
    return res.status(400).json({ error: "client_required", message: "Select a client." });
  }

  let trialDays = Number(req.body?.trialDays);
  if (trialDays !== 0) {
    if (!Number.isFinite(trialDays) || trialDays < 1) {
      return res.status(400).json({ error: "invalid_trial_days", message: "Trial days must be at least 1, or 0 for unlimited." });
    }
    trialDays = Math.min(Math.floor(trialDays), 365);
  }

  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, clientId));
  if (!client) {
    return res.status(404).json({ error: "client_not_found", message: "Client not found." });
  }
  if (client.isAdmin) {
    return res.status(400).json({ error: "admin_account", message: "Trial access cannot be granted to an admin account." });
  }
  if (client.status === "active") {
    return res.status(409).json({ error: "already_active", message: "This client already has an active subscription." });
  }

  const now = new Date();
  const trialEndsAt = trialEndDate(trialDays, now);
  const label = `Admin grant: ${client.businessName || client.email || client.id}`;
  const code = await generateUniqueCode({ label, trialDays, createdBy: req.clientId });
  if (!code) {
    return res.status(500).json({ error: "generate_failed", message: "Couldn't record the trial grant, please try again." });
  }

  try {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(trialCodesTable)
        .set({ redeemedBy: client.id, redeemedAt: now })
        .where(and(eq(trialCodesTable.code, code.code), isNull(trialCodesTable.redeemedBy)))
        .returning();
      if (claimed.length === 0) throw new Error("grant_conflict");
      await tx
        .update(usersTable)
        .set({ status: "trialing", trialEndsAt })
        .where(eq(usersTable.id, client.id));
    });
  } catch (err) {
    await db
      .delete(trialCodesTable)
      .where(and(eq(trialCodesTable.code, code.code), isNull(trialCodesTable.redeemedBy)))
      .catch(() => {});
    if (err instanceof Error && err.message === "grant_conflict") {
      return res.status(409).json({ error: "grant_conflict", message: "The grant could not be completed. Please try again." });
    }
    throw err;
  }

  return res.json({
    ok: true,
    code: code.code,
    clientId: client.id,
    trialDays,
    trialEndsAt: trialEndsAt.toISOString(),
  });
});

export default router;

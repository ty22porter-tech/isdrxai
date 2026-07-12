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
  const trialEndsAt = tc.trialDays === 0
    ? new Date("2999-12-31T00:00:00Z")
    : new Date(now.getTime() + tc.trialDays * 24 * 60 * 60 * 1000);

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

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const inserted = await db
      .insert(trialCodesTable)
      .values({ code, label, trialDays, createdBy: req.clientId })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) {
      const c = inserted[0];
      return res.json({ ...c, createdAt: c.createdAt.toISOString(), redeemedAt: null });
    }
  }
  return res.status(500).json({ error: "generate_failed", message: "Couldn't generate a unique code, please try again." });
});

export default router;

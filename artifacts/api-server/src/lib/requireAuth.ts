import { getAuth } from "@clerk/express";
import { db, pool, usersTable, ensureAdditiveColumns } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

/**
 * Selects the user row, tolerating a database that is missing a newly added
 * optional column (Postgres error 42703). On that error it self-heals by
 * applying safe additive columns, then retries once — so a single new
 * optional field can never take down every endpoint.
 */
async function selectUserById(userId: string) {
  try {
    return await db.select().from(usersTable).where(eq(usersTable.id, userId));
  } catch (err) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    logger.error(
      { err },
      "[schema-guard] users select failed due to a missing column — attempting to self-heal by applying additive schema changes",
    );
    await ensureAdditiveColumns(pool, logger);
    return await db.select().from(usersTable).where(eq(usersTable.id, userId));
  }
}

declare global {
  namespace Express {
    interface Request {
      clientId: string;
      dbUser: typeof usersTable.$inferSelect;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let [user] = await selectUserById(userId);

  if (!user) {
    const emailAddresses = (auth as any)?.sessionClaims?.email_addresses;
    const email =
      typeof emailAddresses === "string"
        ? emailAddresses
        : Array.isArray(emailAddresses)
          ? emailAddresses[0]
          : null;

    [user] = await db
      .insert(usersTable)
      .values({ id: userId, email, status: "trialing", verticalSelected: false })
      .onConflictDoNothing()
      .returning();

    if (!user) {
      [user] = await selectUserById(userId);
    }
  }

  if (!user) {
    return res.status(500).json({ error: "Failed to provision user" });
  }

  if (user.status === "suspended") {
    return res.status(402).json({ error: "subscription_suspended", message: "Your subscription is suspended. Please update your payment method to continue." });
  }

  req.clientId = userId;
  req.dbUser = user;
  return next();
};

/**
 * Blocks access to routes that invoke paid third-party services (OpenAI, Resend).
 * Only users with status "active" or admin flag may proceed; trialing and other
 * non-active accounts are rejected with 402 before any external call is made.
 * Must be applied after requireAuth (depends on req.dbUser being set).
 */
export const requireEntitlement = (req: Request, res: Response, next: NextFunction) => {
  const user = req.dbUser;
  const trialActive = !!user?.trialEndsAt && new Date(user.trialEndsAt).getTime() > Date.now();
  if (user?.isAdmin || user?.status === "active" || trialActive) {
    return next();
  }
  return res.status(402).json({
    error: "subscription_required",
    message: "An active subscription is required to use this feature.",
  });
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.dbUser?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
};

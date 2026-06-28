import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

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

  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

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
      .values({ id: userId, email, status: "trialing" })
      .onConflictDoNothing()
      .returning();

    if (!user) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
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
  next();
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.dbUser?.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

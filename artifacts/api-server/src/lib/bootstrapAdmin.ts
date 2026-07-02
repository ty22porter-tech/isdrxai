import { db, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";

/**
 * One-time / idempotent admin bootstrap.
 *
 * There is no self-serve way to create the first admin (the admin toggle itself
 * requires an existing admin), so the first admin(s) must be seeded out-of-band.
 * Set BOOTSTRAP_ADMIN_USER_ID to a user id (or comma-separated list of ids) and
 * on startup those users are promoted to admin. Safe to leave configured — it
 * only ever sets is_admin=true for the listed ids and is a no-op otherwise.
 */
export async function bootstrapAdmin(): Promise<void> {
  const raw = process.env.BOOTSTRAP_ADMIN_USER_ID;
  if (!raw) return;

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return;

  try {
    const updated = await db
      .update(usersTable)
      .set({ isAdmin: true })
      .where(inArray(usersTable.id, ids))
      .returning({ id: usersTable.id });

    if (updated.length > 0) {
      logger.info({ ids: updated.map((u) => u.id) }, "Bootstrapped admin user(s)");
    } else {
      logger.warn({ ids }, "BOOTSTRAP_ADMIN_USER_ID set but no matching users found");
    }
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap admin user(s)");
  }
}

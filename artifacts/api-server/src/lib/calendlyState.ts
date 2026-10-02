import { db, calendlyConnectionsTable as connections } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hash } from "./calendlyOAuth";

export async function consumeCalendlyState(clientId: string, state: unknown): Promise<
  { kind: "claimed"; verifier: string } | { kind: "duplicate" } | { kind: "invalid" }
> {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state)) return { kind: "invalid" as const };
  const ownerAndState = and(eq(connections.clientId, clientId), eq(connections.stateHash, hash(state)));
  // Retain the hash as a receipt, but remove expiry to make it unredeemable.
  // Duplicate browser/auth-handshake callbacks may only navigate to Settings;
  // they can never exchange the authorization code a second time.
  const [pending] = await db.update(connections).set({ stateExpiresAt: null })
    .where(and(ownerAndState, gt(connections.stateExpiresAt, new Date()))).returning();
  if (pending?.verifier) return { kind: "claimed" as const, verifier: pending.verifier };
  const [receipt] = await db.select({ clientId: connections.clientId }).from(connections)
    .where(and(ownerAndState, isNull(connections.stateExpiresAt))).limit(1);
  return { kind: receipt ? "duplicate" as const : "invalid" as const };
}
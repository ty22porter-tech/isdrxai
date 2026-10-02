import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Kept separate from users: serializers must never expose OAuth credentials.
export const calendlyConnectionsTable = pgTable("calendly_connections", {
  clientId: text("client_id").primaryKey(),
  userUri: text("user_uri").unique(),
  credentials: text("credentials"),
  stateHash: text("state_hash"),
  verifier: text("verifier"),
  stateExpiresAt: timestamp("state_expires_at"),
  subscriptionUri: text("subscription_uri"),
  lastSyncAt: timestamp("last_sync_at"),
  error: text("error"),
});
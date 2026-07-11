import { getStripeSync } from "./stripeClient";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // The Stripe sync only mirrors Stripe data into the `stripe.*` tables; it does
    // NOT touch our app's `users.status`. Reconcile entitlement here so a customer
    // gains access the moment their subscription is active and loses it when it lapses.
    await WebhookHandlers.reconcileEntitlements();
  }

  /**
   * Map Stripe subscription state -> app entitlement (`users.status`).
   * - A user whose Stripe customer has an active/trialing subscription becomes "active".
   * - A user whose subscriptions have all lapsed drops back to "trialing" (keeps their
   *   account + billing access, loses paid features). Admins and comped users without a
   *   Stripe customer id are never downgraded here.
   *
   * Reads `_raw_data` (the jsonb column the sync always writes) so it works regardless
   * of which generated columns the sync library version exposes.
   */
  static async reconcileEntitlements(): Promise<void> {
    // Grant access to anyone with a live subscription and record the subscription id.
    // DISTINCT ON picks the most recently created live subscription per customer, so the
    // stored stripe_subscription_id is deterministic even when a customer has several.
    await db.execute(sql`
      UPDATE users u
      SET status = 'active',
          stripe_subscription_id = live.sub_id
      FROM (
        SELECT DISTINCT ON (s._raw_data->>'customer')
               s._raw_data->>'customer' AS customer,
               s._raw_data->>'id' AS sub_id
        FROM stripe.subscriptions s
        WHERE s._raw_data->>'status' IN ('active', 'trialing')
        ORDER BY s._raw_data->>'customer', (s._raw_data->>'created')::bigint DESC NULLS LAST
      ) live
      WHERE u.stripe_customer_id = live.customer
        AND (u.status IS DISTINCT FROM 'active'
             OR u.stripe_subscription_id IS DISTINCT FROM live.sub_id)
    `);

    // Revoke access from paying customers whose subscriptions have all lapsed.
    await db.execute(sql`
      UPDATE users u
      SET status = 'trialing'
      WHERE u.stripe_customer_id IS NOT NULL
        AND u.is_admin = false
        AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM stripe.subscriptions s
          WHERE s._raw_data->>'customer' = u.stripe_customer_id
            AND s._raw_data->>'status' IN ('active', 'trialing')
        )
    `);
  }
}

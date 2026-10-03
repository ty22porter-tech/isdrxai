---
name: stripe-replit-sync init pitfalls
description: Why Stripe tables/backfill can silently no-op in the bundled api-server
---
# stripe-replit-sync init pitfalls

## Cross-environment webhook ownership

Development must never manage Stripe webhooks on the shared live account, including when testing a production build locally.

**Why:** On 2026-10-03 a development startup logged deletion of an “orphaned managed webhook” pointing at the published app. The shared Stripe account does not imply shared database state or safe shared webhook ownership.

**How to apply:** Keep webhook registration exclusive to confirmed published production. Check the live endpoint inventory before and after startup changes. The library's production managed-webhook helper still performs account-wide orphan cleanup; do not describe the development startup guard as full multi-environment ownership isolation. Never invoke that helper manually from development to repair production: it would save the signing secret in the wrong database. Restore production registration through the published runtime, then verify the endpoint and delivery separately.

Two silent no-ops observed with stripe-replit-sync in the esbuild-bundled api-server:

1. **Migrations skipped when bundled.** `runMigrations` resolves its SQL files relative to the *running bundle* (`dist/migrations`). If the folder is missing it logs nothing useful and reports success — `stripe` schema exists but has zero tables (`relation "stripe.accounts" does not exist` later). Fix: api-server `build.mjs` copies `node_modules/stripe-replit-sync/dist/migrations` into `dist/migrations` after bundling. Keep that copy step if the build script is rewritten.

2. **`syncBackfill()` without args syncs nothing.** Its default param is a function reference that matches no switch case, so it instantly reports "complete" with 0 rows. Must call `syncBackfill({ object: "all" })`.

**How to apply:** if Stripe products/prices are empty in DB despite "schema ready"/"backfill complete" logs, check these two first before blaming keys or the connector.

Related: Stripe connector binding is a ghost (added but proxy returns empty); stripeClient falls back to STRIPE_SECRET_KEY env var — don't retry proposeIntegration.

3. **Production mirrors can be partial even after backfill.** Do not use synchronized `stripe.products` / `stripe.prices` rows as the authority for checkout price discovery. Resolve checkout products and active monthly prices through the live Stripe API, while continuing to use the mirror for reporting and webhook-derived state.

**Why:** A production mirror contained only one of three active self-service products, causing valid Starter and core-plan checkout buttons to show “Plan unavailable.”

**How to apply:** Any identifier that is immediately required to create a Stripe Checkout session should come from Stripe’s live API and be validated server-side against the allowed product names.

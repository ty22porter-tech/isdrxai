---
name: Multi-tenant SaaS architecture
description: How clientId isolation, auth, Stripe subscriptions, and admin work in the AI SDR app
---

## Rule
All data tables (prospects, campaigns, emails, calls, appointments, activity) have a `clientId TEXT` column = Clerk userId. Every query filters by `eq(table.clientId, req.clientId)`.

## Auth flow
- `requireAuth` middleware in `artifacts/api-server/src/lib/requireAuth.ts`
- JIT-provisions a row in `usersTable` on first request using Clerk userId
- Returns 401 if no session, 402 if `status = 'suspended'`
- Sets `req.clientId` and `req.dbUser` for downstream handlers
- Applied on ALL routes including `/api/ai/*` and `/api/openai/*`

## usersTable columns
`id TEXT PK` (= Clerk userId), `email`, `stripe_customer_id`, `stripe_subscription_id`, `status` (trialing/active/suspended), `is_admin`, `created_at`

## Stripe suspension
Webhook handlers in `webhookHandlers.ts` update `usersTable.status` on `invoice.payment_failed` → suspended, `invoice.paid` → active.

## Admin panel
`requireAdmin` middleware checks `req.dbUser.isAdmin`. Admin route at `/api/admin/*`. Frontend at `/admin` (only visible if `dbUser.isAdmin`).

## Seed Stripe products
Run: `cd artifacts/api-server && npx tsx src/seed-products.ts` (requires Stripe connected via Integrations tab)
Prices: $197/month, $1970/year for "AI SDR Pro".

**Why:** Multi-tenancy on a single DB schema with row-level clientId isolation is simpler than separate schemas and works well at SaaS scale for this use case.

**How to apply:** Any new data table must include `clientId TEXT NOT NULL DEFAULT ''` and any query for that table must include `.where(eq(table.clientId, req.clientId))` in the route handler.

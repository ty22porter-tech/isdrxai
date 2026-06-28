---
name: Stripe dev env limitation
description: Stripe connector init fails in dev; this is expected and the server continues without it
---

## Rule
`initStripe()` in `artifacts/api-server/src/index.ts` is wrapped in try/catch. If Stripe fails to init, it logs an error and continues. The app still works — users get `status: 'trialing'` from the usersTable default.

## Why it fails in dev
`getStripeCredentials()` fetches from `https://${REPLIT_CONNECTORS_HOSTNAME}/api/v2/connection?connector_names=stripe`. This hostname is only available in deployed environments (or when the connector infrastructure is active). In the dev container it may not be set.

**Why:** This is intentional — the Stripe init failure is non-fatal so dev/test workflows aren't blocked.

**How to apply:** In production (deployed app), `REPLIT_CONNECTORS_HOSTNAME` is set and Stripe initializes correctly. Never make Stripe a hard dependency of server startup.

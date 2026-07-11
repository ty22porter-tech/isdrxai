---
name: Stripe entitlement reconciliation
description: Why paid-feature access (users.status) must be reconciled in the Stripe webhook, and how.
---

# Stripe entitlement vs. Stripe sync

Paid features are gated by `requireEntitlement` (allows only `users.status === 'active'` or `isAdmin`).

`stripe-replit-sync`'s `sync.processWebhook` ONLY mirrors Stripe objects into the `stripe.*` tables. It never touches our own `users.status`. So on its own, a paying subscriber stays `trialing` and is BLOCKED.

**Rule:** the Stripe webhook handler must, after `sync.processWebhook`, reconcile `users.status` from Stripe subscription state. Live sub (`_raw_data->>'status'` in `active`/`trialing`) → `status='active'`; customer with no live sub → back to `trialing` (not `suspended`, so they keep account + billing access to re-subscribe). Admins and comped users with NO `stripe_customer_id` are never downgraded.

**Why:** without this the whole monetization loop is broken — checkout succeeds, Stripe charges, but the customer can't use what they paid for.

**How to apply:**
- Query `_raw_data` jsonb (always present), not generated columns, for cross-version robustness.
- `stripe.*` tables exist ONLY in production (Stripe connected there); the webhook never fires in dev, so this code path is untested locally — verify after publish.
- For dev/testing, grant access by manually setting `users.status='active'` (Stripe path won't run in dev).

**Open policy decisions (surface to user, don't hardcode):**
- Stripe `trialing` subscriptions currently count as entitled. Fine for paid-plan free trials; revisit if "only paying" must exclude trials.
- Comped users who have a `stripe_customer_id` but no live sub WILL be downgraded. A manual `entitlement_override` flag would be needed to protect them.

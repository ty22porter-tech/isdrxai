---
name: Trial codes & entitlement gating
description: How free-trial-via-code access works and the entitlement rules that gate paid features. Read before touching billing/entitlement or adding new AI/email endpoints.
---

# Access model
`requireEntitlement` (artifacts/api-server/src/lib/requireAuth.ts) grants access if:
`isAdmin` OR `status === "active"` OR active trial (`users.trialEndsAt` set AND > now).

- Default new user `status = "trialing"` does **NOT** grant access on its own. A user
  only gets access by redeeming a trial code, which sets `trialEndsAt`.
- Expiry is enforced **at request time** by comparing `trialEndsAt` to now. There is no
  cron/scheduled job that flips status when a trial ends — do not add one expecting it to
  gate access; the time check already does.

# Stripe checkout trial selection
The Stripe trial is optional, not the default. Buy Now starts billing when checkout completes;
only an explicit Start Free Trial selection receives 14 days. Both choices still include the
required launch package.

**Why:** The user requires customers to actively choose a trial rather than receiving one on every
new subscription.

**How to apply:** Carry an explicit purchase-versus-trial intent through checkout and validate it
on the server. Never infer a trial merely because the customer is a first-time subscriber.

# Enforce the whole paid-product boundary
The browser gate is only onboarding UX. Apply entitlement middleware at the router boundary
for paid product areas so an unpaid authenticated user cannot bypass the UI with direct API
requests. Keep account identity, Stripe/billing, and trial redemption auth-only so onboarding
can complete.

**Why:** Page redirects do not secure HTTP endpoints; entitlement must be checked again on
the server for every paid product request.

**How to apply:** When adding a product router, decide explicitly whether it is part of paid
use or needed to obtain entitlement. Paid-use routers inherit the shared entitlement check;
onboarding exceptions remain narrow and documented.

# Two parallel AI route families — gate BOTH
There are two AI generation route trees that duplicate `generate-email` / `generate-call-script`:
- `/api/ai/*`  (template-based, routes/ai.ts)
- `/api/openai/*` (LLM, routes/openai.ts)

**Why:** gating one and forgetting the other is a real entitlement bypass — a non-paying
user can hit the ungated twin. Any new paid generation/prospect endpoint must carry
`requireEntitlement` in BOTH trees (also `/api/emails`, `/api/autopilot`).

# Trial code redemption rules (routes/trialCodes.ts)
- Codes are **single-use**: claimed atomically via `UPDATE trial_codes SET redeemed_by=…
  WHERE code=? AND redeemed_by IS NULL` — losing a race matches 0 rows → 409.
- **One trial per client**: redeem is rejected if `user.trialEndsAt` is already set
  (they used their trial → must subscribe). Prevents stacking codes to extend forever.
- Code claim + `users.trialEndsAt` grant are wrapped in a single `db.transaction` so a
  failed grant rolls back the claim (code is never burned without granting the trial).
- Admin generate/list gated by `requireAdmin`; code format `TRIAL-XXXXXXXX` (ambiguous
  chars 0/O/1/I/L excluded), default 14 days.
- **Unlimited codes:** `trialDays = 0` is the sentinel for "never expires" (redeem sets
  `trialEndsAt` = 2999-12-31; entitlement's time check then always passes). Admin-only;
  owner uses these to test the live product for free across all plans. Billing UI treats
  trials ending >50 years out as unlimited (display heuristic only — don't rely on it
  server-side). Trials are plan-independent: any trial = full access on every tier.

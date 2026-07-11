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

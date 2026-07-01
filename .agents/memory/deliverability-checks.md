---
name: Deliverability checks (Resend + DNS)
description: How the in-app deliverability checklist gathers SPF/DKIM/DMARC status and the external-API quirks behind it.
---

# Deliverability checklist data sources

Backend: `artifacts/api-server/src/routes/deliverability.ts` (GET /deliverability, requireAuth).

Non-obvious external-API facts:
- Resend's domain **records** array (SPF/DKIM entries with `status`) is only returned by the
  detail endpoint `GET /domains/{id}` — the list endpoint `GET /domains` returns id/name/status
  only. So: list → find by name → fetch detail for per-record status.
- In the live payload each record carries a `record` field = "SPF" or "DKIM" (plus `name`/`type`),
  so match on `record`+`name`+`type` together (DKIM name is `resend._domainkey`). Matching on
  `type` alone cross-contaminates (both SPF-TXT and DKIM-TXT are type TXT).
- **Resend does not verify DMARC.** DMARC must be checked independently via DNS:
  `node:dns/promises resolveTxt("_dmarc.<domain>")` and look for `v=DMARC1`.

**Why:** emails were landing in Spam/Promotions (warm-up/reputation, not a code bug). This
checklist lets the user see auth status in-app instead of the agent probing the provider.
**How to apply:** if adding/changing checks, keep DMARC on DNS and SPF/DKIM on the Resend detail
endpoint; distinguish `unknown` (provider unreadable) from `warn`/`fail` in user-facing copy.

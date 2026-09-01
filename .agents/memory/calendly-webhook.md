---
name: Calendly webhook bookings
description: Per-user Calendly ownership, webhook coverage, booking ingestion, and idempotency constraints
---

# Calendly webhook

- Every app user owns an independent `calendlyUrl`. Outbound CTA tracking must stay scoped to the link owner's client ID, and auditing one connected Calendly account says nothing about bookings in other users' accounts.
- A single workspace-level `CALENDLY_API_TOKEN` or Replit Calendly connection cannot provide correct multi-tenant booking coverage: it monitors only the Calendly user or organization that credential belongs to. Each SaaS user needs their own in-product Calendly OAuth connection (or another explicitly per-user credential model), and imported bookings must be mapped to that owning app user before matching prospects.
- Calendly never returns a webhook signing key after creation — the caller supplies it at subscribe time, so any auto-registration must use reproducible key material (explicit secret or derived from a strong secret; never a hardcoded fallback). No key → fail closed in production. Calendly webhooks need a paid plan + personal access token.
- Prospect matched by lower(email) across clients; ties broken by most recent calendly_click score event, then any score event, then newest prospect.
- Idempotency must not depend only on the appointments.calendly_invitee_uri index being present. Serialize by invitee URI with a transaction-scoped advisory lock, pre-check for the appointment, and create appointment + activity + prospect status in one transaction.
- After the booking transaction, run the idempotent meeting score and automation suppression, then verify both durable outcomes before returning 200. Otherwise swallowed helper errors prevent Calendly from retrying an incomplete booking.
- invitee.canceled flips the matching appointment (by invitee URI) to cancelled; guard `status != 'cancelled'` in the UPDATE makes retries no-ops. Prospect status rolls back appointment_set→contacted only when no active appointments remain, so reschedule ordering (cancel before/after new created) is safe either way. Score events are left intact on cancel — the once-per-prospect cap means a rebook won't double-score.

**Why:** Production is multi-tenant and users do not share scheduling accounts. A global credential creates false confidence that every user's bookings are synchronized. Separately, some environments can have the Calendly URI column without its unique index, and a partial commit can leave a booking permanently half-processed.

**How to apply:** Scope every Calendly connection, subscription, reconciliation query, and resulting appointment to one app user. Never infer fleet-wide booking status from one connected account. Keep webhook retries safe across the entire business outcome, not just the first insert.

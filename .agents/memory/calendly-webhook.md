---
name: Calendly webhook bookings
description: How Calendly invitee.created bookings flow into appointments/engagement, and drizzle onConflict gotcha
---

# Calendly webhook

- Calendly never returns a webhook signing key after creation — the caller supplies it at subscribe time, so any auto-registration must use reproducible key material (explicit secret or derived from a strong secret; never a hardcoded fallback). No key → fail closed in production. Calendly webhooks need a paid plan + personal access token.
- Prospect matched by lower(email) across clients; ties broken by most recent calendly_click score event, then any score event, then newest prospect.
- Idempotency: appointments.calendly_invitee_uri unique index + onConflictDoNothing; meeting_scheduled is already once-per-prospect in recordEngagementEvent.
- invitee.canceled flips the matching appointment (by invitee URI) to cancelled; guard `status != 'cancelled'` in the UPDATE makes retries no-ops. Prospect status rolls back appointment_set→contacted only when no active appointments remain, so reschedule ordering (cancel before/after new created) is safe either way. Score events are left intact on cancel — the once-per-prospect cap means a rebook won't double-score.

**Gotcha:** drizzle `onConflictDoNothing({ target })` generates `ON CONFLICT (col)` which does NOT match a *partial* unique index (Postgres error "no unique or exclusion constraint matching"). Use a plain unique index on the nullable column (NULLs never conflict) or pass `targetWhere`.

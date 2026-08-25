---
name: Calendly webhook bookings
description: How Calendly invitee.created bookings flow into appointments/engagement, and drizzle onConflict gotcha
---

# Calendly webhook

- Calendly never returns a webhook signing key after creation — the caller supplies it at subscribe time, so any auto-registration must use reproducible key material (explicit secret or derived from a strong secret; never a hardcoded fallback). No key → fail closed in production. Calendly webhooks need a paid plan + personal access token.
- Prospect matched by lower(email) across clients; ties broken by most recent calendly_click score event, then any score event, then newest prospect.
- Idempotency must not depend only on the appointments.calendly_invitee_uri index being present. Serialize by invitee URI with a transaction-scoped advisory lock, pre-check for the appointment, and create appointment + activity + prospect status in one transaction.
- After the booking transaction, run the idempotent meeting score and automation suppression, then verify both durable outcomes before returning 200. Otherwise swallowed helper errors prevent Calendly from retrying an incomplete booking.
- invitee.canceled flips the matching appointment (by invitee URI) to cancelled; guard `status != 'cancelled'` in the UPDATE makes retries no-ops. Prospect status rolls back appointment_set→contacted only when no active appointments remain, so reschedule ordering (cancel before/after new created) is safe either way. Score events are left intact on cancel — the once-per-prospect cap means a rebook won't double-score.

**Why:** Some environments can have the Calendly URI column without its unique index, and an appointment-only commit followed by a swallowed scoring failure leaves a booking permanently half-processed because webhook retries look like duplicates.

**How to apply:** Keep webhook retries safe across the entire business outcome, not just the first insert. A duplicate delivery should reconcile idempotent downstream effects, and the endpoint should return a retryable error until required score/suppression state is confirmed.

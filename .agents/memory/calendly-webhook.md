---
name: Calendly webhook bookings
description: How Calendly invitee.created bookings flow into appointments/engagement, and drizzle onConflict gotcha
---

# Calendly webhook

- Public POST /api/calendly/webhook (raw body, mounted before express.json like Stripe/Resend). Verifies HMAC only when `CALENDLY_WEBHOOK_SIGNING_KEY` is set; otherwise accepts + warns. The user must create the Calendly webhook subscription themselves (Calendly paid plan + API token) pointing at the public URL.
- Prospect matched by lower(email) across clients; ties broken by most recent calendly_click score event, then any score event, then newest prospect.
- Idempotency: appointments.calendly_invitee_uri unique index + onConflictDoNothing; meeting_scheduled is already once-per-prospect in recordEngagementEvent.

**Gotcha:** drizzle `onConflictDoNothing({ target })` generates `ON CONFLICT (col)` which does NOT match a *partial* unique index (Postgres error "no unique or exclusion constraint matching"). Use a plain unique index on the nullable column (NULLs never conflict) or pass `targetWhere`.

**Env note:** task-environment dev DB snapshots can lag the schema (engagement tables/columns were missing here); apply additive raw-SQL DDL before testing, per db-schema-changes.md.

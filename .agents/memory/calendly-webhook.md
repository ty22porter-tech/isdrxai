---
name: Calendly webhook bookings
description: Per-user Calendly ownership, webhook coverage, booking ingestion, and idempotency constraints
---

# Calendly webhook

- Every app user owns an independent `calendlyUrl`. Outbound CTA tracking must stay scoped to the link owner's client ID, and auditing one connected Calendly account says nothing about bookings in other users' accounts.
- A single workspace-level `CALENDLY_API_TOKEN` or Replit Calendly connection cannot provide correct multi-tenant booking coverage: it monitors only the Calendly user or organization that credential belongs to. Each SaaS user needs their own in-product Calendly OAuth connection (or another explicitly per-user credential model), and imported bookings must be mapped to that owning app user before matching prospects.
- Calendly webhook permissions depend on provider plan and scopes; OAuth is the chosen customer credential model, not a personal access token. Always fail closed when webhook verification is unavailable.
- Never resolve duplicate-email ambiguity by globally ranking engagement. Ownership must be resolved first, and ambiguous prospects within the owner stay unmatched.
- Idempotency must not depend only on the appointments.calendly_invitee_uri index being present. Serialize by invitee URI with a transaction-scoped advisory lock, pre-check for the appointment, and create appointment + activity + prospect status in one transaction.
- After the booking transaction, run the idempotent meeting score and automation suppression, then verify both durable outcomes before returning 200. Otherwise swallowed helper errors prevent Calendly from retrying an incomplete booking.
- invitee.canceled flips the matching appointment (by invitee URI) to cancelled; guard `status != 'cancelled'` in the UPDATE makes retries no-ops. Prospect status rolls back appointment_set→contacted only when no active appointments remain, so reschedule ordering (cancel before/after new created) is safe either way. Score events are left intact on cancel — the once-per-prospect cap means a rebook won't double-score.

**Why:** Production is multi-tenant and users do not share scheduling accounts. A global credential creates false confidence that every user's bookings are synchronized. Separately, some environments can have the Calendly URI column without its unique index, and a partial commit can leave a booking permanently half-processed.

**How to apply:** Scope every Calendly connection, subscription, reconciliation query, and resulting appointment to one app user. Never infer fleet-wide booking status from one connected account. Keep webhook retries safe across the entire business outcome, not just the first insert.

## Production-only OAuth registration

Use a separate OAuth application/redirect for development if live authorization testing in development becomes necessary; never send a production OAuth callback into the development database.

**Why:** The user registered the production application after being given the canonical isdrxai.com callback. Development and production have separate identities and data.

**How to apply:** Do not bypass the preview connection guard to test real calendars. Verify the production consent round trip after publishing. Preserve encryption key material when changing session secrets, or intentionally require every customer to reconnect.

## Duplicate OAuth callbacks

Treat authenticated duplicate callbacks as navigation back to Settings, never as another token exchange. Retain a tenant-bound consumed-state receipt while keeping the grant strictly single-use.

**Why:** Production logs showed an authentication redirect followed by overlapping callback requests: the first authorized successfully, while the duplicate consumed-state rejection became the page the user saw. Authorization success and webhook setup success are separate outcomes.

**How to apply:** Test concurrent callback deliveries and cross-tenant state reuse. Keep setup errors stage-specific and sanitized; use the OAuth application's assigned webhook signing key rather than PAT-style signing-key overrides.

## Calendly permissions are not hierarchical

Webhook write permission does not grant webhook read permission.

**Why:** A production authorization succeeded but subscription lookup returned an explicit insufficient-scope 403. Calendly's API specification requires separate read scope for subscription listing.

**How to apply:** Check each called endpoint's documented scopes, including lookups before mutations. Ensure both the developer app's allowed scopes and the new authorization grant include those permissions; existing grants require reconnection.

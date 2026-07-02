---
name: Inbound reply detection (Option B)
description: How prospect replies are auto-detected via Resend inbound webhook, and the non-obvious Resend constraints around it.
---

# Inbound reply detection ("Option B")

Prospect replies are routed through the platform sending domain instead of a manual
"Log Reply" button. Outbound emails set `Reply-To` to an encoded address
`reply-<scheduleToken>@<INBOUND_REPLY_DOMAIN>`; Resend delivers replies to a
webhook that decodes the token → prospect → latest live enrollment.

## The whole feature is gated behind env `INBOUND_REPLY_DOMAIN`
- **Unset (default) = legacy behavior**: `resolveReplyTo()` falls back to the
  client's own `outreachEmail`, and nothing about existing sends changes. This is
  the safe production state until DNS + secrets are provisioned.
- Set (e.g. `reply.sdrai.xyz`) = replies route to the tokenized address.

## Non-obvious Resend constraints (not derivable from code)
- **There is NO API/SDK method to *enable receiving* on a domain.** It is a Resend
  dashboard toggle (Emails → Receiving) that also reveals the MX record to add.
  The SDK `Domains` class has no receiving-enable; `Receiving` is read/forward only.
- Webhook creation IS available: `resend.webhooks.create({endpoint, events})`
  returns `signing_secret` (store as `RESEND_WEBHOOK_SECRET`). Verify with the
  **sync** `resend.webhooks.verify({payload, headers, webhookSecret})`.
- The `email.received` payload is **metadata-only** — must call
  `resend.emails.receiving.get(email_id)` to get the body.
- Webhook route must be registered with `express.raw` BEFORE `express.json`
  (same pattern as the Stripe webhook), and ack 200 fast then process async.

## Two hard-won correctness rules for this handler
- **Validate the sender.** The tokenized reply address is exposed in outbound
  headers, so anyone could email it. Only advance enrollment state / trigger the
  queue when `extractAddress(from) === prospect.email`. Unverified mail is
  forwarded to the client for visibility but must NOT mutate state or trigger.
- **Idempotency + atomic claim.** Dedup inbound events by `email_id`
  (`processed_inbound_emails` PK) with insert-onConflictDoNothing; release the
  marker (delete row) if processing throws so a replay can retry. The engine's
  Calendly send claims the row atomically (`UPDATE ... WHERE calendlyLinkSentAt
  IS NULL RETURNING`, skip if 0 rows) BEFORE sending to prevent the 5-min timer
  racing the reply-trigger into a double scheduling email.

**Why:** without sender validation a leaked token lets a third party spoof a
"positive reply" and fire the booking email; without the atomic claim/dedup,
webhook retries and concurrent queue runs double-send.

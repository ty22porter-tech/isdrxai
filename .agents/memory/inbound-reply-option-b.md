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
- **Receiving CAN be enabled via API**: `resend.domains.update({ id, capabilities:
  { receiving: "enabled" } })`. After that, `domains.get(id).records` includes the
  receiving MX to add: type MX, name "" (ROOT), value
  `inbound-smtp.<region>.amazonaws.com`, priority 10 (status pending until DNS).
- Receiving attaches to the ROOT Resend domain (here `sdrai.xyz`), so the MX goes on
  root and addresses are `@sdrai.xyz` → set `INBOUND_REPLY_DOMAIN=sdrai.xyz` (NOT a
  `reply.` subdomain). Root MX is safe here: sdrai.xyz has no real mailboxes (client
  mail is Google Workspace on whitlockservices.com) and the sending SPF/feedback MX
  lives on the `send.` subdomain, so it doesn't conflict.
- Webhook creation IS available: `resend.webhooks.create({endpoint, events})`
  returns `signing_secret` (store as `RESEND_WEBHOOK_SECRET`). Verify with the
  **sync** `resend.webhooks.verify({payload, headers, webhookSecret})`.
- The `email.received` payload is **metadata-only** — must call
  `resend.emails.receiving.get(email_id)` to get the body.
- Webhook route must be registered with `express.raw` BEFORE `express.json`
  (same pattern as the Stripe webhook), and ack 200 fast then process async.

## Webhook is self-provisioned on boot (mirror the Stripe pattern)
- `ensureResendWebhook()` runs once at startup (index.ts, after Stripe init, before
  `app.listen`), exactly like `stripeSync.findOrCreateManagedWebhook`. It gates on
  `INBOUND_REPLY_DOMAIN`, derives `endpoint = getPublicAppUrl() + /api/resend/webhook`
  (`getPublicAppUrl` = `PUBLIC_APP_URL` or first `REPLIT_DOMAINS` entry → the
  deployment domain in prod), find-or-creates the `email.received` webhook, and loads
  the signing secret into `process.env.RESEND_WEBHOOK_SECRET` in memory.
- **`resend.webhooks.get(id)` DOES return `signing_secret`** (create returns it too),
  so there is NO need to persist the secret in a DB/secret store — refetch it on each
  boot from the existing webhook. This is why the handler reads the secret from a
  runtime-set `process.env` rather than a stored value.
- Feature is switched on by setting `INBOUND_REPLY_DOMAIN` as a **production-only**
  env var (never in dev) → dev boots stay a no-op / legacy Reply-To, and only the
  deployed always-on server registers the webhook against the prod URL. No manual
  webhook creation or URL guessing.
- `webhooks.list({limit:100})` (default page is only 20) to avoid missing an existing
  webhook and creating a duplicate.

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

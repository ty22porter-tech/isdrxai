---
name: Inbound reply detection (Option B)
description: How prospect replies are auto-detected via Resend inbound webhook, and the non-obvious Resend constraints around it.
---

# Inbound reply detection ("Option B")

## GOTCHA: resend.webhooks.verify() header shape (silent "Missing required headers")
`resend.webhooks.verify({ payload, headers, webhookSecret })` reads `headers.id`,
`headers.timestamp`, `headers.signature` (plain-object props) and maps them to the
standardwebhooks `webhook-*` names internally. Passing a `Headers` object (or an object
keyed `svix-id`/`svix-timestamp`/`svix-signature`) makes all three resolve to `undefined`
→ every inbound webhook fails verification with "Missing required headers" and NO reply is
ever processed. The incoming Resend request carries the values as `svix-*` headers (Svix),
so read `req.headers["svix-id"|"svix-timestamp"|"svix-signature"]` (with `webhook-*`
fallback) and pass them as `{ id, timestamp, signature }`.
**How to verify without a real reply:** GET `api.resend.com/webhooks/{id}` → `signing_secret`
(top-level, not `.data`), sign with `new Webhook(secret).sign(msgId, Date, payload)` from
`standardwebhooks`, POST to the live `/api/resend/webhook` with `svix-*` headers → expect
200 for a valid sig, 400 for a bad one.

## DECISION: Option B is the client's PREFERRED flow — keep it ON in dev
`INBOUND_REPLY_DOMAIN=sdrai.xyz` is set in **development** (only). The client wants the
autopilot flow: enrolled prospect replies positively → engine auto-sends the
"Let's schedule a walkthrough" email → prospect fills the `/schedule/<token>`
questionnaire → rep is emailed the answers (+floor plans) and prospect books via Calendly.
This was briefly disabled (routed to client inbox) then re-enabled at the client's request.
**Reliability caveat (state clearly, do NOT silently "fix"):** auto reply-detection only
fires while the app is running when the reply arrives. Real data lives in the DEV DB and
the dev webhook points at the ephemeral preview URL — so replies that land while the
workspace is asleep are missed. Resend also fans out `email.received` to any prod webhook
too, but prod is a SEPARATE empty DB so its copy just no-ops (harmless). True 24/7 requires
running the real operation from the always-on prod deployment (data must live in prod).
**Only fires for ENROLLED prospects.** A manually-emailed prospect with no live enrollment:
the reply is logged + forwarded to `outreachEmail`, but no auto-scheduling email is sent.
**Recover a swallowed reply:** GET `api.resend.com/emails/receiving?limit=N` to list
inbound, `/emails/receiving/<id>` for the body; forward via POST `/emails`.


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
- Feature is switched on by setting `INBOUND_REPLY_DOMAIN`. It can be scoped per
  environment: production scope = live app only; add a **development**-scope value to
  also enable it in the preview (the default is unset in dev = no-op / legacy Reply-To).
- `webhooks.list({limit:100})` (default page is only 20) to avoid missing an existing
  webhook and creating a duplicate.

## Dev vs prod is the usual real-world gotcha here
- **Dev and prod are SEPARATE Postgres databases.** In practice the real client +
  prospects + enrollments live only in the **development** DB (that's where the app is
  actually operated); the published prod DB can be empty. Check both with
  `executeSql({environment:"production"})` vs default before concluding "the reply
  wasn't processed" — the token→prospect lookup runs against whichever env's DB, so a
  prod webhook against an empty prod DB just logs "no prospect for token".
- To make auto reply→Calendly work in the preview: set `INBOUND_REPLY_DOMAIN` in the
  **development** scope and restart api-server — boot self-registers a webhook for the
  CURRENT dev URL and loads the secret. Caveat: preview only catches replies while the
  workflow is running, and the dev URL changes over time.
- **Webhooks accumulate; `ensureResendWebhook` find-or-creates but never prunes.** Each
  boot at a new URL (dev preview URLs rotate) leaves a stale enabled webhook, and Resend
  delivers every `email.received` to ALL of them. Manually remove dead endpoints
  (`webhooks.remove(id)`) — match on `endpoint.includes("spock")` old-preview hosts;
  keep the current dev URL + the prod `.replit.app` URL.
- Only **new** sends after enabling carry the tokenized Reply-To; emails sent earlier
  had legacy Reply-To (client inbox), so replies to those never route to the platform.

## Why the whole flow can LOOK "removed" when the code is intact
The reply→scheduling-form→Calendly flow silently no-ops (looks deleted to the client)
under any of these, none of which are code bugs — check them before touching code:
- **Enrollment already advanced.** Replied prospects whose enrollment is `calendly_sent`
  (calendlyLinkSentAt set) will NOT re-send — idempotent by design. Re-testing the same
  prospect that already went through does nothing.
- **Orphaned reply-to token.** The reply arrives at `reply-<token>@<domain>` but the token
  matches no current prospect (row was deleted / CSV re-imported → new tokens), so the
  handler logs "no prospect for token" and drops it. Old sent emails carry old tokens.
- **Client not fully configured.** The replied→Calendly branch skips silently unless the
  client has `outreachEmail` AND `calendlyUrl` AND `businessAddress` (CAN-SPAM). A blank
  Calendly URL alone kills the whole thing with no visible error.
- **Reply tone not positive.** Branch only fires for `replyTone === "positive"`.

**Re-test recipe (safe live proof to your own address):** pick a test prospect whose email
you own, `UPDATE autopilot_enrollments SET status='replied', reply_tone='positive',
calendly_link_sent_at=NULL, error_message=NULL WHERE id=<n>`, then restart api-server —
the engine's `run()` fires on boot (5-min interval otherwise) and sends the scheduling
email (with the `/schedule/<scheduleToken>` form link) within seconds. Verify via the
`emails` row + `appointment_set` activity.

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

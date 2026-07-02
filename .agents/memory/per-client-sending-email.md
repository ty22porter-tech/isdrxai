---
name: Per-client sending email
description: How each client's outbound From: address is chosen and why From≠Reply-To is intentional
---

# Per-client sending From: address

`users.sendingEmail` (nullable, admin-managed via PATCH /admin/clients/:id) is each
client's own authenticated From: address, provisioned during onboarding. `sendEmail`
takes an optional `fromEmail`; all send sites pass `client.sendingEmail ?? undefined`.
When null, it falls back to `getPlatformFromEmail()` (RESEND_FROM_EMAIL, the shared
domain) — so a null value is the safe default and existing clients are unaffected.

**Must be Resend-verified:** setting `sendingEmail` to a domain not verified in Resend
will make that client's sends fail. Do not populate it with an unverified address.

**From ≠ Reply-To is intentional, do NOT "fix" it.** Reply-To always stays
`reply-<token>@INBOUND_REPLY_DOMAIN` (shared sdrai.xyz) so inbound auto-scheduling
keeps matching by token, regardless of the client's From domain. Different From vs
Reply-To domains is a normal, deliverable pattern; DKIM/SPF align on the From domain.

**Why:** single admin portal manages all clients but each client sends "as" itself;
routing replies through one shared inbound domain keeps the reply/scheduling pipeline
unchanged while letting the visible sender be per-client.

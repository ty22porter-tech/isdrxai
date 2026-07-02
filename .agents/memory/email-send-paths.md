---
name: Email send paths (iSDRX AI)
description: Where outbound email is actually dispatched vs. only logged; compliance must be uniform across paths.
---

# Outbound email send paths

There are two ways an email gets created in this app, and historically only one
actually sent:

1. **Autopilot engine** (`api-server/src/lib/autopilotEngine.ts`) — server-side,
   AI-generated body, always dispatched via Resend.
2. **Manual send** — frontend (`prospects.tsx`, `sequences.tsx`,
   `prospect-detail.tsx`) builds the body client-side and POSTs to
   `/api/emails`. This path **used to only insert a DB row with
   `status:"sent"` and never call Resend**, so users saw "sent" but nothing was
   delivered.

**Rule:** any code that records an email as "sent" MUST actually dispatch it
(via `sendEmail`) first, and only insert the row on success. Never write
`status:"sent"` without a real provider send.

**Why:** a status field that lies about delivery is worse than an error — the
user has no signal that outreach silently failed.

**How to apply:**
- Both send paths share `api-server/src/lib/emailCompose.ts`
  (`composeEmail` + `unsubscribeHeaders`). Keep signature/CAN-SPAM footer/
  List-Unsubscribe headers identical across paths by using this module.
- CAN-SPAM requires a physical postal address: reject sends (400) when
  `client.businessAddress` is empty (`hasPostalAddress` /
  `POSTAL_ADDRESS_REQUIRED_MESSAGE`). Also reject opted-out prospects (409).
- Client-built bodies must NOT include their own sign-off/signature — the
  server appends a real one. (Removed the hardcoded "Your SDR Team" fallback.)
- Frontend send handlers must surface backend errors (400/409/502) via toast
  and count actual successes, not queue length — otherwise false "N sent"
  positives reappear. The `ApiError` thrown by the client carries the JSON body
  at `err.data.error`.

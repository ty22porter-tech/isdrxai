---
name: PUBLIC_APP_URL points all emailed links at prod
description: Shared env var PUBLIC_APP_URL = published URL; every emailed link (alerts, tracking, /schedule) targets prod even when sent from dev.
---

Shared env var `PUBLIC_APP_URL=https://iSDRXAI.replit.app` is set; `getPublicAppUrl()` prefers it over REPLIT_DOMAINS.

**Why:** Hot-lead alert emails sent from the dev workspace linked to the sleeping `.replit.dev` domain ("Run this app to see the results here" page). User wants alert links to open the live app.

**How to apply:** All emailed links (hot-lead alerts, tracking pixel/links, /schedule questionnaire, Calendly follow-ups) now resolve to the published app in every environment. Consequence: tracking links in emails sent from DEV point at prod, whose separate DB doesn't know dev tokens — dev-sent tracking won't register opens/clicks. That's accepted (dev DB is test-only). To test tracking in dev, temporarily unset PUBLIC_APP_URL or curl `/api/t/...` locally.

In-app media previews must instead use same-origin URLs; apply the published origin only while composing outbound emails.
**Why:** A development video preview pointed at production and returned 404 because its token existed only in the development database.
**How to apply:** Keep dashboard/player preview URLs environment-local and convert to published absolute links at the email boundary.

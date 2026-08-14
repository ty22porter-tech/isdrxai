---
name: Site URL structure
description: Landing page at root, app at /app, api at /api — link and redirect rules after the Aug 2026 restructure
---

# Site URL structure (custom domain isdrxai.com)

- Landing page artifact serves the site root `/`; the main app lives under `/app/`; api-server stays at `/api` (unchanged).
- **Why:** user wanted their custom domain to open the marketing landing page, with the product app behind it.

## How to apply
- Frontend→API calls in the app must be root-absolute `/api/...` — NEVER `${import.meta.env.BASE_URL}/api/...` (that resolves to `/app/api/...` which the SPA rewrite swallows). BASE_URL is only for assets/router/Clerk paths.
- All emailed frontend links (schedule, unsubscribe page, prospects alerts) must be `${PUBLIC_APP_URL}/app/...`. API links (tracking `/api/t/*`, List-Unsubscribe `/api/unsubscribe/*`, storage) stay `/api/...`.
- The landing SPA has RedirectToApp routes (/schedule/:token, /unsubscribe/:token, /prospects, /dashboard, /sign-in, /sign-up) forwarding old root-based links to /app — keep these; prospects still hold pre-restructure emails.
- SEO: canonical/og/sitemap use https://isdrxai.com; sitemap.xml + robots.txt live in the landing artifact's public dir (it owns the root).

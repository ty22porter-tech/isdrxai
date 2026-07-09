# Threat Model

## Project Overview

This project is a public-facing AI SDR platform for small businesses, with a React/Vite dashboard, a public landing site, and an Express 5 API backed by PostgreSQL. Authenticated users manage prospects, campaigns, outreach content, billing, and autopilot workflows; unauthenticated prospects interact through tokenized scheduling and unsubscribe links. The production deployment is public, TLS is platform-managed, and the main security boundaries are Clerk-authenticated dashboard traffic, public capability URLs, and server-side integrations with Stripe, Resend, and OpenAI.

## Assets

- **User accounts and sessions** — Clerk identities plus local `users` rows control access to the dashboard, admin features, billing, and outbound outreach settings. Compromise enables impersonation and tenant data access.
- **Prospect and campaign data** — names, emails, phones, business details, activity history, and outreach state. This is customer business data and includes personal contact information.
- **Outbound and inbound email workflows** — outreach content, unsubscribe capability URLs, reply routing, and scheduling links. Abuse could expose prospect data, enable spam, or let attackers tamper with lead state.
- **Billing state** — Stripe customer/subscription identifiers and product/checkout flows. Abuse could impact account status or payment operations.
- **Application secrets and integration credentials** — database URL, Clerk keys, Stripe credentials, Resend API/webhook secrets, OpenAI API credentials. Leakage would expand compromise beyond the application itself.
- **Admin privileges and operational controls** — `isAdmin`, subscription status, per-client sending identity, and autopilot controls. Misuse affects all tenants.

## Trust Boundaries

- **Browser to API** — all client data is untrusted. The API must authenticate, authorize, validate, and scope every request server-side.
- **Unauthenticated prospect to tokenized public routes** — `/api/schedule/:token` and `/api/unsubscribe/:token` rely on possession of an unguessable token instead of an authenticated session.
- **Server to PostgreSQL** — the API has broad direct database access. Injection or broken scoping at the API layer becomes direct data compromise.
- **Server to Clerk** — session identity is asserted by Clerk middleware and must not be confused with local role or tenant authorization.
- **Server to Stripe / Resend / OpenAI** — webhook verification, outbound requests, and secret handling must preserve origin authenticity and prevent unauthorized actions.
- **Authenticated user to admin boundary** — admin-only routes and state changes must be enforced server-side using trusted role data.
- **Development-only to production boundary** — `artifacts/mockup-sandbox` is not production-reachable and should usually be ignored unless future scans prove otherwise.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/`, `artifacts/api-server/src/lib/requireAuth.ts`.
- Highest-risk areas: public token routes (`schedule`, `unsubscribe`), admin routes, Stripe/Resend webhooks, outbound email/autopilot flows, and OpenAI-backed generation endpoints.
- Public surfaces: `/api/healthz`, `/api/stripe/webhook`, `/api/resend/webhook`, Clerk proxy, `/api/schedule/:token`, `/api/unsubscribe/:token`, `POST /api/video-views`, public landing/video apps.
- Authenticated surfaces: most `/api/*` routes plus the main `artifacts/ai-sdr` dashboard.
- Admin surfaces: `artifacts/api-server/src/routes/admin.ts`.
- Dev-only area to ignore by default: `artifacts/mockup-sandbox`.

## Threat Categories

### Spoofing

The application trusts Clerk for identity, Stripe and Resend for webhook events, and capability URLs for prospect actions. The system must require a valid Clerk-authenticated session for dashboard APIs, verify webhook signatures before processing side effects, and treat tokenized public links as bearer secrets that must be unguessable and minimally exposed.

### Tampering

Authenticated users can mutate prospects, campaigns, outreach content, billing-triggered state, and autopilot behavior; unauthenticated prospects can mutate limited state through scheduling and unsubscribe links. The system must validate request bodies server-side, enforce tenant scoping on every read/write, and ensure public routes can only alter the single resource authorized by the supplied token.

### Information Disclosure

The platform stores customer prospect lists, contact details, business metadata, and campaign activity, and exposes some of it through authenticated APIs and tokenized public pages. The system must prevent cross-tenant reads, avoid leaking PII through logs or verbose errors, and keep public token routes from exposing more prospect/client data than necessary for the specific flow.

### Denial of Service

Public routes accept unauthenticated traffic, including webhook posts, schedule submissions with base64 attachments, and analytics writes. The system must keep these endpoints bounded in CPU, memory, storage, and outbound side effects, and must not allow attackers to trigger unbounded email sending, expensive AI calls, or large attachment processing without adequate abuse controls.

### Elevation of Privilege

The most serious failure mode is a regular user gaining access to another tenant's data or to admin-only operations. The system must enforce tenant filters on every database query, derive privilege from trusted server-side user state only, and prevent any public or authenticated route from changing data outside the caller's authorized scope.
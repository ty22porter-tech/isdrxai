---
name: Admin bootstrap & prod DB separation
description: How to create the first admin, and why production admin changes need a deploy-time bootstrap
---

# Creating an admin (users.is_admin)

There is **no self-serve path to the first admin**: the admin toggle (`PATCH /api/admin/clients/:id`) is itself behind `requireAdmin`, so an admin can only be created by an existing admin. The first admin must be seeded out-of-band.

## Development
Just set it directly: `UPDATE users SET is_admin = true WHERE id = '<clerk_user_id>'` via the database tooling (executeSql, dev environment). The frontend reads `isAdmin` from the `/me` endpoint; user must refresh / re-login for the sidebar "Admin" link to appear.

## Production — the important gotcha
**Production uses a SEPARATE database from development** (different `users` rows / different Clerk user ids). The agent's `executeSql` production path is **READ-ONLY**, so you cannot `UPDATE` prod directly.

Mechanism to promote a prod user to admin:
- `bootstrapAdmin()` in `artifacts/api-server/src/lib/bootstrapAdmin.ts` runs on server startup and promotes any user id(s) in the `BOOTSTRAP_ADMIN_USER_ID` env var (comma-separated) to admin. Idempotent, safe to leave configured.
- Set `BOOTSTRAP_ADMIN_USER_ID` to the prod user id (production-scoped env var), then **the user must re-publish** — the promotion only takes effect on the next deploy's startup.
- Find the prod user id via read-only `executeSql({ environment: "production" })` on the `users` table.

**Why:** prod data (including is_admin) does not sync from dev on publish — only schema does. So a dev-side SQL update never reaches the live app.

---
name: dev/prod Clerk separation + data split
description: Why dev and prod have different user IDs for the same person, and what actually lives in each database. Read before any dev↔prod data migration.
---

# Dev and prod are SEPARATE Clerk tenants
- `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` are **global
  secrets** (not env-scoped), BUT the frontend picks the publishable key by host
  (`publishableKeyFromHost` in ai-sdr/src/App.tsx). Dev host → dev Clerk instance,
  prod host → prod Clerk instance. So they are **different Clerk instances**.
- **Consequence:** the SAME human has DIFFERENT Clerk user IDs in dev vs prod.
  Example: "Whitlock Building Services" = `user_3FmQ26…` in DEV, but
  `user_3Fy2L7…` (ty22porter@gmail.com) in PROD.
- Multi-tenant rows are scoped by `clientId` (= Clerk user id) on prospects,
  campaigns, autopilot_enrollments, emails, activity. **`clientId` is NOT portable
  across environments** — any dev→prod copy MUST remap clientId to the prod user id,
  or the rows are orphaned (invisible to the logged-in prod user).

# What actually lives in each DB (as of 2026-07)
- **DEV** = test/seed only, nothing production-worthy:
  - Whitlock (`user_3FmQ26…`): 3 test prospects aimed at own emails (GTXI/Test
    Logistics→Ty22porter@gmail.com, MDM→Dedrick.poole), campaigns named "test"/"Tese".
  - 43 prospects with `clientId=''` (unowned) = demo companies (Apex Medical Center,
    Greenfield Office Park, …). No owner → never display for any user. Legacy seed.
- **PROD** = the real live accounts: Whitlock (`user_3Fy2L7…`, ty22porter@gmail.com)
  + MDM (`user_3GD0Xs…`). Already set up and operational.
- **Takeaway:** there is no real business data in dev to migrate. Don't pour dev
  test/seed data into prod — it just clutters the live account.

# Serial-PK collision
- prospects/campaigns/enrollments/emails/activity use `serial` int PKs, so dev IDs
  (1..N) overlap prod IDs. Any cross-env copy must let prod assign new serials and
  rewire FKs — never copy rows with their original IDs.

# 24/7 reality
- Deployment is **autoscale** (user declined Reserved VM/always-on for cost).
  Autoscale sleeps when idle and can freeze after responding, so the autopilot
  `setInterval` drip timer and post-webhook fire-and-forget processing are NOT
  reliable unattended. Inbound replies wake the app (webhook = HTTP request) but the
  async completion after the 200 ack is not guaranteed. True unattended 24/7 needs vm.

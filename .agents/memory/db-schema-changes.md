---
name: DB schema changes in @workspace/db
description: How to make Drizzle schema column additions actually take effect (types + DB) in this monorepo
---

# Adding columns to @workspace/db schemas

**Two separate things must both happen, and neither is automatic:**

1. **Database**: `pnpm --filter @workspace/db run push` is interactive and FAILS in this
   non-TTY environment whenever it wants to add a unique constraint (it prompts to
   truncate). The `prospects.schedule_token` unique constraint is an existing
   discrepancy that push keeps trying to add, so push reliably breaks here.
   **Workaround:** apply additive column changes with raw SQL via `psql "$DATABASE_URL"`
   using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`. Avoids the truncate prompt.

2. **TypeScript types**: consumers (api-server, ai-sdr) resolve `@workspace/db` types
   through the **project-reference build output `lib/db/dist`**, NOT the source `src`,
   even though package.json `exports` points at `src`. After editing a schema file you
   MUST rebuild: `cd lib/db && pnpm exec tsc --build --force`. Otherwise tsc reports
   "Property 'X' does not exist" for new columns while the runtime (tsx, reads source)
   works fine — a confusing split where the app runs but typecheck fails.

**Why:** runtime uses tsx (source), typecheck uses the stale composite dist. They drift.
**How to apply:** any schema column add/rename → raw-SQL the DB change + rebuild lib/db.

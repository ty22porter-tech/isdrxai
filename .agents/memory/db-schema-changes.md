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

# NOT NULL UNIQUE column added by a merged task → silent insert breakage

When a merged task adds a `notNull().unique()` column (e.g. prospects.unsubscribe_token / reply_token), the automated post-merge drizzle push FAILS on the TTY truncate prompt and applies nothing. Result: the dev DB never gets the column, so every INSERT that writes it throws — surfaced to users as "can't save" (e.g. Add prospects does nothing). Prod is even worse: publish diffs the *dev DB* against prod, so if dev is missing the column, prod stays missing too even after republish.
**How to apply:** after any merge that adds columns, verify with `\d <table>` and raw-SQL any missing ones (ADD COLUMN nullable → backfill → SET NOT NULL → ADD CONSTRAINT ... UNIQUE), then have the user re-publish so the now-correct dev schema propagates to prod. Backfill convention for the token split: unsubscribe_token = reply_token = schedule_token for existing rows.

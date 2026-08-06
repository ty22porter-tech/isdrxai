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
**How to apply:** any schema column add/rename → run the schema guard (below) or raw-SQL the DB change + rebuild lib/db.

# Schema guard (automatic additive drift repair)

The db lib exposes `ensureAdditiveColumns(pool, logger)` (schemaGuard) plus a CLI script
`pnpm --filter @workspace/db run ensure-columns`. It diffs drizzle schema vs
information_schema and applies `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for nullable
or DB-defaulted columns, and now also CREATE TABLE IF NOT EXISTS for tables missing
entirely (columns, PKs, defaults, unique indexes; foreign keys and check constraints
are deliberately omitted and warned loudly — exit 0). It still exits 1 for NOT NULL
columns without a DB default, generated columns, and unique indexes over SQL
expressions — those need manual SQL. It runs (1) at api-server startup,
(2) from the post-merge script (`scripts/post-merge.sh`), and (3) as a self-heal inside
requireAuth when a users select hits Postgres 42703 (missing column).
**Why:** a merged task's new users column once 500'd every API request because
requireAuth selects the full row; drizzle push can't run non-interactively here.
**How to apply:** trust the guard for additive columns and brand-new tables; only
hand-write SQL for FKs on auto-created tables, NOT NULL-without-default, renames,
or constraint changes.

# NOT NULL UNIQUE column added by a merged task → silent insert breakage

When a merged task adds a `notNull().unique()` column (e.g. prospects.unsubscribe_token / reply_token), the automated post-merge drizzle push FAILS on the TTY truncate prompt and applies nothing. Result: the dev DB never gets the column, so every INSERT that writes it throws — surfaced to users as "can't save" (e.g. Add prospects does nothing). Prod is even worse: publish diffs the *dev DB* against prod, so if dev is missing the column, prod stays missing too even after republish.
**How to apply:** after any merge that adds columns, verify with `\d <table>` and raw-SQL any missing ones (ADD COLUMN nullable → backfill → SET NOT NULL → ADD CONSTRAINT ... UNIQUE), then have the user re-publish so the now-correct dev schema propagates to prod. Backfill convention for the token split: unsubscribe_token = reply_token = schedule_token for existing rows.

**Type/rename drift:** the schema guard now also compares live column types (normalized: serial≡integer, varchar(n)≡character varying(n), timestamp≡timestamp without time zone) and refuses to auto-add a missing column when the table has unmatched live columns of a compatible type (probable rename). Both exit non-zero from ensure-columns — fix with manual ALTER TYPE (USING) or RENAME COLUMN, never by letting the guard add an empty column.

# @workspace/db

Shared Drizzle schema + database access for the API server, plus a **schema
guard** (`ensure-columns`) that keeps the database in sync with the schema for
safe, additive changes.

## Why the schema guard exists

The live app once broke because a task added columns to the Drizzle schema,
but the dev database was never updated before "Publish" — so production never
got the columns and queries failed at runtime.

Defenses now in place:

1. **api-server startup** runs the schema guard, so additive drift is fixed
   the moment the server boots.
2. **`scripts/post-merge.sh`** runs `ensure-columns` after every task merge
   and **fails loudly** if drift remains that the guard cannot fix. Never
   publish while this is failing.

## Adding a column (or table): the full checklist

1. **Edit the schema** in `lib/db/src/schema/*.ts`.
   - New columns on existing tables must be *additive-safe*: nullable, or
     have a **database-level** default.
   - NOT NULL columns must use a real DB default (e.g.
     `.default(sql`gen_random_uuid()::text`)`), not only an app-level
     `.$defaultFn(...)` — otherwise the publish diff cannot be applied to a
     populated production DB and the Publish approval button greys out.
2. **Sync the dev database** (do NOT use `drizzle-kit push` here — it prompts
   interactively and breaks non-interactive scripts):

   ```sh
   pnpm --filter @workspace/db run ensure-columns
   ```

   - Adds missing columns and creates whole missing tables.
   - Auto-created tables are created **without foreign keys** (a warning is
     printed). Add FKs manually with `ALTER TABLE ... ADD CONSTRAINT`, using
     drizzle's naming convention `<table>_<column>_<foreign_table>_id_fk` so
     the publish diff doesn't try to duplicate them.
   - Exits non-zero if drift remains that it cannot fix (e.g. generated
     columns, expression indexes) — fix those manually with SQL.
3. **Rebuild the lib** so dependents see the new types (the incremental build
   cache can go stale):

   ```sh
   cd lib/db && npx tsc --build --force
   ```

4. **Verify** the API server typechecks and starts cleanly
   (`pnpm --filter @workspace/api-server run typecheck`, restart the
   api-server workflow).
5. **Republish** the app. Production is a separate database; the startup
   schema guard applies the same additive changes there on first boot of the
   new deployment.

## Scripts

- `pnpm --filter @workspace/db run ensure-columns` — apply safe additive
  schema changes to the DB pointed at by `DATABASE_URL`; exit 1 on unfixable
  drift.

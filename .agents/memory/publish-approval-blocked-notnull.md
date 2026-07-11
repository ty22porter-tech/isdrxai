---
name: Publish approval blocked by NOT NULL cols with no DB default
description: Why the "Review and approve" publish button greys out on Database changes, and the dev-side fix
---

# Publish "Database changes: Approval required" greyed out

**Symptom:** Publish is blocked on "Database changes — Approval required" and the "Review and approve" button is greyed/unclickable.

**Root cause:** Publish diffs the DEV database against the PROD database and applies the SQL to prod. If the generated diff contains a statement Postgres can't apply to a *populated* prod table, approval is blocked. The classic case: a column declared `NOT NULL` with only an app-level default (drizzle `.$defaultFn(() => crypto.randomUUID())`) has **no DB-level default**, so the diff is `ADD COLUMN x text NOT NULL` — which Postgres rejects on a table that already has rows.

**Fix (dev-side only — never touch prod directly):**
1. In the drizzle schema, replace `.$defaultFn(...)` with a real DB default: `.default(sql\`gen_random_uuid()::text\`)` (keep `.notNull().unique()`), and `import { sql } from "drizzle-orm"`. Now the diff becomes `ADD COLUMN ... NOT NULL DEFAULT gen_random_uuid()::text`, which fills existing rows with unique UUIDs — safe and satisfies uniqueness.
2. Reconcile the DEV db so it matches (that's what publish introspects): `ALTER TABLE t ALTER COLUMN c SET DEFAULT gen_random_uuid()::text`.
3. Verify prod values are unique/non-null before relying on a UNIQUE constraint being added on publish (query prod read-only).
4. Rebuild `lib/db` (`tsc --build`) and restart api-server, then tell the user to re-publish.

**Why:** Publish compares actual DB state, not the TS schema file. An app-level default never reaches the DB, so it can't rescue an `ADD COLUMN NOT NULL` on populated prod.

**Gotcha:** A half-applied `drizzle-kit push` can leave an **orphan index** with the constraint's name (e.g. `t_col_unique`, relkind `i`) but no matching `pg_constraint`. `ADD CONSTRAINT` then fails with "relation already exists". Fix: `DROP INDEX IF EXISTS <name>` then `ADD CONSTRAINT`. Run `SET DEFAULT`/DDL as separate single statements — a failing statement in a multi-statement `executeSql` rolls back the whole batch.

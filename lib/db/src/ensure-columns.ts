/**
 * CLI entrypoint: applies safe additive schema changes to the database
 * pointed at by DATABASE_URL. Used by the post-merge setup script so merged
 * tasks that add columns don't leave the dev database schema drifted.
 *
 * Exits non-zero if drift remains that could not be fixed automatically.
 */
import { pool } from "./index";
import { ensureAdditiveColumns } from "./schemaGuard";

const result = await ensureAdditiveColumns(pool, console);
await pool.end();

if (result.applied.length > 0) {
  console.log(`[schema-guard] applied ${result.applied.length} additive column(s): ${result.applied.join(", ")}`);
}
if (result.unfixable.length > 0) {
  process.exit(1);
}

import { is, SQL } from "drizzle-orm";
import { PgTable, PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import type pg from "pg";
import * as schema from "./schema";

type GuardLogger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export type SchemaGuardResult = {
  /** Columns that were added automatically (as `table.column`). */
  applied: string[];
  /** Problems that could NOT be fixed automatically (missing tables, NOT NULL columns without a DB default). */
  unfixable: string[];
};

const dialect = new PgDialect();

function renderDefault(def: unknown): string | null {
  if (def === undefined) return null;
  if (is(def, SQL)) {
    const q = dialect.sqlToQuery(def as SQL);
    return q.params.length === 0 ? q.sql : null;
  }
  switch (typeof def) {
    case "number":
      return Number.isFinite(def) ? String(def) : null;
    case "boolean":
      return def ? "true" : "false";
    case "string":
      return `'${def.replace(/'/g, "''")}'`;
    case "object":
      if (def === null) return "NULL";
      return `'${JSON.stringify(def).replace(/'/g, "''")}'::jsonb`;
    default:
      return null;
  }
}

/**
 * Compares the drizzle schema's expected tables/columns against the live
 * database and applies safe additive changes (new nullable columns, or new
 * NOT NULL columns that carry a renderable DB default) via
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
 *
 * Anything it cannot fix safely (missing tables, NOT NULL columns without a
 * usable default) is reported loudly instead of guessed at.
 */
export async function ensureAdditiveColumns(
  pool: pg.Pool,
  logger: GuardLogger = console,
): Promise<SchemaGuardResult> {
  const result: SchemaGuardResult = { applied: [], unfixable: [] };

  const tables: PgTable[] = [];
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) tables.push(value as PgTable);
  }

  const live = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );
  const liveTables = new Map<string, Set<string>>();
  for (const row of live.rows) {
    let cols = liveTables.get(row.table_name);
    if (!cols) liveTables.set(row.table_name, (cols = new Set()));
    cols.add(row.column_name);
  }

  for (const table of tables) {
    const cfg = getTableConfig(table);
    const liveCols = liveTables.get(cfg.name);

    if (!liveCols) {
      result.unfixable.push(
        `table "${cfg.name}" is missing from the database (run drizzle push / a migration to create it)`,
      );
      continue;
    }

    for (const col of cfg.columns) {
      if (liveCols.has(col.name)) continue;

      const defaultSql = renderDefault(col.default);
      let ddl: string | null = null;

      if (!col.notNull) {
        ddl = `ALTER TABLE "${cfg.name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.getSQLType()}`;
        if (defaultSql !== null) ddl += ` DEFAULT ${defaultSql}`;
      } else if (defaultSql !== null) {
        ddl = `ALTER TABLE "${cfg.name}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.getSQLType()} DEFAULT ${defaultSql} NOT NULL`;
      }

      if (!ddl) {
        result.unfixable.push(
          `column "${cfg.name}"."${col.name}" is NOT NULL without a database-level default — cannot add it automatically; add it manually with a backfill`,
        );
        continue;
      }

      try {
        await pool.query(ddl);
        result.applied.push(`${cfg.name}.${col.name}`);
        logger.info(`[schema-guard] added missing column: ${cfg.name}.${col.name}`);
      } catch (err) {
        result.unfixable.push(
          `failed to add "${cfg.name}"."${col.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  if (result.unfixable.length > 0) {
    logger.error(
      `[schema-guard] DATABASE SCHEMA DRIFT — the following could not be fixed automatically:\n` +
        result.unfixable.map((m) => `  - ${m}`).join("\n"),
    );
  } else if (result.applied.length === 0) {
    logger.info("[schema-guard] database schema is up to date");
  }

  return result;
}

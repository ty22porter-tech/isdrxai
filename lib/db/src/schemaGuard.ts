import { is, SQL } from "drizzle-orm";
import { PgTable, PgDialect, getTableConfig, IndexedColumn } from "drizzle-orm/pg-core";
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
  /** Tables that were created automatically (by name). */
  createdTables: string[];
  /** Problems that could NOT be fixed automatically (NOT NULL columns without a DB default, un-creatable tables, ...). */
  unfixable: string[];
  /** Things the guard deliberately did NOT do (e.g. foreign keys on auto-created tables) — reported loudly, but not fatal. */
  warnings: string[];
};

const dialect = new PgDialect();

type TableConfig = ReturnType<typeof getTableConfig>;

/**
 * Builds `CREATE TABLE IF NOT EXISTS` DDL (plus `CREATE UNIQUE INDEX IF NOT
 * EXISTS` statements) from a drizzle table config. Foreign keys are NOT
 * created — they are returned as warnings so a human can add them (adding a
 * missing FK later is safe; guessing one wrong is not). Returns null with a
 * reason in `unfixable` when the table has features the guard cannot render
 * safely (e.g. expression indexes, generated columns).
 */
function buildCreateTable(
  cfg: TableConfig,
): { statements: string[]; warnings: string[] } | { unfixable: string } {
  const warnings: string[] = [];
  const colDefs: string[] = [];
  const pkCols: string[] = [];

  for (const col of cfg.columns) {
    if (col.generated || col.generatedIdentity) {
      return {
        unfixable: `table "${cfg.name}" has a generated column ("${col.name}") — cannot create it automatically; create it manually`,
      };
    }
    let def = `"${col.name}" ${col.getSQLType()}`;
    const defaultSql = renderDefault(col.default);
    if (defaultSql !== null) def += ` DEFAULT ${defaultSql}`;
    if (col.notNull && !col.getSQLType().startsWith("serial")) def += ` NOT NULL`;
    if (col.isUnique) def += ` UNIQUE`;
    if (col.primary) pkCols.push(`"${col.name}"`);
    colDefs.push(def);
  }

  for (const pk of cfg.primaryKeys) {
    for (const c of pk.columns) pkCols.push(`"${c.name}"`);
  }
  if (pkCols.length > 0) colDefs.push(`PRIMARY KEY (${pkCols.join(", ")})`);

  for (const uq of cfg.uniqueConstraints) {
    colDefs.push(
      `CONSTRAINT "${uq.name ?? `${cfg.name}_uq`}" UNIQUE (${uq.columns.map((c) => `"${c.name}"`).join(", ")})`,
    );
  }

  if (cfg.checks.length > 0) {
    warnings.push(
      `table "${cfg.name}" was created WITHOUT its ${cfg.checks.length} check constraint(s) — add them manually`,
    );
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS "${cfg.name}" (\n  ${colDefs.join(",\n  ")}\n)`,
  ];

  for (const idx of cfg.indexes) {
    const { name, unique, columns } = idx.config;
    if (!unique) continue; // plain indexes are perf-only; drizzle push can add them later
    const parts: string[] = [];
    for (const c of columns) {
      if (is(c, IndexedColumn)) {
        parts.push(`"${(c as IndexedColumn).name}"`);
      } else {
        return {
          unfixable: `table "${cfg.name}" has unique index "${name}" with a SQL expression — cannot create it automatically; create the table manually`,
        };
      }
    }
    statements.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON "${cfg.name}" (${parts.join(", ")})`,
    );
  }

  for (const fk of cfg.foreignKeys) {
    const ref = fk.reference();
    const from = ref.columns.map((c) => c.name).join(", ");
    const to = `${getTableConfig(ref.foreignTable as PgTable).name}(${ref.foreignColumns.map((c) => c.name).join(", ")})`;
    warnings.push(
      `table "${cfg.name}" was created WITHOUT foreign key (${from}) -> ${to} — add it manually if referential integrity is required`,
    );
  }

  return { statements, warnings };
}

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
  const result: SchemaGuardResult = { applied: [], createdTables: [], unfixable: [], warnings: [] };

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
      const built = buildCreateTable(cfg);
      if ("unfixable" in built) {
        result.unfixable.push(built.unfixable);
        continue;
      }
      try {
        for (const stmt of built.statements) {
          await pool.query(stmt);
        }
        result.createdTables.push(cfg.name);
        result.warnings.push(...built.warnings);
        logger.info(`[schema-guard] created missing table: ${cfg.name}`);
      } catch (err) {
        result.unfixable.push(
          `failed to create table "${cfg.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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

  if (result.warnings.length > 0) {
    logger.warn(
      `[schema-guard] WARNINGS — the guard deliberately did not apply the following:\n` +
        result.warnings.map((m) => `  - ${m}`).join("\n"),
    );
  }
  if (result.unfixable.length > 0) {
    logger.error(
      `[schema-guard] DATABASE SCHEMA DRIFT — the following could not be fixed automatically:\n` +
        result.unfixable.map((m) => `  - ${m}`).join("\n"),
    );
  } else if (result.applied.length === 0 && result.createdTables.length === 0) {
    logger.info("[schema-guard] database schema is up to date");
  }

  return result;
}

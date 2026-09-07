import { Router, type IRouter, type RequestHandler } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db, prospectsTable, campaignsTable, notificationsTable, scoreEventsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const livenessCheck: RequestHandler = (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
};

// The API artifact's public base path is also used by deployment uptime
// monitoring. Keep it as the same dependency-free liveness check as /healthz
// so a healthy process is never reported down merely because /api returned 404.
router.get("/", livenessCheck);
router.get("/healthz", livenessCheck);

// Deep health check: verifies each major table is actually queryable, so a
// missing table/column (the cause of past production 500s) is caught by a
// monitor hitting this endpoint instead of by a user hitting a broken page.
const HEALTH_TABLES = {
  prospects: prospectsTable,
  campaigns: campaignsTable,
  notifications: notificationsTable,
  score_events: scoreEventsTable,
} as const;

router.get("/health", async (_req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  for (const [name, table] of Object.entries(HEALTH_TABLES)) {
    try {
      // SELECT every mapped column (LIMIT 1) so a column missing from the
      // live DB fails the check — `SELECT 1` would pass despite drift.
      await db.select().from(table as any).limit(1);
      checks[name] = "ok";
    } catch (err) {
      healthy = false;
      const message = err instanceof Error ? err.message : String(err);
      checks[name] = `error: ${message}`;
      logger.error({ table: name, err }, "[health] table check failed");
    }
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checks,
  });
});

export default router;

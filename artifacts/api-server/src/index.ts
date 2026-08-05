import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { startAutopilotEngine } from "./lib/autopilotEngine";
import { ensureResendWebhook } from "./lib/resendWebhook";
import { ensureCalendlyWebhook } from "./lib/calendlyWebhook";
import { bootstrapAdmin } from "./lib/bootstrapAdmin";
import { pool, ensureAdditiveColumns } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe init");
    return;
  }
  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info("Stripe webhook configured");

    stripeSync.syncBackfill({ object: "all" })
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err: any) => logger.error({ err }, "Stripe backfill error"));
  } catch (err) {
    logger.error({ err }, "Failed to initialize Stripe — continuing without it");
  }
}

// Ensure the live DB has every column the drizzle schema expects before
// anything selects from it — a single missing column would otherwise 500
// every request that goes through requireAuth.
try {
  await ensureAdditiveColumns(pool, logger);
} catch (err) {
  logger.error({ err }, "[schema-guard] startup schema check failed — continuing, but requests may fail if the schema has drifted");
}

await initStripe();
await bootstrapAdmin();
await ensureResendWebhook();
await ensureCalendlyWebhook();
startAutopilotEngine(logger);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

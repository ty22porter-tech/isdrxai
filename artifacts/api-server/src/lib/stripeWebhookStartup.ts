type StartupEnvironment = {
  NODE_ENV?: string;
  REPLIT_DEPLOYMENT?: string;
  REPLIT_DOMAINS?: string;
};

/**
 * The sync library's managed-webhook helper deletes endpoints absent from its
 * local DB. Development must never invoke it against a shared Stripe account.
 * NODE_ENV alone is insufficient: local production-build checks also use it.
 */
export async function configureProductionStripeWebhook(
  sync: { findOrCreateManagedWebhook: (url: string) => Promise<unknown> },
  log: { info: (message: string) => void },
  env: StartupEnvironment = process.env,
): Promise<void> {
  if (env.REPLIT_DEPLOYMENT !== "1" || env.NODE_ENV !== "production") {
    log.info("Stripe webhook registration skipped outside published production; existing endpoints unchanged");
    return;
  }

  const host = env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (!host || !/^[a-z0-9.-]+$/i.test(host) ||
      !host.includes(".") || host.toLowerCase().endsWith(".replit.dev")) {
    throw new Error("Published Stripe webhook requires a valid production hostname");
  }
  await sync.findOrCreateManagedWebhook(`https://${host}/api/stripe/webhook`);
  log.info("Production Stripe webhook configured");
}
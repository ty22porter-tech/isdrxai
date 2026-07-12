import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

async function getConnectorCredentials(): Promise<{ secretKey: string; webhookSecret?: string } | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    return null;
  }

  try {
    const resp = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
      {
        headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      return null;
    }

    const data = await resp.json() as { items?: Array<{ settings?: { secret_key?: string; webhook_secret?: string } }> };
    const settings = data.items?.[0]?.settings;

    if (!settings?.secret_key) {
      return null;
    }

    return {
      secretKey: settings.secret_key,
      webhookSecret: settings.webhook_secret,
    };
  } catch {
    return null;
  }
}

async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  // Prefer the Replit Stripe connector when it is bound and serving credentials.
  const fromConnector = await getConnectorCredentials();
  if (fromConnector) {
    return fromConnector;
  }

  // Fallback: a directly-provided secret key stored as a Replit secret. This is
  // used when the connector binding is unavailable/stale.
  const envSecretKey = process.env.STRIPE_SECRET_KEY;
  if (envSecretKey) {
    return {
      secretKey: envSecretKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    };
  }

  throw new Error(
    "Stripe integration not connected or missing secret key. Connect Stripe via the Integrations tab, or set the STRIPE_SECRET_KEY secret.",
  );
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}

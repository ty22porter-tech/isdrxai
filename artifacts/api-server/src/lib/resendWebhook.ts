import { Resend } from "resend";
import { getPublicAppUrl } from "./publicUrl";
import { logger } from "./logger";

const WEBHOOK_PATH = "/api/resend/webhook";

/**
 * Idempotently ensure the Resend inbound ("email.received") webhook points at
 * this deployment, mirroring how the Stripe webhook is self-provisioned on boot.
 *
 * Only runs when Option B is switched on for the environment (INBOUND_REPLY_DOMAIN
 * set) — in development it's unset, so this is a no-op and dev never registers a
 * webhook or alters outbound Reply-To behavior. On boot it resolves the public
 * URL from REPLIT_DOMAINS (the deployment domain in production), finds an existing
 * webhook for that endpoint (reusing its signing secret via webhooks.get) or
 * creates a new one, then loads the signing secret into the process env so the
 * request handler can verify incoming events.
 */
export async function ensureResendWebhook(): Promise<void> {
  if (!process.env.INBOUND_REPLY_DOMAIN) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn("INBOUND_REPLY_DOMAIN set but RESEND_API_KEY missing — inbound webhook not configured");
    return;
  }

  const base = getPublicAppUrl();
  if (!base) {
    logger.warn("Cannot resolve public app URL — inbound webhook not configured");
    return;
  }

  const endpoint = `${base}${WEBHOOK_PATH}`;
  const resend = new Resend(apiKey);

  try {
    const list = await resend.webhooks.list({ limit: 100 });
    const existing = (list.data?.data ?? []).find((w) => w.endpoint === endpoint);

    let secret: string | undefined;
    if (existing) {
      const full = await resend.webhooks.get(existing.id);
      secret = full.data?.signing_secret;
      logger.info({ endpoint, id: existing.id }, "Reusing existing Resend inbound webhook");
    } else {
      const created = await resend.webhooks.create({ endpoint, events: ["email.received"] });
      secret = created.data?.signing_secret;
      logger.info({ endpoint, id: created.data?.id }, "Created Resend inbound webhook");
    }

    if (!secret) {
      logger.error({ endpoint }, "Resend webhook has no signing secret — inbound verification will fail");
      return;
    }
    process.env.RESEND_WEBHOOK_SECRET = secret;
  } catch (err: any) {
    logger.error({ err: err?.message, endpoint }, "Failed to ensure Resend inbound webhook");
  }
}

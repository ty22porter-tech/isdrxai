import crypto from "crypto";
import { getPublicAppUrl } from "./publicUrl";
import { logger } from "./logger";

const WEBHOOK_PATH = "/api/calendly/webhook";
const CALENDLY_API = "https://api.calendly.com";

/**
 * Idempotently ensure a Calendly webhook subscription points at this
 * deployment, mirroring the Resend webhook self-provisioning in
 * resendWebhook.ts.
 *
 * Requires CALENDLY_API_TOKEN (a Calendly personal access token). The signing
 * key is either the CALENDLY_WEBHOOK_SIGNING_KEY secret or, when unset,
 * deterministically derived from SESSION_SECRET so it is stable across
 * restarts (Calendly lets the caller supply the signing key at subscription
 * creation and never returns it afterwards, so it must be reproducible).
 * After registering, the effective key is loaded into
 * process.env.CALENDLY_WEBHOOK_SIGNING_KEY for the request handler.
 *
 * Without CALENDLY_API_TOKEN this is a no-op; the webhook handler then rejects
 * all requests in production (fail closed) and accepts-with-warning in dev.
 */
export async function ensureCalendlyWebhook(): Promise<void> {
  const token = process.env.CALENDLY_API_TOKEN;
  if (!token) {
    if (!process.env.CALENDLY_WEBHOOK_SIGNING_KEY) {
      logger.info("CALENDLY_API_TOKEN not set — Calendly webhook not auto-registered (direct-booking sync stays off until configured)");
    }
    return;
  }

  const base = getPublicAppUrl();
  if (!base) {
    logger.warn("Cannot resolve public app URL — Calendly webhook not configured");
    return;
  }
  const callbackUrl = `${base}${WEBHOOK_PATH}`;

  // Signing key must come from real secret material. Calendly accepts a
  // caller-supplied signing key at creation and never returns it later, so it
  // must be reproducible across restarts: either the explicit secret, or a
  // key derived from a strong SESSION_SECRET. Never fall back to a
  // predictable value — a guessable key would let attackers forge signatures,
  // which is worse than fail-closed.
  let signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret || sessionSecret.length < 32) {
      logger.error("Cannot derive a Calendly webhook signing key: set CALENDLY_WEBHOOK_SIGNING_KEY, or a SESSION_SECRET of at least 32 chars. Webhook not registered; production requests stay rejected (fail closed).");
      return;
    }
    signingKey = crypto.createHmac("sha256", sessionSecret).update("calendly-webhook-signing-key").digest("hex");
  }

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    const meRes = await fetch(`${CALENDLY_API}/users/me`, { headers });
    if (!meRes.ok) {
      logger.error({ status: meRes.status }, "Calendly /users/me failed — check CALENDLY_API_TOKEN");
      return;
    }
    const me: any = await meRes.json();
    const organization: string | undefined = me?.resource?.current_organization;
    const userUri: string | undefined = me?.resource?.uri;
    if (!organization || !userUri) {
      logger.error("Calendly /users/me missing organization/user URI");
      return;
    }

    // Prefer organization scope (covers every member's bookings); fall back to
    // user scope when the token lacks org-admin rights.
    for (const scope of ["organization", "user"] as const) {
      const params = new URLSearchParams({ organization, scope });
      if (scope === "user") params.set("user", userUri);

      const listRes = await fetch(`${CALENDLY_API}/webhook_subscriptions?${params}`, { headers });
      if (!listRes.ok) {
        logger.warn({ status: listRes.status, scope }, "Calendly webhook list failed for scope");
        continue;
      }
      const list: any = await listRes.json();
      const existing = (list?.collection ?? []).find(
        (s: any) => s.callback_url === callbackUrl && s.state === "active",
      );
      if (existing) {
        logger.info({ callbackUrl, scope, uri: existing.uri }, "Reusing existing Calendly webhook subscription");
        process.env.CALENDLY_WEBHOOK_SIGNING_KEY = signingKey;
        return;
      }

      const body: Record<string, unknown> = {
        url: callbackUrl,
        events: ["invitee.created", "invitee.canceled"],
        organization,
        scope,
        signing_key: signingKey,
      };
      if (scope === "user") body.user = userUri;

      const createRes = await fetch(`${CALENDLY_API}/webhook_subscriptions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (createRes.ok) {
        const created: any = await createRes.json();
        logger.info({ callbackUrl, scope, uri: created?.resource?.uri }, "Created Calendly webhook subscription");
        process.env.CALENDLY_WEBHOOK_SIGNING_KEY = signingKey;
        return;
      }
      const text = await createRes.text().catch(() => "");
      logger.warn({ status: createRes.status, scope, body: text.slice(0, 300) }, "Calendly webhook create failed for scope");
    }

    logger.error({ callbackUrl }, "Failed to register Calendly webhook under any scope");
  } catch (err: any) {
    logger.error({ err: err?.message, callbackUrl }, "Failed to ensure Calendly webhook");
  }
}

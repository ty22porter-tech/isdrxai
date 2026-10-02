import type { Request, Response } from "express";
import { Resend } from "resend";
import { outboundResendRequest } from "./outboundResend";
import { handleDeliveryWebhookEvent } from "./deliveryEvents";
import { getPublicAppUrl } from "./publicUrl";
import { logger } from "./logger";

export const OUTBOUND_WEBHOOK_PATH = "/api/resend/outbound-webhook";
const DELIVERY_EVENTS = ["email.delivered", "email.bounced", "email.complained"];
let signingSecret: string | undefined;
// This SDK instance never makes API calls. Verification is entirely local.
const signatureVerifier = new Resend("re_local_signature_verification_only");

export function assertOutboundDeliveryReady(): void {
  if (process.env.NODE_ENV === "production" && !signingSecret) {
    throw new Error("Outbound email is unavailable: verified domain and delivery webhook are not ready.");
  }
}

type ApiObject = Record<string, any>;

async function requestJson(path: string, init?: RequestInit): Promise<ApiObject> {
  let response = await outboundResendRequest(path, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  // Startup needs several API calls; Resend rate limits the account across
  // autoscale instances. Retry explicit throttles, never ambiguous POST failures.
  for (let attempt = 0; response.status === 429 && attempt < 3; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1100 * (attempt + 1)));
    response = await outboundResendRequest(path, { ...init, signal: AbortSignal.timeout(15_000) });
  }
  // Never include response bodies or connector errors: they can contain secrets.
  if (!response.ok) throw new Error("Outbound Resend configuration request failed");
  const result = await response.json();
  if (!result || typeof result !== "object" || ("error" in result && result.error)) {
    throw new Error("Invalid outbound Resend configuration response");
  }
  return result as ApiObject;
}

async function findInList(path: string, matches: (entry: ApiObject) => boolean): Promise<ApiObject | undefined> {
  let after: string | undefined;
  const cursors = new Set<string>();
  for (;;) {
    const page = await requestJson(`${path}?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    if (!Array.isArray(page.data)) throw new Error("Invalid outbound Resend list response");
    const match = page.data.find(matches);
    if (match) return match;
    if (!page.has_more) return undefined;
    after = page.data.at(-1)?.id;
    if (!after || cursors.has(after)) throw new Error("Invalid outbound Resend pagination");
    cursors.add(after);
  }
}

/**
 * Only provision the new connected outbound account in production. Failed
 * configuration leaves sends blocked, but does not prevent the server booting.
 * The signing secret stays in memory and never touches env, disk, or logs.
 */
export async function ensureOutboundResendWebhook(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  signingSecret = undefined;
  try {
    const base = getPublicAppUrl();
    if (!base || new URL(base).protocol !== "https:") {
      throw new Error("A public HTTPS URL is required for the outbound webhook");
    }
    const domain = await findInList("/domains", (entry) => entry.name === "isdrxai.com");
    if (!domain?.id) throw new Error("Outbound sending domain not found");
    const verifiedDomain = await requestJson(`/domains/${encodeURIComponent(domain.id)}`);
    if (
      verifiedDomain.name !== "isdrxai.com"
      || verifiedDomain.status !== "verified"
      || verifiedDomain.capabilities?.sending !== "enabled"
    ) {
      throw new Error("Outbound sending domain is not verified");
    }

    const endpoint = `${base}${OUTBOUND_WEBHOOK_PATH}`;
    const existing = await findInList("/webhooks", (entry) => entry.endpoint === endpoint);
    let id = existing?.id;
    if (id) {
      await requestJson(`/webhooks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: DELIVERY_EVENTS, status: "enabled" }),
      });
    } else {
      const created = await requestJson("/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, events: DELIVERY_EVENTS }),
      });
      id = created.id;
    }
    if (typeof id !== "string" || !id) throw new Error("Outbound webhook has no id");
    // Retrieve the full configuration even after create, to confirm enabled
    // subscriptions and recover the secret safely on every subsequent boot.
    const webhook = await requestJson(`/webhooks/${encodeURIComponent(id)}`);
    if (
      webhook.endpoint !== endpoint
      || webhook.status !== "enabled"
      || !DELIVERY_EVENTS.every((event) => webhook.events?.includes(event))
      || typeof webhook.signing_secret !== "string"
      || !webhook.signing_secret.startsWith("whsec_")
      || webhook.signing_secret.length <= 6
    ) {
      throw new Error("Outbound webhook configuration is incomplete");
    }
    signingSecret = webhook.signing_secret;
    logger.info("Outbound sending domain and delivery webhook ready");
  } catch {
    signingSecret = undefined;
    logger.error("Outbound Resend setup failed — sending is blocked until domain and delivery webhook are ready");
  }
}

export async function handleOutboundResendWebhook(req: Request, res: Response): Promise<void> {
  const secret = signingSecret;
  if (!secret) {
    res.status(503).json({ error: "Outbound delivery webhook is not configured" });
    return;
  }
  let event;
  try {
    if (!Buffer.isBuffer(req.body)) throw new Error("Raw payload required");
    const pick = (svix: string, webhook: string): string => {
      const value = req.headers[svix] ?? req.headers[webhook];
      return typeof value === "string" ? value : "";
    };
    event = signatureVerifier.webhooks.verify({
      payload: req.body.toString("utf8"),
      headers: {
        id: pick("svix-id", "webhook-id"),
        timestamp: pick("svix-timestamp", "webhook-timestamp"),
        signature: pick("svix-signature", "webhook-signature"),
      },
      webhookSecret: secret,
    });
  } catch {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }
  try {
    if (DELIVERY_EVENTS.includes(event.type)) {
      await handleDeliveryWebhookEvent(event);
    }
    res.status(200).json({ received: true });
  } catch {
    logger.error("Outbound delivery event processing failed — provider should retry");
    res.status(500).json({ error: "Delivery event processing failed" });
  }
}
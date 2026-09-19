import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { Resend } from "resend";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { handleResendWebhookEvent } from "./lib/inboundReply";
import { handleDeliveryWebhookEvent } from "./lib/deliveryEvents";
import trackingRouter from "./routes/tracking";
import { demoRequestRouter } from "./routes/demoRequest";
import { contactUsRouter } from "./routes/contactUs";
import { conversionEventsRouter } from "./routes/conversionEvents";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import scheduleRouter from "./routes/schedule";
import unsubscribeRouter from "./routes/unsubscribe";
import { handleCalendlyWebhook } from "./routes/calendlyWebhook";
import { giftVideoPublicRouter } from "./routes/gift-videos";

const app: Express = express();

// Research reports carry evidence, citations, and a signed handoff for every
// lead. A realistic 100-lead batch is several MB, so these ingestion
// endpoints need a larger (but still bounded) parser than ordinary API calls.
// Keep the default parser at 100 KB for every other JSON endpoint.
export const RESEARCH_PAYLOAD_JSON_LIMIT = "8mb";
const researchPayloadJson = express.json({ limit: RESEARCH_PAYLOAD_JSON_LIMIT });
const researchPayloadPaths = new Set([
  "/api/ai/enrich-leads",
  "/api/prospects",
  "/api/prospects/bulk",
]);
const normalizedRequestPath = (path: string) => path.length > 1 ? path.replace(/\/+$/, "") : path;

// 1. Stripe webhook BEFORE express.json() — needs raw Buffer
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing stripe-signature" });
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      return res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error({ err: error }, "Webhook error");
      return res.status(400).json({ error: "Webhook processing error" });
    }
  },
);

// 1b. Resend inbound webhook BEFORE express.json() — needs raw Buffer for Svix signature.
app.post(
  "/api/resend/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      logger.error("RESEND_WEBHOOK_SECRET not set — cannot verify inbound webhook");
      return res.status(500).json({ error: "Inbound email not configured" });
    }
    let event;
    try {
      const payload = (req.body as Buffer).toString("utf8");
      const resend = new Resend(process.env.RESEND_API_KEY);
      // resend.webhooks.verify() reads headers.id / .timestamp / .signature
      // (it maps them to the standardwebhooks `webhook-*` names internally).
      // The inbound request carries them as `svix-*` (Resend uses Svix), with
      // `webhook-*` as a forward-compatible fallback. Passing a `Headers`
      // object here silently breaks verification ("Missing required headers")
      // because Headers has no .id/.timestamp/.signature properties.
      const h = req.headers;
      const pick = (svix: string, webhook: string): string =>
        (h[svix] as string) || (h[webhook] as string) || "";
      event = resend.webhooks.verify({
        payload,
        headers: {
          id: pick("svix-id", "webhook-id"),
          timestamp: pick("svix-timestamp", "webhook-timestamp"),
          signature: pick("svix-signature", "webhook-signature"),
        },
        webhookSecret: secret,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Resend webhook verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }
    // Ack fast so Resend doesn't retry; process the reply asynchronously.
    res.status(200).json({ received: true });
    handleResendWebhookEvent(event as any).catch((err) =>
      logger.error({ err }, "Inbound reply processing failed"),
    );
    handleDeliveryWebhookEvent(event as any).catch((err) =>
      logger.error({ err }, "Delivery event processing failed"),
    );
    return;
  },
);

// 1c. Calendly webhook BEFORE express.json() — needs raw Buffer for HMAC signature.
app.post(
  "/api/calendly/webhook",
  express.raw({ type: "application/json" }),
  handleCalendlyWebhook,
);

// 2. Clerk proxy BEFORE body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// 3. Logging + CORS + body parsers
app.use(
  pinoHttp({
    logger,
    // Every 5xx response gets a structured error-level log line so silent
    // production breakage shows up in deployment logs without a user report.
    customLogLevel: (_req, res, err) =>
      res.statusCode >= 500 || err ? "error" : "info",
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));

// Public scheduling endpoints (no auth). The large body parser (45MB, for floor-plan
// uploads) is applied INSIDE the router AFTER token validation, so invalid tokens are
// rejected cheaply without buffering oversized payloads.
app.use("/api/schedule", scheduleRouter);

// Public unsubscribe endpoints (no auth) — mounted before the Clerk auth middleware
// so prospects (and mail providers doing one-click List-Unsubscribe) can reach them.
app.use("/api/unsubscribe", express.json(), unsubscribeRouter);

// Public engagement-tracking endpoints (pixel + tracked link redirects) — no
// auth; keyed by unguessable per-email tokens and rate-limited internally.
app.use("/api/t", trackingRouter);

// Public demo-request form (marketing landing page) — no auth; validated,
// honeypot-protected, and rate-limited inside the router.
app.use("/api/demo-request", express.json({ limit: "50kb" }), demoRequestRouter);
app.use("/api/contact-us", express.json({ limit: "50kb" }), contactUsRouter);
app.use("/api/conversion-events", express.json({ limit: "10kb" }), conversionEventsRouter);

app.use((req, res, next) => {
  if (req.method === "POST" && researchPayloadPaths.has(normalizedRequestPath(req.path))) {
    return researchPayloadJson(req, res, next);
  }
  return next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Recipient links are capability-scoped and must work without an app login.
app.use("/api/gift-videos", giftVideoPublicRouter);

// 4. Clerk auth middleware
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// 5. API routes
app.use("/api", router);

// 6. Final error handler — logs a structured error line (method, path, stack)
// for every unhandled route error so production 500s are visible in the
// deployment logs, then returns a generic 500 without leaking internals.
app.use(
  (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestError = err as { status?: number; statusCode?: number; type?: string };
    if (
      requestError?.status === 413
      || requestError?.statusCode === 413
      || requestError?.type === "entity.too.large"
    ) {
      logger.warn(
        { method: req.method, path: req.originalUrl?.split("?")[0] },
        "Request payload exceeded the allowed size",
      );
      if (!res.headersSent) {
        const researchPayload = researchPayloadPaths.has(normalizedRequestPath(req.path));
        res.status(413).json({
          error: researchPayload
            ? "Request payload is too large. Reduce the request size or send fewer researched leads (maximum 100), then try again."
            : "Request payload is too large. Reduce the request size and try again.",
          code: "payload_too_large",
        });
      }
      return;
    }
    logger.error(
      { err, method: req.method, path: req.originalUrl?.split("?")[0] },
      "Unhandled request error (500)",
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default app;

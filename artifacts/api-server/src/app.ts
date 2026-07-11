import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { Resend } from "resend";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import { handleResendWebhookEvent } from "./lib/inboundReply";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import scheduleRouter from "./routes/schedule";
import unsubscribeRouter from "./routes/unsubscribe";

const app: Express = express();

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
      res.status(200).json({ received: true });
    } catch (error: any) {
      logger.error({ err: error }, "Webhook error");
      res.status(400).json({ error: "Webhook processing error" });
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
  },
);

// 2. Clerk proxy BEFORE body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// 3. Logging + CORS + body parsers
app.use(
  pinoHttp({
    logger,
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

export default app;

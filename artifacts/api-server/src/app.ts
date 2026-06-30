import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
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

// Public scheduling endpoints (no auth) — larger body limit to allow floor-plan uploads.
// Floor plans are sent as base64 (≈33% overhead), so the parser limit must exceed the
// 25MB decoded attachment cap enforced in the route. Mounted before the default json
// parser so its own limit applies.
app.use("/api/schedule", express.json({ limit: "45mb" }), scheduleRouter);

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

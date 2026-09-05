import { Router, type IRouter } from "express";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { getCalendlyWebhookStatus } from "../lib/calendlyWebhook";

/**
 * GET /api/calendly/status — reports whether the Calendly direct-booking
 * webhook was successfully registered at boot (see lib/calendlyWebhook.ts),
 * so the Settings page can show connected / not configured / failed without
 * anyone reading server logs.
 */
const router: IRouter = Router();
router.use(requireAuth, requireEntitlement);

router.get("/status", (_req, res) => {
  res.json(getCalendlyWebhookStatus());
});

export default router;

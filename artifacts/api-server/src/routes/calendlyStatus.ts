import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { db, calendlyConnectionsTable as connections } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { CALENDLY_CALLBACK, hash, seal, unseal, exchange, calendlyRequest, CalendlyApiError } from "../lib/calendlyOAuth";
import { consumeCalendlyState } from "../lib/calendlyState";
import { syncCalendly } from "../lib/calendlySync";
import { GetCalendlyStatusResponse, ConnectCalendlyResponse } from "@workspace/api-zod";

const router: IRouter = Router();
router.use(requireAuth, requireEntitlement);
router.use((req, res, next) => {
  if (req.method !== "GET" && req.get("origin") !== `${req.protocol}://${req.get("host")}` &&
    req.get("origin") !== "https://isdrxai.com" && req.get("origin") !== `https://${req.get("host")}`) {
    res.status(403).json({ error: "Invalid request origin" }); return;
  }
  next();
});

router.get("/status", async (req, res) => {
  const [before] = await db.select().from(connections).where(eq(connections.clientId, req.clientId));
  if (before?.credentials && before.subscriptionUri && (!before.lastSyncAt || Date.now() - before.lastSyncAt.getTime() > 15 * 60000)) {
    try { await syncCalendly(req.clientId); } catch { /* Persisted error is shown below. */ }
  }
  const [c] = await db.select().from(connections).where(eq(connections.clientId, req.clientId));
  res.json(GetCalendlyStatusResponse.parse({ state: c?.credentials ? c.error || !c.subscriptionUri ? "failed" : "connected" : "not_configured",
    detail: c?.error ?? (c?.credentials ? c.subscriptionUri ? "Your Calendly account is authorized. Bookings sync only to your workspace." : "Webhook setup is incomplete. Reconnect Calendly to retry." : "Connect your own Calendly account to synchronize bookings."),
    checkedAt: c?.lastSyncAt?.toISOString() ?? null, authorized: !!c?.credentials }));
});

router.post("/connect", async (req, res) => {
  if (!process.env.CALENDLY_CLIENT_ID || !process.env.CALENDLY_CLIENT_SECRET || !process.env.CALENDLY_OAUTH_WEBHOOK_SIGNING_KEY) {
    res.status(503).json({ error: "Calendly OAuth is not configured." }); return;
  }
  // A production OAuth application must not attach credentials to the dev DB.
  if (!process.env.REPLIT_DEPLOYMENT && process.env.NODE_ENV !== "production") {
    res.status(409).json({ error: "Connect Calendly on the published site at https://isdrxai.com after publishing this update." }); return;
  }
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const values = { stateHash: hash(state), verifier: seal(verifier), stateExpiresAt: new Date(Date.now() + 600000) };
  await db.insert(connections).values({ clientId: req.clientId, ...values }).onConflictDoUpdate({ target: connections.clientId, set: values });
  const params = new URLSearchParams({ client_id: process.env.CALENDLY_CLIENT_ID, response_type: "code",
    redirect_uri: CALENDLY_CALLBACK, state, code_challenge_method: "S256",
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
    scope: "users:read scheduled_events:read webhooks:write" });
  res.json(ConnectCalendlyResponse.parse({ url: `https://auth.calendly.com/oauth/authorize?${params}` }));
});

router.get("/oauth/callback", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const pending = await consumeCalendlyState(req.clientId, req.query.state);
  if (pending.kind === "duplicate") { res.redirect("/app/settings"); return; }
  if (pending.kind === "invalid") { res.status(400).send("Expired or invalid Calendly authorization. Open Settings and start a new connection; do not refresh this callback page."); return; }
  let step = "authorization";
  try {
    if (typeof req.query.code !== "string") throw new Error("Authorization was not completed.");
    const credentials = await exchange({ grant_type: "authorization_code", code: req.query.code,
      redirect_uri: CALENDLY_CALLBACK, code_verifier: unseal(pending.verifier) });
    step = "account lookup";
    const meResponse = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${credentials.access_token}` }, signal: AbortSignal.timeout(20000),
    });
    if (!meResponse.ok) throw new Error("Calendly account lookup failed");
    const me = (await meResponse.json() as any).resource;
    if (typeof me?.uri !== "string" || typeof me?.current_organization !== "string") throw new Error("Invalid Calendly account");
    // Update owner and credentials atomically. Unique owner constraint rejects
    // linking an account already claimed by another tenant without leaking tokens.
    await db.update(connections).set({ userUri: me.uri, credentials: seal(credentials), verifier: null, subscriptionUri: null, error: null }).where(eq(connections.clientId, req.clientId));
    // User scope is deliberate: organization scope would mix other customers.
    step = "webhook lookup";
    const listed = await calendlyRequest(req.clientId, `/webhook_subscriptions?${new URLSearchParams({ organization: me.current_organization, user: me.uri, scope: "user" })}`);
    const callback = "https://isdrxai.com/api/calendly/webhook";
    const existing = listed.collection?.find((s: any) => s.callback_url === callback && s.state === "active");
    // Recreate our own callback so its event coverage and signing key are known,
    // including after migrating an older subscription or rotating signing keys.
    if (existing) {
      step = "webhook replacement";
      await calendlyRequest(req.clientId, new URL(existing.uri).pathname, { method: "DELETE" });
    }
    step = "webhook registration";
    const subscription = (await calendlyRequest(req.clientId, "/webhook_subscriptions", {
      method: "POST", body: JSON.stringify({ url: callback, events: ["invitee.created", "invitee.canceled"],
        // OAuth subscriptions use the signing key assigned to the OAuth app.
        organization: me.current_organization, user: me.uri, scope: "user" }),
    })).resource;
    await db.update(connections).set({ subscriptionUri: subscription.uri }).where(eq(connections.clientId, req.clientId));
    step = "initial booking sync";
    await syncCalendly(req.clientId);
    res.redirect("/app/settings?calendly=connected");
  } catch (error) {
    const detail = error instanceof CalendlyApiError ? error.message : "Please reconnect to retry.";
    req.log.warn({ step, providerStatus: error instanceof CalendlyApiError ? error.status : undefined }, "Calendly setup failed");
    await db.update(connections).set({ error: `Calendly ${step} failed. ${detail}` }).where(eq(connections.clientId, req.clientId));
    res.redirect("/app/settings?calendly=failed");
  }
});

router.post("/sync", async (req, res) => {
  try { await syncCalendly(req.clientId); res.json({ ok: true }); }
  catch { res.status(503).json({ error: "Calendly sync failed. Check connection status and retry." }); }
});
router.post("/disconnect", async (req, res) => {
  const [c] = await db.select().from(connections).where(eq(connections.clientId, req.clientId));
  if (c?.subscriptionUri && c.credentials) {
    try { await calendlyRequest(req.clientId, new URL(c.subscriptionUri).pathname, { method: "DELETE" }); }
    catch { /* Credentials are still wiped; future webhook deliveries cannot match. */ }
  }
  await db.delete(connections).where(eq(connections.clientId, req.clientId));
  res.json({ ok: true });
});
export default router;
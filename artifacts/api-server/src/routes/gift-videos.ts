import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import {
  GiftVideoError, createGiftVideo, updateGiftVideo, deleteGiftVideo, getOwnedGiftVideo, serializeGiftVideo,
  createVideoSchema, patchVideoSchema, uploadSchema, requestGiftVideoUpload, giftVideoDashboard, giftVideoTimeline,
  getPublicGiftVideo, getVideoFile, recordVideoVisit, progressSchema, recordVideoProgress, type VisitContext,
} from "../lib/giftVideoOutreach";
import { giftVideoPoster, renderGiftVideoPlayer } from "../lib/giftVideoPlayer";

// Public router MUST be mounted before any blanket auth on /api. Private router
// exports include their own requireAuth and entitlement guards.
export const giftVideoPublicRouter = Router();
const router = Router();
const buckets = new Map<string, { count: number; resetAt: number }>();
function limited(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? req.socket.remoteAddress ?? "";
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= 10000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value!);
    }
    b = { count: 0, resetAt: now + 60_000 };
    buckets.set(key, b);
  }
  if (++b.count > 240) return res.status(429).set("Retry-After", "60").json({ error: "Too many requests. Please wait a minute." });
  return next();
}
function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try { await fn(req, res); }
    catch (err) {
      if (res.headersSent) { res.destroy(err instanceof Error ? err : undefined); return; }
      if (err instanceof z.ZodError) { res.status(400).json({ error: err.issues.map(e => e.message).join("; ") }); return; }
      if (err instanceof GiftVideoError) { res.status(err.status).json({ error: err.message }); return; }
      req.log.error({ err }, "Gift video request failed");
      res.status(500).json({ error: "The video request could not be completed. Please try again." });
    }
  };
}
const idOf = (value: unknown) => z.coerce.number().int().positive().parse(value);
function visitContext(req: Request, res: Response, token: string): VisitContext {
  const cookieName = `gv_${token.slice(0, 12)}`;
  const rawCookie = req.headers.cookie?.split(";").map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const visitorId = rawCookie && /^[a-f0-9]{48}$/.test(rawCookie) ? rawCookie : randomBytes(24).toString("hex");
  if (visitorId !== rawCookie) res.cookie(cookieName, visitorId, {
    httpOnly: true, sameSite: "lax", secure: req.secure || process.env.NODE_ENV === "production",
    path: `/api/gift-videos/watch/${token}`, maxAge: 365 * 86400_000,
  });
  return { visitorId, ip: req.ip ?? req.socket.remoteAddress ?? "",
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 500),
    purpose: `${req.headers.purpose ?? ""} ${req.headers["sec-purpose"] ?? ""}` };
}

giftVideoPublicRouter.use(limited, (_req, res, next) => {
  res.set({ "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive" });
  next();
});
giftVideoPublicRouter.get("/watch/:token", handle(async (req, res) => {
  let video;
  try { video = await getPublicGiftVideo(String(req.params.token)); }
  catch (err) {
    if (!(err instanceof GiftVideoError)) throw err;
    res.status(err.status).type("html").send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Video unavailable</title><body><main><h1>Video unavailable</h1><p>${err.message}</p></main></body></html>`);
    return;
  }
  if (req.method === "HEAD") { res.status(200).end(); return; }
  const context = visitContext(req, res, video.token);
  const visit = await recordVideoVisit(video, context, "video_clicked");
  const page = renderGiftVideoPlayer(video, visit.sessionId);
  res.set("Content-Security-Policy", page.csp).type("html").send(page.html);
}));
giftVideoPublicRouter.get("/watch/:token/poster", handle(async (req, res) => {
  const video = await getPublicGiftVideo(String(req.params.token));
  let thumbnail: Buffer | undefined;
  if (video.thumbnailPath) {
    const file = await getVideoFile(video, true);
    const [bytes] = await file.download();
    thumbnail = bytes;
  }
  res.type("image/png").send(await giftVideoPoster(video, thumbnail));
}));
async function streamMedia(req: Request, res: Response, thumbnail: boolean) {
  const video = await getPublicGiftVideo(String(req.params.token));
  const file = await getVideoFile(video, thumbnail);
  const [meta] = await file.getMetadata();
  const size = Number(meta.size);
  if (!size || !Number.isSafeInteger(size)) throw new GiftVideoError("Media is unavailable", 404);
  let start = 0, end = size - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) { res.status(416).set("Content-Range", `bytes */${size}`).end(); return; }
    if (!match[1]) start = Math.max(0, size - Number(match[2]));
    else start = Number(match[1]);
    if (match[1] && match[2]) end = Math.min(Number(match[2]), size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      res.status(416).set("Content-Range", `bytes */${size}`).end(); return;
    }
    res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  res.set({ "Content-Type": thumbnail ? video.thumbnailContentType! : "video/mp4",
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", "Content-Disposition": "inline" });
  if (req.method === "HEAD") { res.end(); return; }
  const stream = file.createReadStream({ start, end });
  const expiryTimer = video.expiresAt ? setTimeout(() => { stream.destroy(); res.destroy(); },
    Math.min(2147483647, Math.max(1, video.expiresAt.getTime() - Date.now()))) : null;
  res.on("close", () => { if (expiryTimer) clearTimeout(expiryTimer); stream.destroy(); });
  stream.on("error", err => { req.log.error({ err }, "Gift media stream failed"); if (!res.headersSent) res.status(502).end(); else res.destroy(); });
  stream.pipe(res);
}
giftVideoPublicRouter.get("/watch/:token/media", handle((req, res) => streamMedia(req, res, false)));
giftVideoPublicRouter.get("/watch/:token/thumbnail", handle((req, res) => streamMedia(req, res, true)));
giftVideoPublicRouter.post("/watch/:token/progress", handle(async (req, res) => {
  if (req.headers["sec-fetch-site"] === "cross-site") throw new GiftVideoError("Cross-site playback reports are not accepted", 403);
  const video = await getPublicGiftVideo(String(req.params.token));
  const input = progressSchema.parse(req.body);
  res.json(await recordVideoProgress(video, visitContext(req, res, video.token), input));
}));
giftVideoPublicRouter.get("/watch/:token/schedule", handle(async (req, res) => {
  const video = await getPublicGiftVideo(String(req.params.token));
  if (req.method !== "HEAD") await recordVideoVisit(video, visitContext(req, res, video.token), "scheduling_clicked");
  res.redirect(302, video.schedulingLink);
}));

router.use(requireAuth);
router.post("/uploads/request-url", requireEntitlement, handle(async (req, res) => {
  res.json(await requestGiftVideoUpload(req.clientId, uploadSchema.parse(req.body)));
}));
router.get("/dashboard", handle(async (req, res) => {
  const filters = z.object({ campaignId: z.coerce.number().int().positive().optional(), prospectId: z.coerce.number().int().positive().optional() }).parse(req.query);
  res.json(await giftVideoDashboard(req.clientId, filters));
}));
router.post("/", requireEntitlement, handle(async (req, res) => {
  res.status(201).json(await createGiftVideo(req.clientId, createVideoSchema.parse(req.body)));
}));
router.get("/:id/events", handle(async (req, res) => res.json(await giftVideoTimeline(req.clientId, idOf(req.params.id)))));
router.get("/:id", handle(async (req, res) => res.json(serializeGiftVideo(await getOwnedGiftVideo(req.clientId, idOf(req.params.id))))));
router.patch("/:id", requireEntitlement, handle(async (req, res) => res.json(await updateGiftVideo(req.clientId, idOf(req.params.id), patchVideoSchema.parse(req.body)))));
router.delete("/:id", requireEntitlement, handle(async (req, res) => {
  await deleteGiftVideo(req.clientId, idOf(req.params.id));
  res.json({ deleted: true });
}));
export default router;
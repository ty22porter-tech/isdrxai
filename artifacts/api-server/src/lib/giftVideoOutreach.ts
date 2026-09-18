import { randomBytes, createHash } from "node:crypto";
import {
  db, giftVideosTable, giftVideoUploadsTable, giftVideoSessionsTable, giftVideoEventsTable,
  giftOutreachRecordsTable, prospectsTable, campaignsTable, emailsTable, emailOpenEventsTable,
  appointmentsTable, notificationsTable, activityTable, type GiftVideo,
} from "@workspace/db";
import { and, eq, desc, gte, isNull, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { ObjectStorageService } from "./objectStorage";
import { getObjectAclPolicy, setObjectAclPolicy } from "./objectAcl";
import { getPublicAppUrl } from "./publicUrl";
import { recordEngagementEvent, type EngagementEventType } from "./engagementScoring";
import { videoBotReason } from "./trackingClassification";
import { acceptPlayback, classifyVisit, isOwnedUpload, mp4Duration, tokenIsActive, videoStatus } from "./giftVideoMetrics";
import { giftVideoEditStatus, giftVideoLeadStrength } from "./giftVideoPresentation";

const storage = new ObjectStorageService();
export const TRACKING_NOTICE = "Anonymous link activity, not verified recipient identity. Bot filtering is heuristic; playback is estimated from played ranges and elapsed time. Email opens are estimated separately.";
export class GiftVideoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]!));
export const httpsUrl = z.string().trim().max(2000).url().refine(value => {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}, "Use an absolute HTTPS scheduling URL");
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Use a valid YYYY-MM-DD date");
export const videoFieldsSchema = z.object({
  uploadId: z.number().int().positive(),
  thumbnailUploadId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  prospectName: z.string().trim().min(1).max(200),
  giftName: z.string().trim().min(1).max(200),
  giftSentDate: dateOnly,
  cta: z.string().trim().min(1).max(500),
  schedulingLink: httpsUrl,
  introduction: z.string().max(3000).default(""),
  transcript: z.string().max(30000).default(""),
  showNameOnThumbnail: z.boolean().default(true),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional().refine(s => !s || Date.parse(s) > Date.now(), "Expiration must be in the future"),
});
export const createVideoSchema = videoFieldsSchema.extend({ recordId: z.number().int().positive() }).strict();
export const patchVideoSchema = videoFieldsSchema.partial().strict();
export const uploadSchema = z.object({
  kind: z.enum(["video", "thumbnail"]), name: z.string().min(1).max(255),
  size: z.number().int().positive(), contentType: z.enum(["video/mp4", "image/png", "image/jpeg", "image/webp"]),
}).strict().refine(d => d.kind === "video"
  ? d.contentType === "video/mp4" && d.size <= 100 * 1024 * 1024
  : d.contentType !== "video/mp4" && d.size <= 5 * 1024 * 1024,
"MP4 limit is 100 MiB; PNG/JPEG/WebP thumbnail limit is 5 MiB");

export async function requestGiftVideoUpload(clientId: string, input: z.infer<typeof uploadSchema>) {
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const [row] = await db.insert(giftVideoUploadsTable).values({ clientId, objectPath,
    kind: input.kind, size: input.size, contentType: input.contentType, expiresAt }).returning();
  return { uploadId: row.id, uploadURL, objectPath, expiresAt };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function claimUpload(tx: Tx, clientId: string, id: number, kind: "video" | "thumbnail") {
  const [upload] = await tx.select().from(giftVideoUploadsTable).where(and(
    eq(giftVideoUploadsTable.id, id), eq(giftVideoUploadsTable.clientId, clientId),
  )).for("update");
  if (!upload || !isOwnedUpload(upload, clientId, kind)) throw new GiftVideoError("Upload missing, expired, already claimed, or not owned by this account");
  let file;
  try { file = await storage.getObjectEntityFile(upload.objectPath); }
  catch { throw new GiftVideoError("Upload not found. Finish uploading the file before saving."); }
  const acl = await getObjectAclPolicy(file);
  if (acl && acl.owner !== clientId) throw new GiftVideoError("Upload belongs to another account", 403);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (size !== upload.size || !size || size > (kind === "video" ? 100 : 5) * 1024 * 1024)
    throw new GiftVideoError("Uploaded size does not match the reserved size or exceeds the limit");
  if (metadata.contentType?.split(";")[0] !== upload.contentType) throw new GiftVideoError("Uploaded MIME type does not match the reservation");
  if (!metadata.generation) throw new GiftVideoError("Storage did not return an immutable object generation");
  // Pin the verified generation: the still-live PUT URL cannot replace the bytes
  // served by a previously approved video.
  const pinned = file.bucket.file(file.name, { generation: metadata.generation });
  const [bytes] = await pinned.download();
  let duration = 0;
  if (kind === "video") {
    try { duration = mp4Duration(bytes); }
    catch (err) { throw new GiftVideoError(err instanceof Error ? err.message : "Invalid MP4"); }
  }
  else {
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!(upload.contentType === "image/png" && png || upload.contentType === "image/jpeg" && jpeg || upload.contentType === "image/webp" && webp))
      throw new GiftVideoError("Thumbnail bytes do not match its image MIME type");
  }
  await setObjectAclPolicy(pinned, { owner: clientId, visibility: "private" });
  await tx.update(giftVideoUploadsTable).set({ claimedAt: new Date() }).where(eq(giftVideoUploadsTable.id, id));
  return { objectPath: upload.objectPath, generation: String(metadata.generation), size, duration, contentType: upload.contentType };
}

async function ownedRecord(tx: Tx, clientId: string, recordId: number, lock = false) {
  const query = tx.select().from(giftOutreachRecordsTable).where(and(eq(giftOutreachRecordsTable.id, recordId),
    eq(giftOutreachRecordsTable.clientId, clientId)));
  const [record] = await (lock ? query.for("update") : query);
  if (!record) throw new GiftVideoError("Gift record not found", 404);
  const [prospect] = await tx.select().from(prospectsTable).where(and(eq(prospectsTable.id, record.prospectId), eq(prospectsTable.clientId, clientId)));
  const [campaign] = await tx.select().from(campaignsTable).where(and(eq(campaignsTable.id, record.campaignId), eq(campaignsTable.clientId, clientId)));
  if (!prospect || !campaign) throw new GiftVideoError("Gift prospect or campaign not found in this account", 404);
  return record;
}
function assertEditable(record: typeof giftOutreachRecordsTable.$inferSelect, video?: GiftVideo) {
  if (record.sentAt || record.emailId || record.status === "sending" || record.status === "sent"
    || record.sendPayload || video?.emailId) throw new GiftVideoError("A sending or sent video cannot be changed or deleted", 409);
}
async function invalidateRecord(tx: Tx, record: typeof giftOutreachRecordsTable.$inferSelect, videoId: number | null) {
  await tx.update(giftOutreachRecordsTable).set({
    videoId, approvedAt: null, approvedBy: null, approvedRevision: null,
    status: giftVideoEditStatus(record, videoId),
    revision: sql`${giftOutreachRecordsTable.revision} + 1`, updatedAt: new Date(),
  }).where(eq(giftOutreachRecordsTable.id, record.id));
}
export function serializeGiftVideo(v: GiftVideo, forEmail = false) {
  // In-app previews must stay with the current environment's database.
  // Only outbound email links use the configured published origin.
  const watchUrl = `${forEmail ? getPublicAppUrl() : ""}/api/gift-videos/watch/${v.token}`;
  return {
    id: v.id, recordId: v.recordId, prospectId: v.prospectId, campaignId: v.campaignId, emailId: v.emailId,
    title: v.title, prospectName: v.prospectName, giftName: v.giftName, giftSentDate: v.giftSentDate,
    cta: v.cta, schedulingLink: v.schedulingLink, introduction: v.introduction, transcript: v.transcript,
    showNameOnThumbnail: v.showNameOnThumbnail, expiresAt: v.expiresAt, durationSeconds: v.durationSeconds,
    hasThumbnail: !!v.thumbnailPath, createdAt: v.createdAt, updatedAt: v.updatedAt,
    watchUrl, posterUrl: `${watchUrl}/poster`, analyticsAvailable: true as const,
  };
}
export async function getOwnedGiftVideo(clientId: string, id: number) {
  const [v] = await db.select().from(giftVideosTable).where(and(
    eq(giftVideosTable.id, id), eq(giftVideosTable.clientId, clientId), isNull(giftVideosTable.deletedAt)));
  if (!v) throw new GiftVideoError("Video not found", 404);
  return v;
}
export async function createGiftVideo(clientId: string, input: z.infer<typeof createVideoSchema>) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"gift-outreach:" + clientId}))`);
    const record = await ownedRecord(tx, clientId, input.recordId, true);
    assertEditable(record);
    if (record.videoId) throw new GiftVideoError("This gift record already has a video; edit or delete it first", 409);
    const media = await claimUpload(tx, clientId, input.uploadId, "video");
    const thumb = input.thumbnailUploadId ? await claimUpload(tx, clientId, input.thumbnailUploadId, "thumbnail") : null;
    const { uploadId: _upload, thumbnailUploadId: _thumb, expiresAt, ...fields } = input;
    const [video] = await tx.insert(giftVideosTable).values({
      ...fields, clientId, prospectId: record.prospectId, campaignId: record.campaignId,
      token: randomBytes(32).toString("hex"), objectPath: media.objectPath, objectGeneration: media.generation,
      size: media.size, durationSeconds: media.duration, thumbnailPath: thumb?.objectPath,
      thumbnailGeneration: thumb?.generation, thumbnailContentType: thumb?.contentType,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    await invalidateRecord(tx, record, video.id);
    return serializeGiftVideo(video);
  });
}
export async function updateGiftVideo(clientId: string, id: number, input: z.infer<typeof patchVideoSchema>) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"gift-outreach:" + clientId}))`);
    const video = await getOwnedGiftVideo(clientId, id);
    const record = await ownedRecord(tx, clientId, video.recordId, true);
    assertEditable(record, video);
    if (record.videoId !== id) throw new GiftVideoError("Video is no longer attached to this gift", 409);
    const { uploadId, thumbnailUploadId, expiresAt, ...fields } = input;
    const updates: Partial<typeof giftVideosTable.$inferInsert> = { ...fields, updatedAt: new Date() };
    if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (uploadId) {
      const media = await claimUpload(tx, clientId, uploadId, "video");
      Object.assign(updates, { objectPath: media.objectPath, objectGeneration: media.generation, size: media.size, durationSeconds: media.duration });
    }
    if (thumbnailUploadId !== undefined) {
      const thumb = thumbnailUploadId ? await claimUpload(tx, clientId, thumbnailUploadId, "thumbnail") : null;
      Object.assign(updates, { thumbnailPath: thumb?.objectPath ?? null, thumbnailGeneration: thumb?.generation ?? null, thumbnailContentType: thumb?.contentType ?? null });
    }
    const [updated] = await tx.update(giftVideosTable).set(updates).where(and(eq(giftVideosTable.id, id),
      eq(giftVideosTable.clientId, clientId), isNull(giftVideosTable.deletedAt))).returning();
    if (!updated) throw new GiftVideoError("Video was deleted", 409);
    await invalidateRecord(tx, record, id);
    return serializeGiftVideo(updated);
  });
}
export async function deleteGiftVideo(clientId: string, id: number) {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"gift-outreach:" + clientId}))`);
    const video = await getOwnedGiftVideo(clientId, id);
    const record = await ownedRecord(tx, clientId, video.recordId, true);
    assertEditable(record, video);
    await tx.update(giftVideosTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(giftVideosTable.id, id), eq(giftVideosTable.clientId, clientId)));
    if (record.videoId === id) await invalidateRecord(tx, record, null);
  });
}

export async function getPublicGiftVideo(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new GiftVideoError("This video link is unavailable.", 404);
  const [video] = await db.select().from(giftVideosTable).where(eq(giftVideosTable.token, token));
  if (!video || video.deletedAt) throw new GiftVideoError("This video is no longer available.", 404);
  if (!tokenIsActive(video)) throw new GiftVideoError("This video link has expired. Please ask the sender for a new link.", 410);
  return video;
}
export async function getGiftVideoEmailContent(clientId: string, recordId: number, videoId: number) {
  const video = await getOwnedGiftVideo(clientId, videoId);
  const record = await db.transaction(tx => ownedRecord(tx, clientId, recordId));
  if (record.videoId !== videoId || video.recordId !== recordId || video.prospectId !== record.prospectId
    || video.campaignId !== record.campaignId) throw new GiftVideoError("Video does not belong to this gift, prospect, and campaign", 409);
  if (!tokenIsActive(video)) throw new GiftVideoError("The selected video has expired");
  if (!record.giftSent || !record.sentDate || !record.giftName) throw new GiftVideoError("Confirm the gift name and sent date before preparing the video email");
  if (video.giftName !== record.giftName || video.giftSentDate !== record.sentDate)
    throw new GiftVideoError("Video gift reference does not match the current gift record. Update it and approve again.");
  // Verify the immutable, privately owned source still exists at send time.
  const file = await getVideoFile(video);
  const acl = await getObjectAclPolicy(file);
  if (acl?.owner !== clientId || acl.visibility !== "private") throw new GiftVideoError("Video storage ownership could not be verified");
  const { watchUrl, posterUrl } = serializeGiftVideo(video, true);
  const schedulingUrl = `${watchUrl}/schedule`;
  return {
    ready: true,
    html: `<div><p>${escapeHtml(video.introduction)}</p><a href="${escapeHtml(watchUrl)}"><img src="${escapeHtml(posterUrl)}" alt="Play ${escapeHtml(video.title)}" width="560" style="width:100%;max-width:560px;height:auto;border-radius:12px"></a><p>${escapeHtml(video.cta)}</p><p><a href="${escapeHtml(watchUrl)}">Watch Video</a> · <a href="${escapeHtml(schedulingUrl)}">Schedule a quick conversation</a></p></div>`,
    text: `${video.introduction}\n\n${video.cta}\nWatch Video: ${watchUrl}\nSchedule a quick conversation: ${schedulingUrl}`,
    watchUrl, schedulingUrl,
  };
}
export async function attachGiftVideoEmail(videoId: number, emailId: number) {
  await db.transaction(async tx => {
    const [video] = await tx.select().from(giftVideosTable).where(eq(giftVideosTable.id, videoId)).for("update");
    const [email] = await tx.select().from(emailsTable).where(eq(emailsTable.id, emailId));
    if (!video || video.deletedAt || !email || email.clientId !== video.clientId || email.prospectId !== video.prospectId
      || email.campaignId !== video.campaignId || !email.sentAt || ["draft", "scheduled", "failed"].includes(email.status))
      throw new GiftVideoError("Cannot attach an unsent or unrelated email to this video", 409);
    const record = await ownedRecord(tx, video.clientId, video.recordId);
    if (record.videoId !== videoId || record.emailId !== emailId)
      throw new GiftVideoError("The actual sent email must first be saved on its gift record", 409);
    if (video.emailId && video.emailId !== emailId) throw new GiftVideoError("This video is already attached to another email", 409);
    await tx.update(giftVideosTable).set({ emailId, updatedAt: new Date() }).where(eq(giftVideosTable.id, videoId));
  });
}
export async function getVideoFile(video: GiftVideo, thumbnail = false) {
  const path = thumbnail ? video.thumbnailPath : video.objectPath;
  const generation = thumbnail ? video.thumbnailGeneration : video.objectGeneration;
  if (!path || !generation) throw new GiftVideoError("Media not found", 404);
  let file;
  try { file = await storage.getObjectEntityFile(path); }
  catch { throw new GiftVideoError("The video media is no longer available. Please upload it again.", 404); }
  const pinned = file.bucket.file(file.name, { generation });
  const [exists] = await pinned.exists();
  if (!exists) throw new GiftVideoError("The video media is no longer available", 404);
  return pinned;
}

export interface VisitContext { userAgent: string; ip: string; purpose: string; visitorId: string }
export function visitorKey(video: GiftVideo, context: VisitContext) {
  return createHash("sha256").update(`${video.token}|${context.visitorId}|${context.ip}|${context.userAgent}`).digest("hex");
}
async function sentEmail(video: GiftVideo) {
  if (!video.emailId) return null;
  const [email] = await db.select().from(emailsTable).where(and(eq(emailsTable.id, video.emailId),
    eq(emailsTable.clientId, video.clientId), eq(emailsTable.prospectId, video.prospectId), eq(emailsTable.campaignId, video.campaignId)));
  return email ?? null;
}
function eventValues(video: GiftVideo, type: string, key: string) {
  return { videoId: video.id, clientId: video.clientId, prospectId: video.prospectId,
    campaignId: video.campaignId, step: 3, emailId: video.emailId, type, visitorKey: key };
}
export async function recordVideoVisit(video: GiftVideo, context: VisitContext, type: "video_clicked" | "scheduling_clicked") {
  const email = await sentEmail(video);
  const key = visitorKey(video, context);
  const now = new Date();
  let reason = videoBotReason(context.userAgent, email?.sentAt ?? null, context.purpose);
  if (!email) reason ??= "unsent-preview";
  const sessionId = randomBytes(24).toString("hex");
  const result = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(481518, ${video.id})`);
    const recent = await tx.select().from(giftVideoEventsTable).where(and(
      eq(giftVideoEventsTable.videoId, video.id), eq(giftVideoEventsTable.visitorKey, key),
      gte(giftVideoEventsTable.createdAt, new Date(now.getTime() - 30_000)),
      inArray(giftVideoEventsTable.type, ["video_clicked", "scheduling_clicked"]),
    ));
    // Same scanner-burst rule as existing tracking: different email destinations
    // fetched in ten seconds are not treated as a human conversion.
    const classification = classifyVisit(recent, type, reason, now.getTime());
    reason = classification.reason;
    const { duplicate, valid } = classification;
    await tx.insert(giftVideoEventsTable).values({ ...eventValues(video, type, key), sessionId,
      isBot: !!reason, botReason: reason ?? (duplicate ? "duplicate-window" : null), isValid: valid });
    if (valid) await tx.insert(activityTable).values({
      clientId: video.clientId, type: `gift_${type}`, prospectId: video.prospectId, prospectName: video.prospectName,
      description: `${type === "video_clicked" ? "Video clicked" : "Scheduling link clicked"} — ${video.title}; campaign ${video.campaignId}, Step 3 – Gift Follow-Up. Anonymous link activity, not verified recipient identity.`,
    });
    await tx.insert(giftVideoSessionsTable).values({
      id: sessionId, videoId: video.id, visitorKey: key, isBot: !!reason, botReason: reason,
      expiresAt: new Date(Math.min(now.getTime() + 4 * 3600_000, video.expiresAt?.getTime() ?? Infinity)),
    });
    return { valid, sessionId };
  });
  if (result.valid) {
    await recordEngagementEvent(video.prospectId, type === "video_clicked" ? "gift_video_click" : "gift_video_schedule",
      { emailId: video.emailId!, campaignId: video.campaignId, videoId: video.id });
    if (type === "video_clicked") await notifyVideoClick(video, now);
  }
  return result;
}
async function notifyVideoClick(video: GiftVideo, at: Date) {
  const [p] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, video.prospectId), eq(prospectsTable.clientId, video.clientId)));
  const [campaign] = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, video.campaignId), eq(campaignsTable.clientId, video.clientId)));
  if (!p) return;
  // Current data model assigns prospects to their tenant owner (there is no
  // separate assignee field). sourceKey is a database-enforced once-only guard.
  await db.insert(notificationsTable).values({
    clientId: video.clientId, sourceKey: `gift-video-click:${video.id}`, type: "gift_video_clicked", prospectId: p.id,
    title: `${p.contactName} clicked the personalized video in Step 3`,
    body: `${p.contactName} at ${p.companyName}: the personalized video link in Step 3 of ${campaign?.name ?? "Gift Outreach"} was clicked at ${at.toISOString()}. Engagement score: ${p.engagementScore}. Recommended next action: call or email to ask whether the gift arrived; schedule a follow-up. Anonymous link activity is not verified identity. Video: ${video.title}.`,
  }).onConflictDoNothing();
}

export const progressSchema = z.object({
  sessionId: z.string().regex(/^[a-f0-9]{48}$/),
  position: z.number().finite().nonnegative(),
  playing: z.boolean(), seeking: z.boolean(),
  ranges: z.array(z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()])).max(100),
}).strict();
export async function recordVideoProgress(video: GiftVideo, context: VisitContext, input: z.infer<typeof progressSchema>) {
  const key = visitorKey(video, context);
  const milestones = await db.transaction(async tx => {
    const [session] = await tx.select().from(giftVideoSessionsTable).where(and(
      eq(giftVideoSessionsTable.id, input.sessionId), eq(giftVideoSessionsTable.videoId, video.id),
      eq(giftVideoSessionsTable.visitorKey, key),
    )).for("update");
    if (!session || session.expiresAt.getTime() <= Date.now()) throw new GiftVideoError("Playback session expired. Reload the video.", 410);
    if (session.isBot || !video.emailId) return { percentage: 0, scored: [] as string[] };
    const now = new Date();
    const elapsedSeconds = session.lastHeartbeatAt ? (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000 : 0;
    if (session.lastHeartbeatAt && elapsedSeconds < 0.5) return {
      percentage: null, scored: [] as string[], retryAfterMs: Math.ceil(500 - elapsedSeconds * 1000),
    };
    const accepted = acceptPlayback({
      previous: session.ranges, lastPosition: session.lastPosition, position: input.position,
      elapsedSeconds, duration: video.durationSeconds, playing: input.playing, seeking: input.seeking, ranges: input.ranges,
    });
    await tx.update(giftVideoSessionsTable).set({
      lastPosition: Math.min(input.position, video.durationSeconds), lastHeartbeatAt: now, ranges: accepted.ranges,
      startedAt: session.startedAt ?? (accepted.acceptedSeconds >= 0.5 ? now : null),
    }).where(eq(giftVideoSessionsTable.id, session.id));
    const prior = await tx.select({ type: giftVideoEventsTable.type }).from(giftVideoEventsTable).where(and(
      eq(giftVideoEventsTable.sessionId, session.id), eq(giftVideoEventsTable.isValid, true),
    ));
    const types: string[] = [];
    if (accepted.acceptedSeconds >= 0.5 || session.startedAt) types.push("video_started");
    for (const percent of [25,50,75,100]) if (accepted.percentage >= percent) types.push(`video_${percent}`);
    const newTypes = types.filter(type => !prior.some(e => e.type === type));
    for (const type of newTypes) await tx.insert(giftVideoEventsTable).values({
      ...eventValues(video, type, key), sessionId: session.id, isValid: true,
      percentage: type === "video_started" ? 0 : Number(type.slice(6)),
    });
    for (const type of newTypes) await tx.insert(activityTable).values({
      clientId: video.clientId, type: `gift_${type}`, prospectId: video.prospectId, prospectName: video.prospectName,
      description: `${type === "video_started" ? "Video playback started" : `${type.slice(6)}% of video played`} — ${video.title}; campaign ${video.campaignId}, Step 3 – Gift Follow-Up. Estimated anonymous playback.`,
    });
    return { percentage: accepted.percentage, scored: newTypes };
  });
  // Scoring has its own prospect-level advisory lock and source/ledger dedupe.
  // Retry all attained awards so a transient scoring error can recover on the
  // next heartbeat, without replaying points.
  const awards: [number, EngagementEventType][] = [[50, "gift_video_half"], [100, "gift_video_complete"]];
  for (const [pct, type] of awards) if ((milestones.percentage ?? 0) >= pct)
    await recordEngagementEvent(video.prospectId, type, { emailId: video.emailId!, campaignId: video.campaignId, videoId: video.id });
  return { watchPercentage: milestones.percentage,
    ...("retryAfterMs" in milestones ? { retryAfterMs: milestones.retryAfterMs } : {}) };
}

export async function giftVideoDashboard(clientId: string, filters: { campaignId?: number; prospectId?: number }) {
  const videos = await db.select().from(giftVideosTable).where(and(eq(giftVideosTable.clientId, clientId),
    isNull(giftVideosTable.deletedAt), filters.campaignId ? eq(giftVideosTable.campaignId, filters.campaignId) : undefined,
    filters.prospectId ? eq(giftVideosTable.prospectId, filters.prospectId) : undefined)).orderBy(desc(giftVideosTable.createdAt));
  const cards = await Promise.all(videos.map(async video => {
    const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, video.prospectId), eq(prospectsTable.clientId, clientId)));
    const [campaign] = await db.select().from(campaignsTable).where(and(eq(campaignsTable.id, video.campaignId), eq(campaignsTable.clientId, clientId)));
    const [record] = await db.select().from(giftOutreachRecordsTable).where(and(eq(giftOutreachRecordsTable.id, video.recordId), eq(giftOutreachRecordsTable.clientId, clientId)));
    if (!prospect || !campaign) return null;
    const email = await sentEmail(video);
    const [reply] = email ? await db.select({ repliedAt: emailsTable.repliedAt }).from(emailsTable).where(and(
      eq(emailsTable.clientId, clientId), eq(emailsTable.prospectId, video.prospectId),
      eq(emailsTable.campaignId, video.campaignId), gte(emailsTable.repliedAt, email.sentAt),
    )).orderBy(emailsTable.repliedAt).limit(1) : [];
    const events = await db.select().from(giftVideoEventsTable).where(and(eq(giftVideoEventsTable.videoId, video.id),
      eq(giftVideoEventsTable.clientId, clientId), eq(giftVideoEventsTable.isValid, true))).orderBy(giftVideoEventsTable.createdAt);
    const clicks = events.filter(e => e.type === "video_clicked");
    const unique = new Set(clicks.map(e => e.visitorKey)).size;
    const sessions = await db.select({ ranges: giftVideoSessionsTable.ranges }).from(giftVideoSessionsTable)
      .where(and(eq(giftVideoSessionsTable.videoId, video.id), eq(giftVideoSessionsTable.isBot, false)));
    const percentage = Math.max(0, ...events.map(e => e.percentage ?? 0),
      ...sessions.map(s => Math.min(99, Math.floor(s.ranges.reduce((total, [a, b]) => total + b - a, 0) / video.durationSeconds * 100))));
    const started = events.some(e => e.type === "video_started");
    const schedule = events.some(e => e.type === "scheduling_clicked");
    const bookings = email ? await verifiedBookings(clientId, video.prospectId, email.sentAt) : [];
    const opens = email ? await db.select().from(emailOpenEventsTable).where(and(
      eq(emailOpenEventsTable.emailId, email.id), eq(emailOpenEventsTable.clientId, clientId),
      eq(emailOpenEventsTable.isValid, true), eq(emailOpenEventsTable.isBot, false),
      eq(emailOpenEventsTable.inferredFromClick, false),
    )).orderBy(emailOpenEventsTable.openedAt) : [];
    const openedAt = opens[0]?.openedAt ?? null;
    const booked = bookings.length > 0;
    const view = `/prospects/${prospect.id}`;
    return {
      video: serializeGiftVideo(video), prospectId: prospect.id, prospectName: prospect.contactName, company: prospect.companyName,
      campaignId: campaign.id, campaignName: campaign.name, step: "Step 3 – Gift Follow-Up",
      status: videoStatus({ booked, schedule, percentage, started, clicked: !!clicks.length,
        opened: !!openedAt, delivered: !!email?.deliveredAt, sentAt: email?.sentAt ?? null, scheduled: !!record?.dueAt }),
      sentAt: email?.sentAt ?? null, delivered: !!email?.deliveredAt, deliveredAt: email?.deliveredAt ?? null,
      emailOpened: !!openedAt, emailOpenedAt: openedAt, videoClicked: !!clicks.length,
      firstClickedAt: clicks[0]?.createdAt ?? null, lastClickedAt: clicks.at(-1)?.createdAt ?? null,
      totalClicks: clicks.length, uniqueClicks: unique, repeatClicks: Math.max(0, clicks.length - unique),
      videoStarted: started, watchPercentage: percentage, analyticsAvailable: true,
      analyticsLabel: "Native MP4 · estimated anonymous playback", schedulingLinkClicked: schedule,
      discoveryCallBooked: booked, replied: !!reply?.repliedAt, repliedAt: reply?.repliedAt ?? null,
      engagementScore: prospect.engagementScore, leadStrength: booked ? "Hot" : giftVideoLeadStrength(prospect),
      nextAction: booked ? "Prepare for the booked discovery call" : clicks.length ? "Call or email to ask whether the gift arrived; schedule a follow-up"
        : !email && !record?.dueAt ? "Video uploaded, but follow-up is not scheduled. Confirm the gift and prepare or approve the follow-up."
          : "Wait for engagement; respect the approved follow-up schedule",
      actions: { call: prospect.phone ? `tel:${prospect.phone.replace(/[^\d+]/g, "")}` : null,
        email: `mailto:${encodeURIComponent(prospect.email)}`, viewProspect: view, scheduleFollowUp: `${view}?action=schedule` },
    };
  }));
  return { cards: cards.filter(Boolean), trackingNotice: TRACKING_NOTICE };
}
async function verifiedBookings(clientId: string, prospectId: number, since: Date) {
  // The appointment store is written by authenticated scheduling or verified
  // provider bookings. No questionnaire/click or prospect status inference.
  return db.select().from(appointmentsTable).where(and(eq(appointmentsTable.clientId, clientId),
    eq(appointmentsTable.prospectId, prospectId), gte(appointmentsTable.createdAt, since),
    inArray(appointmentsTable.status, ["scheduled", "confirmed", "completed"])));
}
export async function giftVideoTimeline(clientId: string, id: number) {
  const video = await getOwnedGiftVideo(clientId, id);
  const recorded = await db.select().from(giftVideoEventsTable).where(and(eq(giftVideoEventsTable.videoId, id),
    eq(giftVideoEventsTable.clientId, clientId))).orderBy(desc(giftVideoEventsTable.createdAt)).limit(1000);
  const events = recorded.map(e => ({ id: `video-${e.id}`, type: e.type, occurredAt: e.createdAt,
    isBot: e.isBot, isValid: e.isValid, percentage: e.percentage, detail: e.botReason ?? "Anonymous video-link activity" }));
  const email = await sentEmail(video);
  if (email) {
    for (const [type, at] of [["email_sent", email.sentAt], ["email_delivered", email.deliveredAt]] as const) {
      if (at) events.push({ id: `${type}-${email.id}`, type, occurredAt: at, isBot: false, isValid: true, percentage: null, detail: "Existing email record" });
    }
    const replies = await db.select({ id: emailsTable.id, repliedAt: emailsTable.repliedAt }).from(emailsTable).where(and(
      eq(emailsTable.clientId, clientId), eq(emailsTable.prospectId, video.prospectId),
      eq(emailsTable.campaignId, video.campaignId), gte(emailsTable.repliedAt, email.sentAt),
    ));
    for (const reply of replies) if (reply.repliedAt) events.push({
      id: `reply-${reply.id}`, type: "reply_received", occurredAt: reply.repliedAt, isBot: false,
      isValid: true, percentage: null, detail: "Existing reply on an email in this prospect's campaign",
    });
    const opens = await db.select().from(emailOpenEventsTable).where(and(eq(emailOpenEventsTable.emailId, email.id),
      eq(emailOpenEventsTable.clientId, clientId))).limit(500);
    for (const o of opens) events.push({ id: `open-${o.id}`, type: o.inferredFromClick ? "email_open_inferred" : "email_opened",
      occurredAt: o.openedAt, isBot: o.isBot, isValid: o.isValid, percentage: null,
      detail: o.inferredFromClick ? "Inferred from a generic email link; not a measured email open" : o.botReason ?? "Estimated email open" });
    for (const booking of await verifiedBookings(clientId, video.prospectId, email.sentAt))
      events.push({ id: `booking-${booking.id}`, type: "discovery_call_booked", occurredAt: booking.createdAt,
        isBot: false, isValid: true, percentage: null, detail: `Confirmed appointment: ${booking.scheduledAt.toISOString()}` });
  }
  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return { events, trackingNotice: TRACKING_NOTICE };
}
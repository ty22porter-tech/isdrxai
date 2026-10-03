import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { db, conversionEventsTable as events } from "@workspace/db";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";

const COOKIE = "isdrx_activity";
const DAYS = 30;
export const ActivityInput = z.object({
  eventId: z.string().uuid(),
  event: z.enum(["page_view", "book_demo_clicked", "free_trial_clicked", "pricing_clicked", "settings_saved", "calendly_authorization_started"]),
  page: z.enum(["home", "features", "pricing", "book_demo", "contact", "settings", "dashboard", "prospecting", "campaigns", "other"]),
}).strict();

export function activityCookieHash(req: Request): string | null {
  const token = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
const cookieOptions = (req: Request) => ({
  httpOnly: true, secure: req.secure || process.env.NODE_ENV === "production",
  sameSite: "lax" as const, path: "/", maxAge: DAYS * 86400000,
});
const sessionPredicate = (hash: string) => and(
  eq(events.sourceKey, `visitor-session:${hash}`),
  eq(events.eventType, "visitor_session"),
  gte(events.createdAt, new Date(Date.now() - DAYS * 86400000)),
);

async function newSession(req: Request, res: Response, userId: string | null) {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const [session] = await db.insert(events).values({
    eventType: "visitor_session", intent: "activity_consent", location: "website",
    visitorId: hash, userId, sourceKey: `visitor-session:${hash}`, metadata: { consentVersion: 1 },
  }).returning();
  res.cookie(COOKIE, token, cookieOptions(req));
  return session;
}

export async function grantActivityConsent(req: Request, res: Response, userId: string | null) {
  const hash = activityCookieHash(req);
  if (hash) {
    const [session] = await db.select().from(events).where(sessionPredicate(hash));
    if (session && (!session.userId || session.userId === userId)) return;
  }
  await newSession(req, res, userId);
}

export async function revokeActivityConsent(req: Request, res: Response) {
  const hash = activityCookieHash(req);
  if (hash) {
    await db.transaction(async tx => {
      // Serialize against in-flight activity writes so opt-out cannot leave
      // an event inserted after its session has been deleted.
      await tx.select().from(events).where(eq(events.sourceKey, `visitor-session:${hash}`)).for("update");
      await tx.delete(events).where(and(eq(events.visitorId, hash), inArray(events.eventType, ["visitor_session", "visitor_activity"])));
    });
  }
  res.clearCookie(COOKIE, { ...cookieOptions(req), maxAge: undefined });
}

export async function recordVisitorActivity(req: Request, res: Response, userId: string | null, data: z.infer<typeof ActivityInput>) {
  let hash = activityCookieHash(req);
  if (!hash) return;
  // An authenticated session becoming anonymous or changing accounts starts
  // a new session rather than attributing a shared browser to the old user.
  const [before] = await db.select().from(events).where(sessionPredicate(hash));
  if (!before) return;
  if (before.userId && before.userId !== userId) {
    const fresh = await newSession(req, res, userId);
    hash = fresh.visitorId!;
  }
  const sessionHash = hash;
  await db.transaction(async tx => {
    const [session] = await tx.select().from(events).where(sessionPredicate(sessionHash)).for("update");
    if (!session || (session.userId && session.userId !== userId)) return;
    if (userId && !session.userId) {
      await tx.update(events).set({ userId, metadata: { consentVersion: 1 } }).where(eq(events.id, session.id));
    }
    await tx.insert(events).values({
      eventType: "visitor_activity", intent: data.event, location: data.page,
      visitorId: sessionHash, userId, sourceKey: `visitor-event:${sessionHash}:${data.eventId}`,
    }).onConflictDoNothing({ target: events.sourceKey });
  });
}

// Called ONLY after a successful, validated public form submission.
// No generic identify endpoint accepts email/user IDs from analytics requests.
export async function identifyActivityLead(req: Request, lead: { name: string; email: string; company: string }, page: "book_demo" | "contact") {
  if (req.get("Sec-GPC") === "1") return;
  const hash = activityCookieHash(req);
  if (!hash) return;
  await db.transaction(async tx => {
    const [session] = await tx.select().from(events).where(sessionPredicate(hash)).for("update");
    if (!session || session.userId) return;
    // Do not overwrite a different person's previous attribution on a shared browser.
    if (session.metadata.email && session.metadata.email !== lead.email.toLowerCase()) return;
    await tx.update(events).set({ metadata: {
      consentVersion: 1, name: lead.name, email: lead.email.toLowerCase(), company: lead.company,
      identitySource: "form_submission",
    } }).where(eq(events.id, session.id));
    await tx.insert(events).values({
      eventType: "visitor_activity", intent: "lead_form_submitted", location: page,
      visitorId: hash, sourceKey: `visitor-event:${hash}:${randomUUID()}`,
    });
  });
}
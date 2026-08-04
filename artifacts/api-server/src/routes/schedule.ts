import { Router, RequestHandler } from "express";
import express from "express";
import { db } from "@workspace/db";
import { prospectsTable, usersTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail, type EmailAttachment } from "../lib/emailSender";
import { getVerticalConfig } from "../lib/verticals";
import { recordEngagementEvent } from "../lib/engagementScoring";
import type { Request, Response, NextFunction } from "express";

const router = Router();

interface LocationEntry {
  label?: string;
  squareFootage?: string | number;
}

interface UploadedFile {
  filename: string;
  contentBase64: string;
}

interface QuestionnaireBody {
  contactName?: string;
  email?: string;
  phone?: string;
  currentProvider?: string;
  daysPerWeek?: string | number;
  serviceTimes?: string[];
  interests?: string[];
  locationCount?: string | number;
  locations?: LocationEntry[];
  additionalNotes?: string;
  files?: UploadedFile[];
}

const MAX_FILES = 5;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB

// Lightweight in-memory abuse guard for the public POST endpoint: cap submissions
// per token to prevent a leaked link from being used to spam the sales rep.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const submissionTimes = new Map<string, number[]>();

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const recent = (submissionTimes.get(token) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    submissionTimes.set(token, recent);
    return true;
  }
  recent.push(now);
  submissionTimes.set(token, recent);
  return false;
}

// Middleware that validates the schedule token and attaches the prospect to the
// request BEFORE the large body parser runs. This prevents oversized payloads
// from being buffered and decoded for requests with invalid tokens, closing a
// denial-of-service vector on this unauthenticated endpoint.
// The rate limiter also runs here (before body parsing) for the same reason.
const validateTokenBeforeBody: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const token = String(req.params.token ?? "");
  if (!token) {
    res.status(400).json({ error: "Missing token" });
    return;
  }

  if (isRateLimited(token)) {
    res.status(429).json({ error: "Too many submissions. Please try again later." });
    return;
  }

  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(eq(prospectsTable.scheduleToken, token));

  if (!prospect) {
    res.status(404).json({ error: "Invalid or expired link" });
    return;
  }

  (req as any).__scheduleProspect = prospect;
  next();
};

// Body parser with the large limit, applied only AFTER token validation passes.
const parseScheduleBody = express.json({ limit: "45mb" });

// Public: fetch the info needed to render the scheduling page for a prospect token.
router.get("/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.scheduleToken, token));

    if (!prospect) return res.status(404).json({ error: "Invalid or expired link" });

    const [client] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, prospect.clientId));

    // Interest scoring: questionnaire opened (scored once per prospect).
    recordEngagementEvent(prospect.id, "questionnaire_opened").catch(() => {});

    res.json({
      companyName: prospect.companyName,
      contactName: prospect.contactName,
      email: prospect.email,
      phone: prospect.phone,
      businessName: client?.businessName ?? "our team",
      calendlyUrl: client?.calendlyUrl ?? null,
      vertical: getVerticalConfig(client?.vertical).key,
    });
  } catch (err: any) {
    console.error("schedule GET error:", err?.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Public: submit the qualifying questionnaire. Emails the sales rep with responses + floor plans.
// Token validation and rate-limiting run BEFORE the large body is parsed so that
// invalid tokens are rejected cheaply without buffering up to 45MB of payload.
router.post("/:token", validateTokenBeforeBody, parseScheduleBody, async (req, res) => {
  try {
    const prospect = (req as any).__scheduleProspect;

    const [client] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, prospect.clientId));

    if (!client) return res.status(404).json({ error: "Invalid or expired link" });

    const salesEmail = client.outreachEmail || client.email;
    if (!salesEmail) return res.status(500).json({ error: "Sales contact is not configured" });

    const body = (req.body ?? {}) as QuestionnaireBody;

    const contactName = (body.contactName ?? prospect.contactName ?? "").trim();
    const email = (body.email ?? prospect.email ?? "").trim();
    const phone = (body.phone ?? prospect.phone ?? "").trim();
    const currentProvider = (body.currentProvider ?? "").trim();
    const daysPerWeek = body.daysPerWeek ?? "";
    const serviceTimes = Array.isArray(body.serviceTimes) ? body.serviceTimes : [];
    const interests = Array.isArray(body.interests) ? body.interests : [];
    const locationCount = body.locationCount ?? "";
    const locations = Array.isArray(body.locations) ? body.locations : [];
    const additionalNotes = (body.additionalNotes ?? "").trim();

    // Build attachments from uploaded floor plans (optional).
    const attachments: EmailAttachment[] = [];
    let totalBytes = 0;
    if (Array.isArray(body.files)) {
      for (const f of body.files.slice(0, MAX_FILES)) {
        if (!f?.contentBase64 || !f?.filename) continue;
        const base64 = f.contentBase64.includes(",")
          ? f.contentBase64.slice(f.contentBase64.indexOf(",") + 1)
          : f.contentBase64;
        const buf = Buffer.from(base64, "base64");
        totalBytes += buf.length;
        if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          return res.status(413).json({ error: "Uploaded files are too large (25MB max total)." });
        }
        attachments.push({ filename: f.filename.slice(0, 120), content: buf });
      }
    }

    const vc = getVerticalConfig(client.vertical);
    const isIT = vc.key === "it_services";

    const numLocations = parseInt(String(locationCount), 10) || locations.length || 1;

    const locationLines = locations
      .map((loc, i) => {
        const label = (loc.label ?? `Location ${i + 1}`).toString().trim() || `Location ${i + 1}`;
        const sqft = (loc.squareFootage ?? "").toString().trim() || "Not provided";
        return `   ${i + 1}. ${label} — ${sqft} ${vc.schedule.sizeUnit}`;
      })
      .join("\n");

    const overflowNote =
      numLocations > 3
        ? `\n   Note: Prospect has ${numLocations} locations total. First 3 listed above — a representative should call to discuss the remaining ${numLocations - 3}.`
        : "";

    const serviceTimesText = serviceTimes.length ? serviceTimes.join(", ") : "Not specified";
    const interestsText = interests.length ? interests.join(", ") : "Not specified";

    const interestsBlock = isIT
      ? `\nSERVICES OF INTEREST\n   ${interestsText}\n`
      : "";

    const summary = `${vc.schedule.summaryTitle(prospect.companyName)}

${vc.schedule.summaryIntro}

CONTACT
   Name:    ${contactName || "—"}
   Company: ${prospect.companyName}
   Email:   ${email || "—"}
   Phone:   ${phone || "—"}

${isIT ? "IT ENVIRONMENT DETAILS" : "FACILITY DETAILS"}
   ${isIT ? "Current IT provider:             " : "Current cleaning provider:        "}${currentProvider || "None / not provided"}
   ${isIT ? "Employees using computers:       " : "Days per week currently cleaned:  "}${daysPerWeek || "Not provided"}
   ${isIT ? "Preferred contact times:         " : "Service times:                    "}${serviceTimesText}
   Number of locations:              ${numLocations}
${interestsBlock}${isIT ? "" : `\n${vc.schedule.summarySizeHeading}\n${locationLines || "   Not provided"}${overflowNote}\n`}
${additionalNotes ? `ADDITIONAL NOTES\n   ${additionalNotes}\n` : ""}${attachments.length ? `\n${isIT ? "Document(s)" : "Floor plan(s)"} attached: ${attachments.length} file(s).` : `\nNo ${isIT ? "documents" : "floor plans"} uploaded.`}
`;

    await sendEmail({
      fromName: client.businessName ?? "iSDRX AI",
      replyTo: email || salesEmail,
      to: salesEmail,
      subject: vc.schedule.notificationSubject(prospect.companyName),
      body: summary,
      attachments,
    });

    // Record activity + update prospect so the rep sees it in-app too.
    const totalSqft = locations.reduce((sum, loc) => {
      const n = parseInt(String(loc.squareFootage ?? "").replace(/[^0-9]/g, ""), 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    const notesAddition = `[${isIT ? "IT assessment" : "Walkthrough"} request ${new Date().toLocaleDateString()}]\n${summary}`;
    await db
      .update(prospectsTable)
      .set({
        status: "walkthrough_requested",
        squareFootage: totalSqft > 0 ? totalSqft : prospect.squareFootage,
        notes: prospect.notes ? `${prospect.notes}\n\n${notesAddition}` : notesAddition,
      })
      .where(eq(prospectsTable.id, prospect.id));

    await db.insert(activityTable).values({
      clientId: prospect.clientId,
      type: "appointment_set",
      description: `${isIT ? "IT assessment" : "Walkthrough"} questionnaire submitted by ${prospect.companyName}`,
      prospectId: prospect.id,
      prospectName: prospect.contactName,
    });

    // Interest scoring: questionnaire submitted (once per prospect). A meeting
    // is now in motion, so any pending repeated-open follow-up is redundant —
    // the automation processor suppresses it via the prospect's status.
    recordEngagementEvent(prospect.id, "questionnaire_submitted").catch(() => {});

    res.json({ ok: true, calendlyUrl: client.calendlyUrl ?? null });
  } catch (err: any) {
    console.error("schedule POST error:", err?.message);
    res.status(500).json({ error: "Failed to submit. Please try again." });
  }
});

export default router;

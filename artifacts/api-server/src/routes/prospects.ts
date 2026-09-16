import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { prospectsTable, activityTable, usersTable, emailsTable } from "@workspace/db";
import { eq, ilike, and, sql, inArray, exists, gte, lt } from "drizzle-orm";
import {
  ListProspectsQueryParams,
  CreateProspectBody,
  BulkCreateProspectsBody,
  BulkDeleteProspectsBody,
  BulkEnrichProspectsBody,
  UpdateProspectParams,
  UpdateProspectBody,
  DeleteProspectParams,
  GetProspectParams,
} from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { enrichPerson } from "../lib/apollo";
import { runProspectEnrichment } from "../lib/prospectEnrichment";
import { db as _db, scoreEventsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { buildOpportunityIntelligence, deriveOpportunityForPersistence, upgradeStoredOpportunityIntelligence } from "../lib/opportunityIntelligence";
import { attachResearchProof, verifiedResearchProof } from "../lib/itOpportunityResearch";

const router = Router();
router.use(requireAuth, requireEntitlement);

// Prospects are stamped with the vertical the client was in when they were
// created, so vertical-specific data never bleeds between workflows.
function clientVertical(client?: typeof usersTable.$inferSelect): string {
  if (client?.vertical === "it_services" || client?.vertical === "fleet_wraps") return client.vertical;
  return "janitorial";
}

async function currentClient(clientId: string) {
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, clientId));
  return client;
}

async function trustedProspectValues(
  input: Record<string, any>,
  vertical: string,
  client?: typeof usersTable.$inferSelect,
  priorServerIntelligence?: any,
  priorIdentity?: any,
): Promise<any> {
  const { opportunityIntelligence: requestedIntelligence, ...values } = input;
  // Only unsaved search results need the durable handoff. Saved records use
  // their existing server snapshot and may be freshly researched on identity
  // changes; a client cannot turn an old proof into an edit authorization.
  if (vertical === "it_services" && requestedIntelligence?.itResearch && !priorServerIntelligence) {
    const verified = client?.id
      ? verifiedResearchProof(requestedIntelligence.researchProof, client.id, values as any, client)
      : undefined;
    if (!verified) {
      throw new Error("The IT research handoff has expired or is invalid. Refresh research before saving this prospect.");
    }
    const intelligence = attachResearchProof(
      buildOpportunityIntelligence(values as any, vertical, client, [], verified),
      client!.id,
      values as any,
      client,
    );
    return { ...values, opportunityIntelligence: intelligence };
  }
  const opportunityIntelligence = await deriveOpportunityForPersistence({
    ...values,
    opportunityIntelligence: requestedIntelligence,
  } as any, vertical, client, priorServerIntelligence, client?.id, priorIdentity);
  return { ...values, opportunityIntelligence };
}

function parseUtcCalendarDate(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

router.get("/", async (req, res) => {
  const parsedQuery = ListProspectsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Prospect filters are invalid." });
    return;
  }
  const query = parsedQuery.data;
  const conditions: any[] = [eq(prospectsTable.clientId, req.clientId)];
  if (query.status) conditions.push(eq(prospectsTable.status, query.status));
  if (query.search) conditions.push(ilike(prospectsTable.companyName, `%${query.search}%`));

  const sentFrom = query.sentFrom ? parseUtcCalendarDate(query.sentFrom) : null;
  const sentTo = query.sentTo ? parseUtcCalendarDate(query.sentTo) : null;
  if ((query.sentFrom && !sentFrom) || (query.sentTo && !sentTo)) {
    res.status(400).json({ error: "Sent dates must be valid calendar dates." });
    return;
  }
  if (sentFrom && sentTo && sentFrom > sentTo) {
    res.status(400).json({ error: "The sent-from date cannot be after the sent-to date." });
    return;
  }

  const hasSentEmailFilter = query.campaignId != null || sentFrom != null || sentTo != null;
  if (hasSentEmailFilter) {
    const matchingEmailConditions = [
      eq(emailsTable.prospectId, prospectsTable.id),
      eq(emailsTable.clientId, req.clientId),
    ];
    if (query.campaignId != null) {
      matchingEmailConditions.push(eq(emailsTable.campaignId, query.campaignId));
    }
    if (sentFrom) {
      matchingEmailConditions.push(gte(emailsTable.sentAt, sentFrom));
    }
    if (sentTo) {
      const dayAfterSentTo = new Date(sentTo);
      dayAfterSentTo.setUTCDate(dayAfterSentTo.getUTCDate() + 1);
      matchingEmailConditions.push(lt(emailsTable.sentAt, dayAfterSentTo));
    }
    conditions.push(exists(
      db.select({ id: emailsTable.id })
        .from(emailsTable)
        .where(and(...matchingEmailConditions)),
    ));
  }

  const prospects = await db.select().from(prospectsTable).where(and(...conditions)).orderBy(sql`${prospectsTable.createdAt} desc`);
  const client = prospects.some(prospect => prospect.opportunityIntelligence && prospect.opportunityIntelligence.version !== 3)
    ? await currentClient(req.clientId)
    : undefined;
  res.json(prospects.map(p => ({
    ...p,
    opportunityIntelligence: upgradeStoredOpportunityIntelligence(
      p,
      p.vertical || clientVertical(client),
      client,
      p.opportunityIntelligence,
    ),
    lastContactedAt: p.lastContactedAt?.toISOString() ?? null,
    enrichedAt: p.enrichedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/", async (req, res) => {
  const body = CreateProspectBody.parse(req.body);
  const scheduleToken = randomUUID();
  const client = await currentClient(req.clientId);
  const vertical = clientVertical(client);
  const values = await trustedProspectValues(body, vertical, client);
  const [prospect] = await db.insert(prospectsTable).values({ ...values, clientId: req.clientId, status: "new", scheduleToken, vertical }).returning();
  await db.insert(activityTable).values({
    clientId: req.clientId,
    type: "prospect_added",
    description: `New prospect added: ${prospect.companyName}`,
    prospectId: prospect.id,
    prospectName: prospect.contactName,
  });
  res.status(201).json({ ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, enrichedAt: prospect.enrichedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/bulk", async (req, res) => {
  const { prospects, duplicateStrategy } = BulkCreateProspectsBody.parse(req.body);
  const client = await currentClient(req.clientId);
  const vertical = clientVertical(client);
  const results: { index: number; success: boolean; updated?: boolean; error?: string; prospect?: any }[] = [];
  let added = 0;
  let updated = 0;
  let failed = 0;
  const existing = await db
    .select()
    .from(prospectsTable)
    .where(eq(prospectsTable.clientId, req.clientId));
  const existingByEmail = new Map(existing.map((p) => [p.email.trim().toLowerCase(), p]));
  const seenEmails = new Set(existingByEmail.keys());
  const validRows: { index: number; values: any }[] = [];
  const updateRows: { index: number; prospectId: number; input: any }[] = [];
  const trustedInputs: any[] = new Array(prospects.length);
  const researchQueue = prospects.map((_, index) => index);
  // Keep external IT research bounded for bulk persistence. A proof normally
  // avoids research entirely; without one, preserve the route's existing
  // all-or-nothing failure behavior rather than silently saving partial data.
  await Promise.all(Array.from({ length: Math.min(3, prospects.length) }, async () => {
    while (researchQueue.length) {
      const index = researchQueue.shift();
      if (index === undefined) return;
      const prospectInput = prospects[index];
      const rawEmail = (prospectInput.email ?? "").trim().toLowerCase();
      trustedInputs[index] = (!prospectInput.companyName?.trim() || !EMAIL_RE.test(rawEmail)
        || (existingByEmail.has(rawEmail) && duplicateStrategy !== "update"))
        ? prospectInput
        : await trustedProspectValues(
          prospectInput,
          vertical,
          client,
          existingByEmail.get(rawEmail)?.opportunityIntelligence,
          existingByEmail.get(rawEmail),
        );
    }
  }));
  for (let i = 0; i < prospects.length; i++) {
    const input = trustedInputs[i];
    const email = (input.email ?? "").trim().toLowerCase();
    if (!input.companyName?.trim()) {
      failed++;
      results.push({ index: i, success: false, error: "Missing company name" });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      failed++;
      results.push({ index: i, success: false, error: `Invalid email address: "${input.email || "(empty)"}"` });
      continue;
    }
    if (seenEmails.has(email)) {
      const existingProspect = existingByEmail.get(email);
      if (duplicateStrategy === "update" && existingProspect !== undefined) {
        updateRows.push({ index: i, prospectId: existingProspect.id, input });
      } else {
        failed++;
        results.push({ index: i, success: false, error: `Duplicate: a prospect with email ${input.email} already exists` });
      }
      continue;
    }
    seenEmails.add(email);
    validRows.push({
      index: i,
      values: {
        ...input,
        phone: input.phone?.trim() || "(000) 000-0000",
        industry: input.industry?.trim() || "General",
        clientId: req.clientId,
        status: "new",
        scheduleToken: randomUUID(),
        vertical,
      },
    });
  }

  for (const row of updateRows) {
    try {
      const updateValues: Record<string, any> = {};
      for (const key of ["companyName", "contactName", "phone", "industry", "city", "state", "website", "address", "notes", "employeeCount", "squareFootage", "title", "linkedinUrl", "opportunityIntelligence"] as const) {
        const v = (row.input as any)[key];
        if (v !== undefined && v !== null && (typeof v !== "string" || v.trim() !== "")) {
          updateValues[key] = v;
        }
      }
      const [prospect] = await db
        .update(prospectsTable)
        .set(updateValues)
        .where(and(eq(prospectsTable.id, row.prospectId), eq(prospectsTable.clientId, req.clientId)))
        .returning();
      if (!prospect) {
        failed++;
        results.push({ index: row.index, success: false, error: "Failed to update existing prospect" });
        continue;
      }
      updated++;
      results.push({
        index: row.index,
        success: true,
        updated: true,
        prospect: { ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, enrichedAt: prospect.enrichedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() },
      });
    } catch (err: any) {
      failed++;
      results.push({ index: row.index, success: false, error: err?.message ?? "Failed to update existing prospect" });
    }
  }

  const BATCH_SIZE = 500;
  for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
    const batch = validRows.slice(start, start + BATCH_SIZE);
    try {
      const inserted = await db.transaction(async (tx) => {
        const rows = await tx.insert(prospectsTable).values(batch.map((r) => r.values)).returning();
        if (rows.length > 0) {
          await tx.insert(activityTable).values(rows.map((p) => ({
            clientId: req.clientId,
            type: "prospect_added",
            description: `New prospect added: ${p.companyName}`,
            prospectId: p.id,
            prospectName: p.contactName,
          })));
        }
        return rows;
      });
      const byToken = new Map(inserted.map((p) => [p.scheduleToken, p]));
      for (const row of batch) {
        const prospect = byToken.get(row.values.scheduleToken);
        if (!prospect) {
          failed++;
          results.push({ index: row.index, success: false, error: "Failed to create prospect" });
          continue;
        }
        added++;
        results.push({
          index: row.index,
          success: true,
          prospect: { ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, enrichedAt: prospect.enrichedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() },
        });
      }
    } catch (err: any) {
      for (const row of batch) {
        failed++;
        results.push({ index: row.index, success: false, error: err?.message ?? "Failed to create prospect" });
      }
    }
  }

  results.sort((a, b) => a.index - b.index);
  return res.json({ added, updated, failed, results });
});

router.get("/:id", async (req, res) => {
  const { id } = GetProspectParams.parse({ id: parseInt(req.params.id) });
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const client = prospect.opportunityIntelligence && prospect.opportunityIntelligence.version !== 3
    ? await currentClient(req.clientId)
    : undefined;
  const opportunityIntelligence = upgradeStoredOpportunityIntelligence(
    prospect,
    prospect.vertical || clientVertical(client),
    client,
    prospect.opportunityIntelligence,
  );
  return res.json({ ...prospect, opportunityIntelligence, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, enrichedAt: prospect.enrichedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateProspectParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateProspectBody.parse(req.body);
  const [existing] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)));
  if (!existing) return res.status(404).json({ error: "Prospect not found" });
  const client = await currentClient(req.clientId);
  const vertical = existing.vertical || clientVertical(client);
  const updateValues: Record<string, any> = { ...body };
  const intelligenceInputs = new Set(["companyName", "industry", "city", "state", "website", "address", "phone", "title"]);
  const shouldRecomputeIntelligence = Boolean(existing.opportunityIntelligence)
    && Object.keys(body).some(key => intelligenceInputs.has(key));
  if (shouldRecomputeIntelligence) {
    const merged = { ...existing, ...body, opportunityIntelligence: existing.opportunityIntelligence };
    const trusted = await trustedProspectValues(merged, vertical, client, existing.opportunityIntelligence, existing);
    updateValues.opportunityIntelligence = trusted.opportunityIntelligence;
  } else {
    delete updateValues.opportunityIntelligence;
  }
  const [prospect] = await db.update(prospectsTable).set(updateValues).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId))).returning();
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  if (body.status) {
    await db.insert(activityTable).values({
      clientId: req.clientId,
      type: "status_changed",
      description: `${prospect.companyName} status updated to ${body.status}`,
      prospectId: prospect.id,
      prospectName: prospect.contactName,
    });
  }
  return res.json({ ...prospect, lastContactedAt: prospect.lastContactedAt?.toISOString() ?? null, enrichedAt: prospect.enrichedAt?.toISOString() ?? null, createdAt: prospect.createdAt.toISOString() });
});

// Manual interest override (authorized: the owning client). level=null clears
// the override; every change is preserved in the score history.
router.post("/:id/interest-override", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid prospect id" });
  const { level } = req.body ?? {};
  if (level !== null && !["low", "medium", "hot"].includes(level)) {
    return res.status(400).json({ error: "level must be 'low', 'medium', 'hot', or null to clear" });
  }
  const [prospect] = await db.update(prospectsTable)
    .set({ manualInterestLevel: level, manualInterestSetAt: level ? new Date() : null })
    .where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)))
    .returning();
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  await db.insert(scoreEventsTable).values({
    clientId: req.clientId,
    prospectId: id,
    eventType: "manual_override",
    points: 0,
    reason: level ? `Interest manually set to ${level} (system score ${prospect.engagementScore} preserved)` : "Manual interest override cleared",
    scoreAfter: prospect.engagementScore,
    interestLevelAfter: level ?? prospect.interestLevel,
  });
  return res.json({
    id: prospect.id,
    engagementScore: prospect.engagementScore,
    interestLevel: prospect.interestLevel,
    manualInterestLevel: prospect.manualInterestLevel,
    manualInterestSetAt: prospect.manualInterestSetAt?.toISOString() ?? null,
  });
});

// Toggle the "Mark for LinkedIn Outreach" flag (surfaced in Hot alerts; no automation).
router.post("/:id/linkedin-flag", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid prospect id" });
  const flag = !!req.body?.flag;
  const [prospect] = await db.update(prospectsTable)
    .set({ linkedinOutreach: flag })
    .where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)))
    .returning();
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  return res.json({ id: prospect.id, linkedinOutreach: prospect.linkedinOutreach });
});

// Score history (with reasons) for a prospect.
router.get("/:id/score-history", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid prospect id" });
  const events = await _db.select().from(scoreEventsTable)
    .where(and(eq(scoreEventsTable.prospectId, id), eq(scoreEventsTable.clientId, req.clientId)))
    .orderBy(desc(scoreEventsTable.createdAt))
    .limit(200);
  return res.json(events.map(e => ({
    id: e.id,
    eventType: e.eventType,
    points: e.points,
    reason: e.reason,
    scoreAfter: e.scoreAfter,
    interestLevelAfter: e.interestLevelAfter,
    createdAt: e.createdAt.toISOString(),
  })));
});

// Bulk enrich selected prospects via Apollo people enrichment.
router.post("/bulk-enrich", requireEntitlement, async (req, res) => {
  const { ids } = BulkEnrichProspectsBody.parse(req.body);
  const rows = await db.select().from(prospectsTable)
    .where(and(eq(prospectsTable.clientId, req.clientId), inArray(prospectsTable.id, ids)));

  const result = await runProspectEnrichment({
    rows,
    enrich: (p) => enrichPerson({
      email: p.email,
      contactName: p.contactName,
      companyName: p.companyName,
      website: p.website,
      vertical: p.vertical,
    }),
    update: async (p, values) => {
      await db.update(prospectsTable).set(values)
        .where(and(eq(prospectsTable.id, p.id), eq(prospectsTable.clientId, req.clientId)));
    },
  });
  return res.json(result);
});

// Bulk delete selected prospects (only ones owned by this client).
router.post("/bulk-delete", async (req, res) => {
  const { ids } = BulkDeleteProspectsBody.parse(req.body);
  const deleted = await db.delete(prospectsTable)
    .where(and(eq(prospectsTable.clientId, req.clientId), inArray(prospectsTable.id, ids)))
    .returning({ id: prospectsTable.id });
  res.json({ deleted: deleted.length });
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteProspectParams.parse({ id: parseInt(req.params.id) });
  await db.delete(prospectsTable).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, req.clientId)));
  res.status(204).send();
});

export default router;

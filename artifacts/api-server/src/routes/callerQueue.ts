import { Router } from "express";
import { z } from "zod/v4";
import {
  db,
  activityTable,
  callsTable,
  callTasksTable,
  campaignsTable,
  prospectsTable,
} from "@workspace/db";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import {
  CALL_OUTCOMES,
  assertPilotCapacity,
  canCall,
  enqueueCallTask,
  getCallerUsage,
  suppressProspectTasks,
} from "../lib/callerQueue";
import { callbackIdempotencyKey } from "../lib/callerPolicy";

const router = Router();
router.use(requireAuth, requireEntitlement);

const idSchema = z.coerce.number().int().positive();
const queueQuerySchema = z.object({
  status: z.enum(["queued", "claimed", "completed", "snoozed", "suppressed"]).optional(),
  prospectId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
const enqueueProspectSchema = z.object({
  prospectId: z.number().int().positive(),
  campaignId: z.number().int().positive().optional(),
  priority: z.number().int().min(-1000).max(1000).default(0),
  dueAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
}).strict();
const enqueueCampaignSchema = z.object({
  campaignId: z.number().int().positive(),
  prospectIds: z.array(z.number().int().positive()).min(1).max(1000).optional(),
  priority: z.number().int().min(-1000).max(1000).default(0),
  dueAt: z.coerce.date().optional(),
}).strict();
const claimSchema = z.object({
  callerId: z.string().trim().min(1).max(255).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
}).strict();
const releaseSchema = z.object({
  snoozeUntil: z.coerce.date().optional(),
}).strict();
const completeSchema = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  notes: z.string().max(10000).optional(),
  duration: z.number().int().min(0).max(86400).optional(),
  callbackAt: z.coerce.date().optional(),
  callerId: z.string().trim().min(1).max(255).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  externalId: z.string().trim().min(1).max(255).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.outcome === "callback_requested" && !value.callbackAt) {
    ctx.addIssue({ code: "custom", path: ["callbackAt"], message: "callbackAt is required for callback_requested" });
  }
  if (value.callbackAt && value.callbackAt.getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["callbackAt"], message: "callbackAt must be in the future" });
  }
});

function taskJson(task: typeof callTasksTable.$inferSelect) {
  return {
    ...task,
    dueAt: task.dueAt.toISOString(),
    claimedAt: task.claimedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    suppressedAt: task.suppressedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

function sendKnownError(res: any, err: unknown) {
  const message = err instanceof Error ? err.message : "Call queue operation failed";
  const status = message === "Prospect not found" ? 404
    : message.includes("not enabled") || message.includes("limit") ? 403
      : 400;
  res.status(status).json({ error: message });
}

router.get("/queue", async (req, res): Promise<void> => {
  const parsed = queueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conditions = [eq(callTasksTable.clientId, req.clientId)];
  if (parsed.data.status) conditions.push(eq(callTasksTable.status, parsed.data.status));
  if (parsed.data.prospectId) conditions.push(eq(callTasksTable.prospectId, parsed.data.prospectId));
  const rows = await db.select({
    task: callTasksTable,
    prospect: {
      id: prospectsTable.id,
      companyName: prospectsTable.companyName,
      contactName: prospectsTable.contactName,
      phone: prospectsTable.phone,
      industry: prospectsTable.industry,
      status: prospectsTable.status,
    },
    campaign: {
      id: campaignsTable.id,
      name: campaignsTable.name,
    },
  }).from(callTasksTable)
    .innerJoin(prospectsTable, and(
      eq(prospectsTable.id, callTasksTable.prospectId),
      eq(prospectsTable.clientId, callTasksTable.clientId),
    ))
    .innerJoin(campaignsTable, and(
      eq(campaignsTable.id, callTasksTable.campaignId),
      eq(campaignsTable.clientId, callTasksTable.clientId),
    ))
    .where(and(...conditions))
    .orderBy(desc(callTasksTable.priority), asc(callTasksTable.dueAt), asc(callTasksTable.id))
    .limit(parsed.data.limit)
    .offset(parsed.data.offset);
  res.json({
    tasks: rows.map((row) => ({
      ...taskJson(row.task),
      prospect: row.prospect,
      campaign: row.campaign,
    })),
  });
});

router.post("/queue/prospect", async (req, res): Promise<void> => {
  const parsed = enqueueProspectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const body = parsed.data;
    const result = await enqueueCallTask({
      ...body,
      clientId: req.clientId,
      sourceTrigger: "manual",
      idempotencyKey: body.idempotencyKey ??
        `manual:${body.prospectId}:${body.campaignId ?? "auto"}:${body.dueAt?.toISOString() ?? Date.now()}`,
    });
    res.status(result.created ? 201 : 200).json({
      task: taskJson(result.task),
      created: result.created,
      suppression: result.suppression.allowed ? null : result.suppression.reason,
    });
  } catch (err) {
    req.log.warn({ err }, "Prospect call enqueue rejected");
    sendKnownError(res, err);
  }
});

router.post("/queue/campaign", async (req, res): Promise<void> => {
  const parsed = enqueueCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await assertPilotCapacity(req.clientId);
    const [campaign] = await db.select().from(campaignsTable).where(and(
      eq(campaignsTable.id, parsed.data.campaignId),
      eq(campaignsTable.clientId, req.clientId),
    ));
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.type !== "call") throw new Error("Campaign must be a call campaign");
    if (!campaign.callScript?.trim() || !campaign.callScriptApprovedAt || campaign.callScriptVersion < 1) {
      throw new Error("An approved, non-empty call campaign script is required");
    }
    const conditions = [eq(prospectsTable.clientId, req.clientId)];
    if (parsed.data.prospectIds) {
      conditions.push(inArray(prospectsTable.id, parsed.data.prospectIds));
    } else if (campaign.targetIndustry.trim() && campaign.targetIndustry.toLowerCase() !== "all") {
      conditions.push(ilike(prospectsTable.industry, campaign.targetIndustry));
    }
    const prospects = await db.select({ id: prospectsTable.id }).from(prospectsTable).where(and(...conditions));
    const results = [];
    for (const prospect of prospects) {
      results.push(await enqueueCallTask({
        clientId: req.clientId,
        prospectId: prospect.id,
        campaignId: campaign.id,
        sourceTrigger: "campaign",
        priority: parsed.data.priority,
        dueAt: parsed.data.dueAt,
        idempotencyKey: `campaign:${campaign.id}:prospect:${prospect.id}`,
      }));
    }
    res.status(201).json({
      created: results.filter((r) => r.created).length,
      existing: results.filter((r) => !r.created).length,
      suppressed: results.filter((r) => !r.suppression.allowed).length,
      tasks: results.map((r) => taskJson(r.task)),
    });
  } catch (err) {
    req.log.warn({ err }, "Campaign call enqueue rejected");
    sendKnownError(res, err);
  }
});

router.post("/queue/claim-next", async (req, res): Promise<void> => {
  const parsed = claimSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const claimed = await db.transaction(async (tx) => {
      await assertPilotCapacity(req.clientId, tx);
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await tx.execute(sql`
          select id from call_tasks
          where client_id = ${req.clientId}
            and status in ('queued', 'snoozed')
            and due_at <= now()
          order by priority desc, due_at asc, id asc
          for update skip locked
          limit 1
        `);
        const id = Number((result.rows[0] as { id?: number } | undefined)?.id);
        if (!id) return null;
        const [task] = await tx.select().from(callTasksTable).where(eq(callTasksTable.id, id));
        const [prospect] = await tx.select().from(prospectsTable).where(and(
          eq(prospectsTable.id, task.prospectId),
          eq(prospectsTable.clientId, req.clientId),
        ));
        const suppression = prospect ? canCall(prospect) : { allowed: false as const, reason: "Prospect not found" };
        if (!suppression.allowed) {
          await tx.update(callTasksTable).set({
            status: "suppressed",
            suppressedAt: new Date(),
            suppressionReason: suppression.reason,
          }).where(eq(callTasksTable.id, task.id));
          continue;
        }
        const [updated] = await tx.update(callTasksTable).set({
          status: "claimed",
          claimedBy: parsed.data.callerId ?? req.clientId,
          claimedAt: new Date(),
          provider: parsed.data.provider ?? task.provider,
        }).where(and(eq(callTasksTable.id, task.id), eq(callTasksTable.clientId, req.clientId))).returning();
        return updated;
      }
      return null;
    });
    if (!claimed) {
      res.status(204).send();
      return;
    }
    res.json({ task: taskJson(claimed) });
  } catch (err) {
    req.log.warn({ err }, "Call task claim rejected");
    sendKnownError(res, err);
  }
});

router.post("/queue/:id/release", async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const body = releaseSchema.safeParse(req.body ?? {});
  if (!id.success || !body.success) {
    res.status(400).json({ error: (!id.success ? id.error : body.error)!.message });
    return;
  }
  const [task] = await db.update(callTasksTable).set({
    status: body.data.snoozeUntil ? "snoozed" : "queued",
    dueAt: body.data.snoozeUntil ?? new Date(),
    claimedBy: null,
    claimedAt: null,
  }).where(and(
    eq(callTasksTable.id, id.data),
    eq(callTasksTable.clientId, req.clientId),
    eq(callTasksTable.status, "claimed"),
  )).returning();
  if (!task) {
    res.status(409).json({ error: "Claimed call task not found" });
    return;
  }
  res.json({ task: taskJson(task) });
});

router.post("/queue/:id/complete", async (req, res): Promise<void> => {
  const id = idSchema.safeParse(req.params.id);
  const body = completeSchema.safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ error: (!id.success ? id.error : body.error)!.message });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${req.clientId}))`);
      const locked = await tx.execute(sql`
        select id from call_tasks where id = ${id.data} and client_id = ${req.clientId} for update
      `);
      if (!locked.rows.length) throw new Error("Call task not found");
      const [task] = await tx.select().from(callTasksTable).where(eq(callTasksTable.id, id.data));
      if (task.status === "completed") {
        const [call] = await tx.select().from(callsTable).where(and(
          eq(callsTable.taskId, task.id),
          eq(callsTable.clientId, req.clientId),
        ));
        return { task, call, callbackTask: null, idempotent: true, suppressionReason: null };
      }
      if (task.status !== "claimed") throw new Error("Call task must be claimed before completion");
      await assertPilotCapacity(req.clientId, tx);
      const [prospect] = await tx.select().from(prospectsTable).where(and(
        eq(prospectsTable.id, task.prospectId),
        eq(prospectsTable.clientId, req.clientId),
      ));
      if (!prospect) throw new Error("Prospect not found");
      const suppression = canCall(prospect);
      if (!suppression.allowed) {
        const [suppressedTask] = await tx.update(callTasksTable).set({
          status: "suppressed",
          suppressedAt: new Date(),
          suppressionReason: suppression.reason,
          claimedAt: null,
          claimedBy: null,
        }).where(eq(callTasksTable.id, task.id)).returning();
        return {
          task: suppressedTask,
          call: null,
          callbackTask: null,
          idempotent: false,
          suppressionReason: suppression.reason,
        };
      }

      const now = new Date();
      const [call] = await tx.insert(callsTable).values({
        clientId: req.clientId,
        prospectId: task.prospectId,
        taskId: task.id,
        callerId: body.data.callerId ?? task.claimedBy ?? req.clientId,
        status: "completed",
        duration: body.data.duration,
        notes: body.data.notes,
        outcome: body.data.outcome,
        callScript: task.approvedScriptSnapshot,
        callbackAt: body.data.callbackAt,
        provider: body.data.provider ?? task.provider,
        externalId: body.data.externalId ?? task.externalId,
      }).returning();
      const [completedTask] = await tx.update(callTasksTable).set({
        status: "completed",
        completedAt: now,
        outcome: body.data.outcome,
        completionNotes: body.data.notes,
        provider: body.data.provider ?? task.provider,
        externalId: body.data.externalId ?? task.externalId,
      }).where(eq(callTasksTable.id, task.id)).returning();

      let callbackTask: typeof callTasksTable.$inferSelect | null = null;
      if (body.data.outcome === "callback_requested" && body.data.callbackAt) {
        const callbackKey = callbackIdempotencyKey(task.id, body.data.callbackAt);
        [callbackTask] = await tx.insert(callTasksTable).values({
          clientId: req.clientId,
          prospectId: task.prospectId,
          campaignId: task.campaignId,
          sourceTrigger: "callback",
          priority: Math.max(task.priority, 50),
          status: "queued",
          dueAt: body.data.callbackAt,
          idempotencyKey: callbackKey,
          approvedScriptSnapshot: task.approvedScriptSnapshot,
          approvedScriptVersion: task.approvedScriptVersion,
          provider: body.data.provider ?? task.provider,
        }).onConflictDoNothing({
          target: [callTasksTable.clientId, callTasksTable.idempotencyKey],
        }).returning();
        if (!callbackTask) {
          [callbackTask] = await tx.select().from(callTasksTable).where(and(
            eq(callTasksTable.clientId, req.clientId),
            eq(callTasksTable.idempotencyKey, callbackKey),
          ));
        }
      }

      const prospectUpdate: Record<string, unknown> = { lastContactedAt: now };
      if (body.data.outcome === "do_not_call") {
        prospectUpdate.optedOut = true;
        prospectUpdate.optedOutAt = now;
        prospectUpdate.status = "do_not_call";
      } else if (body.data.outcome === "wrong_number") {
        prospectUpdate.status = "wrong_number";
      } else if (body.data.outcome === "not_interested") {
        prospectUpdate.status = "not_interested";
      } else if (body.data.outcome === "meeting_booked") {
        prospectUpdate.status = "booked";
      }
      await tx.update(prospectsTable).set(prospectUpdate).where(and(
        eq(prospectsTable.id, task.prospectId),
        eq(prospectsTable.clientId, req.clientId),
      ));
      if (body.data.outcome === "do_not_call" || body.data.outcome === "wrong_number"
        || body.data.outcome === "not_interested" || body.data.outcome === "meeting_booked") {
        await suppressProspectTasks(req.clientId, task.prospectId, `Call outcome: ${body.data.outcome}`, tx);
      }
      await tx.insert(activityTable).values({
        clientId: req.clientId,
        type: "call_made",
        description: `Call logged for ${prospect.companyName} — ${body.data.outcome}`,
        prospectId: prospect.id,
        prospectName: prospect.contactName,
      });
      return { task: completedTask, call, callbackTask, idempotent: false, suppressionReason: null };
    });
    if (result.suppressionReason) {
      res.status(409).json({
        error: `Call completion suppressed: ${result.suppressionReason}`,
        task: taskJson(result.task),
      });
      return;
    }
    res.json({
      ...result,
      task: taskJson(result.task),
      call: result.call ? { ...result.call, createdAt: result.call.createdAt.toISOString() } : null,
      callbackTask: result.callbackTask ? taskJson(result.callbackTask) : null,
    });
  } catch (err) {
    req.log.warn({ err, taskId: id.data }, "Call completion rejected");
    const message = err instanceof Error ? err.message : "Call completion failed";
    res.status(message.includes("not found") ? 404 : message.includes("limit") || message.includes("not enabled") ? 403 : 409)
      .json({ error: message });
  }
});

router.get("/reporting", async (req, res): Promise<void> => {
  const usage = await getCallerUsage(req.clientId);
  const [statusRows, outcomeRows, triggerRows, callbackRows, dailyRows] = await Promise.all([
    db.select({ key: callTasksTable.status, total: sql<number>`count(*)::int` })
      .from(callTasksTable).where(eq(callTasksTable.clientId, req.clientId)).groupBy(callTasksTable.status),
    db.select({ key: callsTable.outcome, total: sql<number>`count(*)::int` })
      .from(callsTable).where(and(
        eq(callsTable.clientId, req.clientId),
        sql`${callsTable.taskId} is not null`,
      )).groupBy(callsTable.outcome),
    db.select({ key: callTasksTable.sourceTrigger, total: sql<number>`count(*)::int` })
      .from(callTasksTable).where(eq(callTasksTable.clientId, req.clientId)).groupBy(callTasksTable.sourceTrigger),
    db.select({ total: sql<number>`count(*)::int` }).from(callTasksTable).where(and(
      eq(callTasksTable.clientId, req.clientId),
      eq(callTasksTable.sourceTrigger, "callback"),
      inArray(callTasksTable.status, ["queued", "claimed", "snoozed"]),
    )),
    db.execute(sql`
      select to_char(day, 'YYYY-MM-DD') as date, coalesce(count(c.id), 0)::int as total
      from generate_series(current_date - interval '13 days', current_date, interval '1 day') day
      left join calls c on c.client_id = ${req.clientId}
        and c.task_id is not null
        and c.created_at >= day and c.created_at < day + interval '1 day'
      group by day order by day
    `),
  ]);
  const statusCounts = Object.fromEntries(statusRows.map((r) => [r.key, Number(r.total)]));
  res.json({
    enabled: usage.user.callerPilotEnabled,
    counts: {
      queued: statusCounts.queued ?? 0,
      claimed: statusCounts.claimed ?? 0,
      snoozed: statusCounts.snoozed ?? 0,
      completed: statusCounts.completed ?? 0,
      suppressed: statusCounts.suppressed ?? 0,
      callbacks: Number(callbackRows[0]?.total ?? 0),
    },
    limits: {
      today: { completed: usage.today, limit: usage.user.callerDailyLimit },
      month: { completed: usage.month, limit: usage.user.callerMonthlyLimit },
    },
    outcomes: Object.fromEntries(outcomeRows.map((r) => [r.key ?? "unknown", Number(r.total)])),
    triggers: Object.fromEntries(triggerRows.map((r) => [r.key, Number(r.total)])),
    recentDailyTotals: dailyRows.rows.map((r: any) => ({ date: r.date, total: Number(r.total) })),
  });
});

export default router;
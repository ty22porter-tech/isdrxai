import {
  db,
  callsTable,
  callTasksTable,
  campaignsTable,
  prospectsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { canCall, callerLimitViolation } from "./callerPolicy";
export { canCall } from "./callerPolicy";

export const CALL_OUTCOMES = [
  "connected",
  "voicemail",
  "no_answer",
  "callback_requested",
  "information_sent",
  "meeting_booked",
  "not_interested",
  "do_not_call",
  "wrong_number",
] as const;

function periodStarts(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  return { today, month };
}

export async function getCallerUsage(clientId: string, executor: any = db) {
  const { today, month } = periodStarts();
  const [user] = await executor.select().from(usersTable).where(eq(usersTable.id, clientId));
  if (!user) throw new Error("Client not found");
  const [counts] = await executor
    .select({
      today: sql<number>`count(*) filter (where ${callsTable.createdAt} >= ${today})::int`,
      month: sql<number>`count(*) filter (where ${callsTable.createdAt} >= ${month})::int`,
    })
    .from(callsTable)
    .where(and(
      eq(callsTable.clientId, clientId),
      sql`${callsTable.taskId} is not null`,
    ));
  return {
    user,
    today: Number(counts?.today ?? 0),
    month: Number(counts?.month ?? 0),
  };
}

export async function assertPilotCapacity(clientId: string, executor: any = db): Promise<void> {
  const usage = await getCallerUsage(clientId, executor);
  const violation = callerLimitViolation(
    usage.user.callerPilotEnabled,
    usage.today,
    usage.month,
    usage.user.callerDailyLimit,
    usage.user.callerMonthlyLimit,
  );
  if (violation) throw new Error(violation);
}

export async function findApprovedCallCampaign(clientId: string, campaignId?: number, executor: any = db) {
  const conditions = [
    eq(campaignsTable.clientId, clientId),
    eq(campaignsTable.type, "call"),
    sql`trim(coalesce(${campaignsTable.callScript}, '')) <> ''`,
    sql`${campaignsTable.callScriptApprovedAt} is not null`,
    sql`${campaignsTable.callScriptVersion} > 0`,
  ];
  if (campaignId != null) conditions.push(eq(campaignsTable.id, campaignId));
  const [campaign] = await executor
    .select()
    .from(campaignsTable)
    .where(and(...conditions))
    .orderBy(sql`${campaignsTable.callScriptApprovedAt} desc`)
    .limit(1);
  return campaign;
}

interface EnqueueInput {
  clientId: string;
  prospectId: number;
  campaignId?: number;
  sourceTrigger: "manual" | "campaign" | "hot_prospect" | "callback";
  priority?: number;
  dueAt?: Date;
  idempotencyKey: string;
  provider?: string | null;
  externalId?: string | null;
}

export async function enqueueCallTask(input: EnqueueInput, executor: any = db) {
  await assertPilotCapacity(input.clientId, executor);
  const [prospect] = await executor.select().from(prospectsTable).where(and(
    eq(prospectsTable.id, input.prospectId),
    eq(prospectsTable.clientId, input.clientId),
  ));
  if (!prospect) throw new Error("Prospect not found");
  const campaign = await findApprovedCallCampaign(input.clientId, input.campaignId, executor);
  if (!campaign) throw new Error("An approved, non-empty call campaign script is required");

  const suppression = canCall(prospect);
  const now = new Date();
  const values = {
    clientId: input.clientId,
    prospectId: prospect.id,
    campaignId: campaign.id,
    sourceTrigger: input.sourceTrigger,
    priority: input.priority ?? 0,
    status: suppression.allowed ? "queued" : "suppressed",
    dueAt: input.dueAt ?? now,
    suppressedAt: suppression.allowed ? null : now,
    suppressionReason: suppression.allowed ? null : suppression.reason,
    idempotencyKey: input.idempotencyKey,
    approvedScriptSnapshot: campaign.callScript!.trim(),
    approvedScriptVersion: campaign.callScriptVersion,
    provider: input.provider ?? null,
    externalId: input.externalId ?? null,
  };
  const [inserted] = await executor.insert(callTasksTable).values(values)
    .onConflictDoNothing({ target: [callTasksTable.clientId, callTasksTable.idempotencyKey] })
    .returning();
  if (inserted) return { task: inserted, created: true, suppression };
  const [existing] = await executor.select().from(callTasksTable).where(and(
    eq(callTasksTable.clientId, input.clientId),
    eq(callTasksTable.idempotencyKey, input.idempotencyKey),
  ));
  return { task: existing, created: false, suppression: existing?.status === "suppressed"
    ? { allowed: false as const, reason: existing.suppressionReason ?? "Suppressed" }
    : { allowed: true as const } };
}

export async function suppressProspectTasks(
  clientId: string,
  prospectId: number,
  reason: string,
  executor: any = db,
) {
  await executor.update(callTasksTable).set({
    status: "suppressed",
    suppressedAt: new Date(),
    suppressionReason: reason,
    claimedAt: null,
    claimedBy: null,
  }).where(and(
    eq(callTasksTable.clientId, clientId),
    eq(callTasksTable.prospectId, prospectId),
    inArray(callTasksTable.status, ["queued", "claimed", "snoozed"]),
  ));
}

export async function enqueueHotProspect(clientId: string, prospectId: number): Promise<void> {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, clientId));
    if (!user?.callerPilotEnabled) return;
    const campaign = await findApprovedCallCampaign(clientId);
    if (!campaign) {
      logger.warn({ clientId, prospectId }, "Hot prospect was not queued: no approved call campaign");
      return;
    }
    const result = await enqueueCallTask({
      clientId,
      prospectId,
      campaignId: campaign.id,
      sourceTrigger: "hot_prospect",
      priority: 100,
      idempotencyKey: `hot_prospect:${prospectId}`,
    });
    if (!result.suppression.allowed) {
      logger.info({ clientId, prospectId, reason: result.suppression.reason }, "Hot prospect call task suppressed");
    }
  } catch (err) {
    logger.error({ err, clientId, prospectId }, "Failed to enqueue hot prospect call task");
  }
}
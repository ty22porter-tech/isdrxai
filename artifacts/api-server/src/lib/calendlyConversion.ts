import { db, automationRunsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export const LOW_FRICTION_CTA_LABEL = "Find a quick time";
export const CALENDLY_CLICK_FOLLOW_UP_TYPE = "calendly_click_follow_up";

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });

  // Resolve the zone offset twice so DST transitions settle correctly.
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utcMs))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
    utcMs -= representedAsUtc - Date.UTC(year, month - 1, day, hour);
  }
  return new Date(utcMs);
}

function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addBusinessDays(date: Date, count: number, timeZone: string): Date {
  const local = localDateParts(date, timeZone);
  const cursor = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let added = 0;
  while (added < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added++;
  }
  return zonedDateTimeToUtc(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    cursor.getUTCDate(),
    9,
    timeZone,
  );
}

export function nextBusinessDayMorning(from: Date, timeZone = "America/New_York"): Date {
  try {
    return addBusinessDays(from, 1, timeZone);
  } catch {
    return addBusinessDays(from, 1, "America/New_York");
  }
}

export function suggestedSchedulingWindows(from: Date, timeZone = "America/New_York"): string {
  try {
    const first = addBusinessDays(from, 1, timeZone);
    const second = addBusinessDays(first, 1, timeZone);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" });
    return `${weekday.format(first)} morning or ${weekday.format(second)} afternoon`;
  } catch {
    return suggestedSchedulingWindows(from, "America/New_York");
  }
}

export function isSchedulingDestination(destination: string): boolean {
  try {
    const url = new URL(destination);
    return /(^|\.)calendly\.com$/i.test(url.hostname) || /\/app\/schedule\//i.test(url.pathname);
  } catch {
    return false;
  }
}

export function clickFollowUpCopy(
  contactName: string,
  companyName: string,
  now: Date,
  timeZone?: string | null,
): { subject: string; body: string } {
  const firstName = contactName.trim().split(/\s+/)[0] || contactName;
  const windows = suggestedSchedulingWindows(now, timeZone || "America/New_York");
  return {
    subject: `A quick time for ${companyName}?`,
    body:
      `Hi ${firstName},\n\n` +
      `Would ${windows} be easier for a quick conversation about ${companyName}?\n\n` +
      "If neither works, just reply with a preferred time and we'll coordinate from there. You can also use the link below to choose another time.",
  };
}

export async function queueCalendlyClickFollowUp(input: {
  clientId: string;
  prospectId: number;
  campaignId: number | null;
  destination: string;
  clickedAt?: Date;
}): Promise<void> {
  if (!isSchedulingDestination(input.destination)) return;
  try {
    const [client] = await db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, input.clientId))
      .limit(1);
    const clickedAt = input.clickedAt ?? new Date();
    await db.insert(automationRunsTable).values({
      clientId: input.clientId,
      prospectId: input.prospectId,
      campaignKey: input.campaignId ?? 0,
      automationType: CALENDLY_CLICK_FOLLOW_UP_TYPE,
      status: "pending",
      triggerReason: "Verified human scheduling-link click without a booking",
      validOpensAtTrigger: 0,
      scheduledFor: nextBusinessDayMorning(clickedAt, client?.timezone ?? "America/New_York"),
    }).onConflictDoNothing();
  } catch (err) {
    logger.error({ err, prospectId: input.prospectId }, "Failed to queue Calendly click follow-up");
  }
}
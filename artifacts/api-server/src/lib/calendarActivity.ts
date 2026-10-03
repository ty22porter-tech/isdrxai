import { randomUUID } from "node:crypto";
import { db, conversionEventsTable } from "@workspace/db";
import type { Request } from "express";
import { botReason } from "./trackingClassification";

export async function recordCalendarActivity(
  req: Request,
  input: { event: "click" | "error"; reason: string; prospectId?: number; clientId?: string; eventId?: string },
) {
  if (botReason(req.get("user-agent") ?? "")) return;
  try {
    await db.insert(conversionEventsTable).values({
      eventType: input.event === "click" ? "calendar_click" : "calendar_error",
      intent: "calendar", location: "scheduling",
      userId: input.clientId ?? null,
      sourceKey: `calendar:${input.prospectId ?? "anonymous"}:${input.eventId ?? randomUUID()}`,
      metadata: {
        ...(input.prospectId ? { prospectId: input.prospectId } : {}),
        reason: input.reason,
      },
    }).onConflictDoNothing({ target: conversionEventsTable.sourceKey });
  } catch {
    // A telemetry failure must not change booking behavior or expose tokens.
    req.log.warn("Calendar activity reporting failed");
  }
}
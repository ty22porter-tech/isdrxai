import { and, eq, isNull, or, inArray, type AnyColumn } from "drizzle-orm";
import { db, campaignsTable, prospectsTable } from "@workspace/db";
import { normalizeVertical } from "./verticals";

export function belongsToVertical(recordVertical: string | null | undefined, selectedVertical: string | null | undefined) {
  const selected = normalizeVertical(selectedVertical);
  // Pre-isolation legacy rows cannot safely be attributed to the new recruiting vertical.
  return recordVertical ? recordVertical === selected : !["recruiting_staffing", "ai_sales_automation"].includes(selected);
}

export function prospectScope(clientId: string, vertical?: string | null) {
  const selected = normalizeVertical(vertical);
  return and(eq(prospectsTable.clientId, clientId),
    ["recruiting_staffing", "ai_sales_automation"].includes(selected)
      ? eq(prospectsTable.vertical, selected)
      : or(eq(prospectsTable.vertical, selected), isNull(prospectsTable.vertical)));
}

export function campaignScope(clientId: string, vertical?: string | null) {
  const selected = normalizeVertical(vertical);
  return and(eq(campaignsTable.clientId, clientId),
    ["recruiting_staffing", "ai_sales_automation"].includes(selected)
      ? eq(campaignsTable.vertical, selected)
      : or(eq(campaignsTable.vertical, selected), isNull(campaignsTable.vertical)));
}

export function prospectRecordScope(table: { clientId: AnyColumn; prospectId: AnyColumn }, clientId: string, vertical?: string | null) {
  return and(eq(table.clientId, clientId),
    inArray(table.prospectId, db.select({ id: prospectsTable.id }).from(prospectsTable)
      .where(prospectScope(clientId, vertical))));
}

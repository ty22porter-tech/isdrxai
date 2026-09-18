import type { GiftOutreachRecord, GiftOutreachSettings } from "@workspace/db";
import { z } from "zod";

export const DEFAULT_GIFT_SETTINGS: GiftOutreachSettings = {
  enabled: false, defaultMethod: "email", daysAfterDelivery: 1, sentOnlyBusinessDays: 3,
  industry: "", serviceDescriptions: "", discussionPoints: "", schedulingLink: "", emailSignature: "",
  videoHostingPreference: "managed", videoCta: "Watch my personal message",
  businessHoursStart: "09:00", businessHoursEnd: "17:00", timezone: "America/New_York",
  allowedDays: [1, 2, 3, 4, 5], automationLevel: "review", videoFallback: "pause", maxFollowUpAttempts: 1,
};
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const giftSettingsSchema = z.object({
  enabled: z.boolean(), defaultMethod: z.enum(["email", "video", "per_prospect"]),
  daysAfterDelivery: z.number().int().min(1).max(10), sentOnlyBusinessDays: z.number().int().min(3).max(5),
  industry: z.string().max(300), serviceDescriptions: z.string().max(6000), discussionPoints: z.string().max(6000),
  schedulingLink: z.string().max(2000).refine(s => !s || /^https:\/\/[^\s]+$/i.test(s), "Use an HTTPS scheduling URL"),
  emailSignature: z.string().max(2000), videoHostingPreference: z.literal("managed"), videoCta: z.string().max(300),
  businessHoursStart: clock, businessHoursEnd: clock,
  timezone: z.string().refine(s => { try { new Intl.DateTimeFormat("en", { timeZone: s }); return true; } catch { return false; } }, "Invalid IANA time zone"),
  allowedDays: z.array(z.number().int().min(1).max(5)).min(1).max(5),
  automationLevel: z.enum(["auto", "review", "manual"]), videoFallback: z.enum(["pause", "email"]),
  maxFollowUpAttempts: z.number().int().min(1).max(5),
}).strict();
export function validateSettings(value: unknown): GiftOutreachSettings {
  const s = giftSettingsSchema.parse(value);
  if (s.businessHoursEnd <= s.businessHoursStart) throw new Error("Business hours must end after they start");
  return s;
}
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Invalid calendar date");
export const giftRecordEditSchema = z.object({
  giftSent: z.boolean().optional(), giftName: z.string().max(300).optional(),
  sentDate: dateOnly.nullable().optional(), expectedDeliveryDate: dateOnly.nullable().optional(),
  confirmedDeliveryDate: dateOnly.nullable().optional(), carrier: z.string().max(200).optional(),
  trackingReference: z.string().max(2000).optional(), amountSpent: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).nullable().optional(),
  giftNote: z.string().max(6000).optional(), preferredName: z.string().max(200).optional(),
  method: z.enum(["email", "video"]).nullable().optional(), videoId: z.number().int().positive().nullable().optional(),
  complianceRisk: z.boolean().optional(), complianceNotes: z.string().max(4000).optional(),
  draftSubject: z.string().max(300).nullable().optional(), draftBody: z.string().max(12000).nullable().optional(),
}).strict();

export function localParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return { date, clock: `${part("hour")}:${part("minute")}`, weekday: new Date(`${date}T12:00:00Z`).getUTCDay() || 7 };
}
export function addBusinessDays(date: string, count: number): string {
  const cursor = new Date(`${date}T12:00:00Z`);
  while (count > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) count--;
  }
  return cursor.toISOString().slice(0, 10);
}
export function isGiftSendingWindow(now: Date, s: GiftOutreachSettings): boolean {
  const p = localParts(now, s.timezone);
  return s.allowedDays.includes(p.weekday) && p.clock >= s.businessHoursStart && p.clock < s.businessHoursEnd;
}
/** Walk UTC minutes rather than assuming a fixed offset: nonexistent/repeated DST local times are safe. */
export function firstGiftWindow(date: string, s: GiftOutreachSettings): Date {
  const start = new Date(`${date}T00:00:00Z`).getTime() - 14 * 3600000;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: s.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let t = start; t < start + 9 * 86400000; t += 60000) {
    const parts = formatter.formatToParts(new Date(t));
    const part = (name: string) => parts.find(p => p.type === name)!.value;
    const d = `${part("year")}-${part("month")}-${part("day")}`;
    const time = `${part("hour")}:${part("minute")}`;
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay() || 7;
    if (d >= date && s.allowedDays.includes(weekday) && time >= s.businessHoursStart && time < s.businessHoursEnd) return new Date(t);
  }
  throw new Error("No sending window found");
}
export function giftDueAt(r: Pick<GiftOutreachRecord, "giftSent" | "giftName" | "sentDate" | "confirmedDeliveryDate" | "expectedDeliveryDate">, s: GiftOutreachSettings): Date | null {
  if (!r.giftSent || !r.giftName.trim() || !r.sentDate) return null;
  const base = r.confirmedDeliveryDate || r.expectedDeliveryDate || r.sentDate;
  let date = addBusinessDays(base, r.confirmedDeliveryDate || r.expectedDeliveryDate ? s.daysAfterDelivery : s.sentOnlyBusinessDays);
  if (r.expectedDeliveryDate && date < r.expectedDeliveryDate) date = r.expectedDeliveryDate;
  return firstGiftWindow(date, s);
}
export function giftApprovalRequired(s: GiftOutreachSettings, r: Pick<GiftOutreachRecord, "complianceRisk" | "complianceNotes">): boolean {
  return s.automationLevel !== "auto" || r.complianceRisk || !!r.complianceNotes.trim();
}
export function giftApproved(r: Pick<GiftOutreachRecord, "revision" | "approvedRevision" | "approvedAt">): boolean {
  return !!r.approvedAt && r.approvedRevision === r.revision;
}
export function originalStepForGift(step: number): number | null {
  return step === 2 ? null : step >= 3 ? step - 1 : step;
}
export function sequenceLength(gift: boolean, configuredSteps = 6): number { return 1 + configuredSteps + (gift ? 1 : 0); }
export function stoppedProspect(p: { optedOut: boolean; status: string }, enrollment?: { status: string; repliedAt?: Date | null; bookedAt?: Date | null } | null): boolean {
  return p.optedOut || ["replied", "booked", "meeting_booked", "appointment_set", "appointment_scheduled", "converted", "unsubscribed", "not_interested"].includes(p.status)
    || !!enrollment?.repliedAt || !!enrollment?.bookedAt || !!(enrollment && ["replied", "booked", "unsubscribed", "calendly_sent"].includes(enrollment.status));
}
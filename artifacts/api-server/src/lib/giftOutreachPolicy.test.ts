import { describe, expect, it } from "vitest";
import { DEFAULT_GIFT_SETTINGS as defaults, addBusinessDays, firstGiftWindow, giftDueAt, giftApprovalRequired, giftApproved, isGiftSendingWindow, originalStepForGift, sequenceLength, stoppedProspect, validateSettings } from "./giftOutreachPolicy";

describe("gift calendar timing", () => {
  it("counts business days over weekends and year boundaries", () => {
    expect(addBusinessDays("2026-01-02", 1)).toBe("2026-01-05");
    expect(addBusinessDays("2025-12-31", 3)).toBe("2026-01-05");
  });
  it("uses local business hours across spring and autumn DST changes", () => {
    expect(firstGiftWindow("2026-03-09", defaults).toISOString()).toBe("2026-03-09T13:00:00.000Z");
    expect(firstGiftWindow("2026-11-02", defaults).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
  it("respects the restricted sending weekdays and end-exclusive window", () => {
    const s = { ...defaults, allowedDays: [2, 4] };
    expect(firstGiftWindow("2026-03-09", s).toISOString()).toBe("2026-03-10T13:00:00.000Z");
    expect(isGiftSendingWindow(new Date("2026-03-10T21:00:00Z"), s)).toBe(false);
    expect(isGiftSendingWindow(new Date("2026-03-14T15:00:00Z"), defaults)).toBe(false);
  });
  it("never schedules before a gift was actually sent", () => {
    expect(giftDueAt({ giftSent: false, giftName: "Tea", sentDate: "2026-03-01", confirmedDeliveryDate: null, expectedDeliveryDate: null }, defaults)).toBeNull();
    expect(giftDueAt({ giftSent: true, giftName: "", sentDate: "2026-03-01", confirmedDeliveryDate: null, expectedDeliveryDate: null }, defaults)).toBeNull();
  });
  it("uses confirmed then expected then sent-only business-day timing and never precedes expected", () => {
    const r = { giftSent: true, giftName: "Tea", sentDate: "2026-03-02", confirmedDeliveryDate: null, expectedDeliveryDate: null };
    expect(giftDueAt(r, defaults)?.toISOString()).toBe("2026-03-05T14:00:00.000Z");
    expect(giftDueAt({ ...r, expectedDeliveryDate: "2026-03-06" }, defaults)?.toISOString()).toBe("2026-03-09T13:00:00.000Z");
    expect(giftDueAt({ ...r, confirmedDeliveryDate: "2026-03-04", expectedDeliveryDate: "2026-03-10" }, defaults)?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });
  it("rejects timezones, weekend-only days and inverted hours", () => {
    expect(() => validateSettings({ ...defaults, timezone: "Made/Up" })).toThrow();
    expect(() => validateSettings({ ...defaults, allowedDays: [6, 7] })).toThrow();
    expect(() => validateSettings({ ...defaults, businessHoursStart: "18:00" })).toThrow();
  });
});
describe("gift sequence and approval invariants", () => {
  it("defaults to disabled and review, preserves seven steps and maps enabled to eight", () => {
    expect(defaults.enabled).toBe(false);
    expect(defaults.automationLevel).toBe("review");
    expect(sequenceLength(false)).toBe(7);
    expect(sequenceLength(true)).toBe(8);
    expect(Array.from({ length: 8 }, (_, i) => originalStepForGift(i + 1))).toEqual([1, null, 2, 3, 4, 5, 6, 7]);
  });
  it("requires approval for review/manual and overrides auto for compliance", () => {
    expect(giftApprovalRequired(defaults, { complianceRisk: false, complianceNotes: "" })).toBe(true);
    expect(giftApprovalRequired({ ...defaults, automationLevel: "manual" }, { complianceRisk: false, complianceNotes: "" })).toBe(true);
    expect(giftApprovalRequired({ ...defaults, automationLevel: "auto" }, { complianceRisk: true, complianceNotes: "" })).toBe(true);
    expect(giftApproved({ revision: 2, approvedRevision: 1, approvedAt: new Date() })).toBe(false);
  });
  it("stops on reply, booking, unsubscribe or stop status", () => {
    const p = { optedOut: false, status: "contacted" };
    expect(stoppedProspect(p, { status: "replied" })).toBe(true);
    expect(stoppedProspect(p, { status: "active", bookedAt: new Date() })).toBe(true);
    expect(stoppedProspect({ ...p, optedOut: true })).toBe(true);
    expect(stoppedProspect({ ...p, status: "not_interested" })).toBe(true);
    expect(stoppedProspect(p, { status: "active" })).toBe(false);
  });
});
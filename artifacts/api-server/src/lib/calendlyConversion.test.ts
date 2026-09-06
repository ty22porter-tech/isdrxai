import { describe, expect, it } from "vitest";
import {
  LOW_FRICTION_CTA_LABEL,
  CALENDLY_CLICK_FOLLOW_UP_DELAY_MS,
  calendlyClickFollowUpTime,
  clickFollowUpCopy,
  isSchedulingDestination,
  suggestedSchedulingWindows,
} from "./calendlyConversion";

describe("Calendly conversion helpers", () => {
  it("queues scheduling-click follow-ups exactly four hours after the click", () => {
    const scheduled = calendlyClickFollowUpTime(new Date("2026-09-04T20:00:00Z"));
    expect(scheduled.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(CALENDLY_CLICK_FOLLOW_UP_DELAY_MS).toBe(14_400_000);
  });

  it("offers two distinct business-day windows and a reply alternative", () => {
    const copy = clickFollowUpCopy(
      "Jordan Lee",
      "Acme Facilities",
      new Date("2026-09-04T20:00:00Z"),
      "America/Chicago",
    );
    expect(suggestedSchedulingWindows(new Date("2026-09-04T20:00:00Z"), "America/Chicago"))
      .toBe("Monday morning or Tuesday afternoon");
    expect(copy.body).toContain("quick conversation");
    expect(copy.body).toContain("reply with a preferred time");
    expect(LOW_FRICTION_CTA_LABEL).toBe("Find a quick time");
  });

  it("recognizes Calendly and first-party scheduling links only", () => {
    expect(isSchedulingDestination("https://calendly.com/example/10min")).toBe(true);
    expect(isSchedulingDestination("https://app.example.com/app/schedule/token")).toBe(true);
    expect(isSchedulingDestination("https://example.com/article")).toBe(false);
  });
});
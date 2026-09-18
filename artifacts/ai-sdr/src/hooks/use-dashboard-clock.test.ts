import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardGreeting, useDashboardClock, validTimeZone } from "./use-dashboard-clock";

afterEach(() => vi.useRealTimers());

describe("dashboard greeting in the account time zone", () => {
  it.each([
    ["2026-09-17T09:59:00Z", "Good evening"],
    ["2026-09-17T10:00:00Z", "Good morning"],
    ["2026-09-17T16:59:00Z", "Good morning"],
    ["2026-09-17T17:00:00Z", "Good afternoon"],
    ["2026-09-17T22:59:00Z", "Good afternoon"],
    ["2026-09-17T23:00:00Z", "Good evening"],
    ["2026-09-18T03:04:00Z", "Good evening"],
  ])("%s uses Chicago local time", (instant, greeting) => {
    expect(getDashboardGreeting(new Date(instant), "America/Chicago")).toBe(greeting);
  });

  it("uses the selected zone rather than one shared server hour", () => {
    const now = new Date("2026-09-17T17:00:00Z");
    expect(getDashboardGreeting(now, "America/Los_Angeles")).toBe("Good morning");
    expect(getDashboardGreeting(now, "America/New_York")).toBe("Good afternoon");
    expect(getDashboardGreeting(now, "Asia/Kolkata")).toBe("Good evening");
  });

  it("handles daylight saving time without hard-coded offsets", () => {
    expect(getDashboardGreeting(new Date("2026-01-17T17:00:00Z"), "America/Chicago")).toBe("Good morning");
    expect(getDashboardGreeting(new Date("2026-07-17T17:00:00Z"), "America/Chicago")).toBe("Good afternoon");
  });

  it("falls back to device time for missing or invalid saved zones", () => {
    const now = new Date();
    expect(validTimeZone("not/a-zone")).toBeUndefined();
    expect(validTimeZone("")).toBeUndefined();
    expect(getDashboardGreeting(now, "not/a-zone")).toBe(getDashboardGreeting(now));
  });

  it("updates at noon, on focus, and when the profile zone changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T16:59:30Z"));
    const { result, rerender, unmount } = renderHook(
      ({ zone }) => useDashboardClock(zone),
      { initialProps: { zone: "America/Chicago" } },
    );
    expect(result.current.greeting).toBe("Good morning");
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.greeting).toBe("Good afternoon");
    act(() => {
      vi.setSystemTime(new Date("2026-09-18T03:04:00Z"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(result.current.greeting).toBe("Good evening");
    rerender({ zone: "Asia/Tokyo" });
    expect(result.current.greeting).toBe("Good afternoon");
    expect(result.current.dateLabel).toBe(new Date().toLocaleDateString(undefined, {
      timeZone: "Asia/Tokyo", weekday: "long", month: "short", day: "numeric",
    }));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
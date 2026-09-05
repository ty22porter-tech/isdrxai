import { describe, expect, it } from "vitest";
import { callbackIdempotencyKey, callerLimitViolation, canCall } from "./callerPolicy";

describe("caller suppression policy", () => {
  it.each([
    [{ phone: "", optedOut: false, status: "new" }, "no phone"],
    [{ phone: "123", optedOut: false, status: "new" }, "invalid"],
    [{ phone: "212-555-0100", optedOut: true, status: "new" }, "opted out"],
    [{ phone: "212-555-0100", optedOut: false, status: "wrong_number" }, "not callable"],
    [{ phone: "212-555-0100", optedOut: false, status: "closed_won" }, "not callable"],
    [{ phone: "212-555-0100", optedOut: false, status: "closed_lost" }, "not callable"],
    [{ phone: "212-555-0100", optedOut: false, status: "booked" }, "not callable"],
  ])("suppresses %o", (prospect, reason) => {
    const result = canCall(prospect);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason.toLowerCase()).toContain(reason);
  });

  it("allows a non-terminal prospect with a valid phone", () => {
    expect(canCall({ phone: "+1 (212) 555-0100", optedOut: false, status: "contacted" }))
      .toEqual({ allowed: true });
  });
});

describe("caller pilot limits", () => {
  it("requires pilot activation and enforces both limits", () => {
    expect(callerLimitViolation(false, 0, 0, 50, 500)).toContain("not enabled");
    expect(callerLimitViolation(true, 50, 100, 50, 500)).toContain("Daily");
    expect(callerLimitViolation(true, 10, 500, 50, 500)).toContain("Monthly");
    expect(callerLimitViolation(true, 49, 499, 50, 500)).toBeNull();
  });
});

describe("callback idempotency", () => {
  it("is stable for retries and differs for another schedule", () => {
    const at = new Date("2030-01-02T15:00:00.000Z");
    expect(callbackIdempotencyKey(42, at)).toBe(callbackIdempotencyKey(42, new Date(at)));
    expect(callbackIdempotencyKey(42, at)).not.toBe(
      callbackIdempotencyKey(42, new Date("2030-01-02T16:00:00.000Z")),
    );
  });
});
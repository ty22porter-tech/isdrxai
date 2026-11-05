import { describe, expect, it, vi } from "vitest";
import { researchRequest, retryAfterMs } from "./researchRateLimit";

describe("research rate limits", () => {
  it("honors provider seconds, dates, and millisecond retry windows", () => {
    expect(retryAfterMs(new Headers({ "Retry-After": "90" }))).toBe(90_000);
    const now = Date.parse("2026-11-05T12:00:00Z");
    expect(retryAfterMs(new Headers({ "Retry-After": "Thu, 05 Nov 2026 12:02:00 GMT" }), now)).toBe(120_000);
    expect(retryAfterMs(new Headers({ "retry-after-ms": "2500" }))).toBe(2500);
    expect(retryAfterMs(new Headers({ "Retry-After": "invalid" }))).toBe(30_000);
    expect(retryAfterMs(new Headers({ "Retry-After": "-1" }))).toBe(30_000);
    expect(retryAfterMs()).toBe(30_000);
  });
  it("serializes provider calls and never sends a queued request after its signal expires", async () => {
    let finish!: () => void;
    const first = researchRequest(() => new Promise<void>(resolve => { finish = resolve; }));
    await Promise.resolve();
    const controller = new AbortController();
    const secondOperation = vi.fn();
    const second = researchRequest(secondOperation, controller.signal);
    controller.abort();
    finish();
    await first;
    await expect(second).rejects.toThrow();
    expect(secondOperation).not.toHaveBeenCalled();
    expect(await researchRequest(async () => "next")).toBe("next");
  });
});

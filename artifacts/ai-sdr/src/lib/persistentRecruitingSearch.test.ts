import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProspectSearchJob, ProspectSearchRequest } from "@workspace/api-client-react";
import { persistentRecruitingSearch, savedRecruitingSearch } from "./persistentRecruitingSearch";

const request: ProspectSearchRequest = { city: "Dallas", state: "TX", industry: "Manufacturing", count: 10 };
const progress = (changes: Partial<ProspectSearchJob> = {}): ProspectSearchJob => ({
  id: "saved-job", status: "running", completed: 1, total: 10, retryAt: null, retryableCount: 0, ...changes,
});
const done = progress({ status: "completed", responseStatus: 200, result: [] });
const options = () => ({ userId: "synthetic-user", params: { city: "Dallas" }, wait: async () => {}, transport: {
  start: vi.fn(async () => progress()), get: vi.fn(async () => done), retry: vi.fn(async () => done),
} });
beforeEach(() => localStorage.clear());

describe("persistent Recruiting search", () => {
  it("polls the saved job instead of repeating discovery while the provider is waiting", async () => {
    const opts = options();
    opts.transport.get.mockResolvedValueOnce(progress({ status: "waiting", retryAt: "2026-11-05T12:02:00Z" }));
    expect(await persistentRecruitingSearch(request, opts)).toEqual([]);
    expect(opts.transport.start).toHaveBeenCalledTimes(1);
    expect(opts.transport.get).toHaveBeenCalledTimes(2);
    expect(savedRecruitingSearch(opts.userId)?.pending).toBe(false);
  });
  it("reconnects after browser polling fails without creating another search", async () => {
    const opts = options();
    opts.transport.get.mockRejectedValue(new TypeError("offline"));
    await expect(persistentRecruitingSearch(request, opts)).rejects.toThrow(/search is saved/);
    const reconnected = options();
    expect(await persistentRecruitingSearch(request, reconnected)).toEqual([]);
    expect(reconnected.transport.start).not.toHaveBeenCalled();
    expect(reconnected.transport.get).toHaveBeenCalledWith("saved-job", expect.anything());
  });
  it("reuses the idempotency key if the initial response is lost", async () => {
    const opts = options();
    opts.transport.start.mockRejectedValue(new TypeError("response lost"));
    await expect(persistentRecruitingSearch(request, opts)).rejects.toThrow();
    opts.transport.start.mockResolvedValueOnce(done);
    await persistentRecruitingSearch(request, opts);
    expect(opts.transport.start).toHaveBeenCalledTimes(5);
    expect(opts.transport.start.mock.calls.every(call => call[0].requestKey === opts.transport.start.mock.calls[0][0].requestKey)).toBe(true);
  });
  it("retries failed research on the same job without starting employer discovery", async () => {
    const opts = options();
    await persistentRecruitingSearch(request, opts);
    opts.transport.start.mockClear();
    await persistentRecruitingSearch(request, { ...opts, retryFailed: true });
    expect(opts.transport.retry).toHaveBeenCalledWith("saved-job", expect.anything());
    expect(opts.transport.start).not.toHaveBeenCalled();
  });
  it("keeps account-specific saved searches separate", async () => {
    const opts = options();
    await persistentRecruitingSearch(request, opts);
    expect(savedRecruitingSearch("different-user")).toBeUndefined();
  });
  it("can retrieve completed results without starting another paid discovery", async () => {
    const opts = options();
    await persistentRecruitingSearch(request, opts);
    opts.transport.start.mockClear();
    await persistentRecruitingSearch(request, { ...opts, resumeExisting: true });
    expect(opts.transport.start).not.toHaveBeenCalled();
    expect(opts.transport.get).toHaveBeenLastCalledWith("saved-job", expect.anything());
  });
  it("clears an expired saved job instead of reconnecting forever", async () => {
    const opts = options();
    await persistentRecruitingSearch(request, opts);
    opts.transport.get.mockRejectedValueOnce({ status: 404 });
    await expect(persistentRecruitingSearch(request, { ...opts, resumeExisting: true })).rejects.toThrow(/expired/);
    expect(savedRecruitingSearch(opts.userId)).toBeUndefined();
  });
  it("recovers from a startup 502 on creation using the same saved request key", async () => {
    const opts = options();
    opts.transport.start.mockRejectedValueOnce({ status: 502, message: "<!DOCTYPE html><title>Your app is starting…</title>" });
    expect(await persistentRecruitingSearch(request, opts)).toEqual([]);
    expect(opts.transport.start).toHaveBeenCalledTimes(2);
    expect(opts.transport.start.mock.calls[0][0].requestKey).toBe(opts.transport.start.mock.calls[1][0].requestKey);
  });
  it("does not blindly repeat a failed-research POST after a gateway error", async () => {
    const opts = options();
    await persistentRecruitingSearch(request, opts);
    opts.transport.retry.mockRejectedValue({ status: 502 });
    await expect(persistentRecruitingSearch(request, { ...opts, retryFailed: true })).rejects.toThrow(/app is starting/);
    expect(opts.transport.retry).toHaveBeenCalledTimes(1);
    expect(savedRecruitingSearch(opts.userId)?.pending).toBe(true);
    opts.transport.retry.mockClear();
    await persistentRecruitingSearch(request, { ...opts, resumeExisting: true });
    expect(opts.transport.retry).not.toHaveBeenCalled();
    expect(savedRecruitingSearch(opts.userId)?.retrying).toBe(true);
  });
  it("does not retry authorization errors as startup failures", async () => {
    const opts = options();
    opts.transport.start.mockRejectedValue({ status: 401 });
    await expect(persistentRecruitingSearch(request, opts)).rejects.toMatchObject({ status: 401 });
    expect(opts.transport.start).toHaveBeenCalledTimes(1);
  });
  it("does not mistake an HTML startup page returned with status 200 for a saved job", async () => {
    const opts = options();
    opts.transport.start.mockResolvedValueOnce("<!DOCTYPE html><title>Your app is starting</title>" as unknown as ProspectSearchJob);
    expect(await persistentRecruitingSearch(request, opts)).toEqual([]);
    expect(opts.transport.start).toHaveBeenCalledTimes(2);
    expect(savedRecruitingSearch(opts.userId)?.jobId).toBe("saved-job");
  });
});

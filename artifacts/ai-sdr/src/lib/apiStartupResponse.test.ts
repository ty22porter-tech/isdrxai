import { afterEach, describe, expect, it, vi } from "vitest";
import { startProspectSearchJob } from "@workspace/api-client-react";

afterEach(() => vi.unstubAllGlobals());
describe("API startup responses", () => {
  it("shows a readable startup error while retaining the HTTP status for safe retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      '<!DOCTYPE html><html><head><title>Your app is starting…</title><style>private-page-content</style></head></html>',
      { status: 502, statusText: "Bad Gateway", headers: { "Content-Type": "text/html" } },
    )));
    const promise = startProspectSearchJob({ requestKey: "synthetic-request-key", request: {
      city: "Dallas", state: "TX", industry: "Manufacturing", count: 10,
    } });
    await expect(promise).rejects.toMatchObject({ status: 502, message: expect.stringContaining("app is starting") });
    await expect(promise).rejects.not.toThrow(/DOCTYPE|<html|private-page-content/);
  });
});

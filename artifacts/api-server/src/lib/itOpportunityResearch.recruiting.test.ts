import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./officialWebsiteResearch", () => ({
  researchOfficialWebsiteDetailed: vi.fn(async () => ({ signals: [], accessible: true })),
}));

import { researchItOpportunityIntelligence } from "./itOpportunityResearch";
import { eligibleHiringResearch } from "./recruitingJobDiscovery";

const url = "https://example.com/careers/engineer";
const options = {
  clientId: "synthetic-recruiter",
  client: { vertical: "recruiting_staffing" } as any,
  lead: { companyName: "Example Engineering", website: "https://example.com", industry: "Engineering" },
  selectedIndustry: "Engineering", force: true,
};

beforeEach(() => {
  vi.stubEnv("OPENAI_ASTRA_ENABLED", "true");
  vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://research.example");
  vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("recruiting employer research", () => {
  it("keeps employer identity and active jobs when a cited employer is outside the industry filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [
      { type: "web_search_call", status: "completed", action: { sources: [{ url }] } },
      { type: "message", content: [{ type: "output_text", text: JSON.stringify({
        actualIndustry: "Construction services", industryRelationship: "mismatch",
        industryExplanation: "The cited employer operates in construction services.", industrySources: [{ url }],
        industryChallenges: [], prospectConcerns: [], recommendations: [], warnings: [],
        recruiting: { employerIdentity: "confirmed", jobs: [{
          title: "Electrical Engineer", employer: "Example Engineering", location: "Dallas, TX", status: "active",
          sourceURL: url, evidence: "Example Engineering is hiring an Electrical Engineer in Dallas, TX.",
        }] },
      }) }] },
    ] }), { status: 200 })));
    const result = await researchItOpportunityIntelligence(options);
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(request.model).toBe("gpt-6-astra");
    expect(request.reasoning).toEqual({ effort: "medium" });
    expect(request.tools).toEqual([{ type: "web_search" }]);
    expect(request.tool_choice).toEqual({ type: "web_search" });
    expect(request.include).toContain("web_search_call.action.sources");
    expect(request.instructions).toContain("separate verified facts from inference");
    expect(request.max_output_tokens).toBeGreaterThan(8192);
    expect(request).not.toHaveProperty("reasoning_effort");
    expect(result.itResearch.industryRelationship).toBe("mismatch");
    expect(result.itResearch.recruiting).toMatchObject({ employerIdentity: "confirmed", uniqueActiveJobs: 1 });
    expect(result.itResearch.recruiting?.jobs[0].status).toBe("active");
    expect(eligibleHiringResearch(result.itResearch.recruiting, false)).toBe(false);
  });

  it.each([
    [401, /denied access \(HTTP 401\)/],
    [403, /denied access \(HTTP 403\)/],
    [429, /rate-limited \(HTTP 429\)/],
    [503, /temporarily unavailable \(HTTP 503\)/],
  ])("reports HTTP %i without exposing provider response contents", async (status, expected) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-provider-error", { status })));
    const promise = researchItOpportunityIntelligence(options);
    await expect(promise).rejects.toThrow(expected);
    await expect(promise).rejects.not.toThrow("private-provider-error");
  });

  it("reports an incomplete response without treating partial research as verified", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [],
    }), { status: 200 })));
    await expect(researchItOpportunityIntelligence(options)).rejects.toThrow(/response-length limit/);
  });

  it("does not automatically retry an exhausted billing quota as a temporary rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "insufficient_quota", message: "private-provider-detail" },
    }), { status: 429, headers: { "Retry-After": "30" } })));
    await expect(researchItOpportunityIntelligence(options)).rejects.toMatchObject({
      message: expect.stringContaining("exhausted its provider quota"), retryAfterMs: undefined,
    });
  });

  it("identifies a research timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("private-provider-error", "TimeoutError"); }));
    await expect(researchItOpportunityIntelligence(options)).rejects.toThrow(/timed out/);
  });

  it("identifies a connection failure without exposing its raw error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("private-provider-error"); }));
    await expect(researchItOpportunityIntelligence(options)).rejects.toThrow(/could not reach the configured research service/);
  });

  it("identifies malformed provider JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not JSON", { status: 200 })));
    await expect(researchItOpportunityIntelligence(options)).rejects.toThrow(/unreadable response/);
  });
});

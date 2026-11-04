import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverHiringEmployers, eligibleHiringResearch, employerWebsite, parseHiringEmployers, sameJobLocation } from "./recruitingJobDiscovery";
import { parseRecruitingResearch } from "./recruitingResearch";

const url = "https://careers.example.com/jobs/123";
const search = { city: "Austin", state: "TX", industries: ["Manufacturing"], count: 10 };
const job = { title: "CNC Machinist", employer: "Example Manufacturing", location: "Austin, Texas",
  status: "active", sourceURL: url, evidence: "Example Manufacturing is hiring a CNC Machinist in Austin, Texas.",
  roleFamily: "Skilled trades", postedAt: new Date().toISOString() };
const employer = { companyName: job.employer, website: "https://example.com", industry: "Manufacturing", jobs: [job] };
const payload = (employers: unknown[], sources = [url]) => ({ output: [
  { type: "web_search_call", status: "completed", action: { sources: sources.map(url => ({ url })) } },
  { type: "message", content: [{ type: "output_text", text: JSON.stringify({ employers }) }] },
] });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("jobs-first discovery", () => {
  it.each(["https://jobs.lever.co/servicewire", "https://job-boards.greenhouse.io/metoxinternationalinc",
    "https://tenant.wd1.myworkdayjobs.com/careers", "https://www.indeed.com/jobs",
    "https://tenant.fa.us6.oraclecloud.com/careers"])("never assigns a shared hiring platform as the employer domain: %s", website => {
    expect(employerWebsite(website)).toBeUndefined();
    expect(parseHiringEmployers(payload([{ ...employer, website }]), search)[0].website).toBeUndefined();
  });
  it("resolves missing employer websites through a separate cited official-domain search", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://proxy.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
    const resolution = {
      output: [
        { type: "web_search_call", status: "completed", action: { sources: [{ url: "https://example.com/about" }] } },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({
          employers: [{ companyName: job.employer, website: "https://example.com", sourceURL: "https://example.com/about" }],
        }) }] },
      ],
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload([{ ...employer, website: "https://jobs.lever.co/example" }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => resolution });
    vi.stubGlobal("fetch", fetcher);
    const found = await discoverHiringEmployers(search);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(found[0].website).toBe("https://example.com");
    expect(found[0].jobs[0].sourceURL).toBe(url);
  });
  it("keeps postings with no employer domain when website resolution fails instead of guessing", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://proxy.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload([{ ...employer, website: "https://jobs.lever.co/example" }]) })
      .mockResolvedValueOnce({ ok: false, status: 503 }));
    const found = await discoverHiringEmployers(search);
    expect(found).toHaveLength(1);
    expect(found[0].website).toBeUndefined();
    expect(found[0].jobs).toHaveLength(1);
  });
  it("rejects uncited or platform-hosted domain resolutions", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://proxy.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload([{ ...employer, website: null }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        output: [
          { type: "web_search_call", status: "completed", action: { sources: [{ url }] } },
          { type: "message", content: [{ type: "output_text", text: JSON.stringify({
            employers: [{ companyName: job.employer, website: "https://invented.example", sourceURL: "https://invented.example/about" }],
          }) }] },
        ],
      }) }));
    expect((await discoverHiringEmployers(search))[0].website).toBeUndefined();
  });
  it("preserves radius qualification across equivalent location spelling", () => {
    expect(sameJobLocation("Austin, Texas", "Austin TX")).toBe(true);
    expect(sameJobLocation("Charleston, West Virginia", "Charleston WV")).toBe(true);
    expect(sameJobLocation("Austin TX", "Houston TX")).toBe(false);
  });
  it("uses job location rather than a headquarters address and groups syndicated copies", () => {
    const result = parseHiringEmployers(payload([employer, employer]), search);
    expect(result).toHaveLength(1);
    expect(result[0].jobs).toHaveLength(1);
    expect(result[0].jobs[0].location).toBe("Austin, Texas");
  });
  it.each([
    { title: "Accountant" }, { status: "closed" }, { location: "Houston, TX" },
    { agencyPolicyEvidence: "No agencies" }, { postedAt: null },
  ])("applies hiring filters before business research: %j", changes => {
    const results = parseHiringEmployers(payload([{ ...employer, jobs: [{ ...job, ...changes }] }]), {
      ...search, filters: { jobTitles: "Machinist", recencyDays: 30 },
    });
    expect(results).toEqual([]);
  });
  it("does not use uncited model-generated openings or a failed search as an empty result", () => {
    expect(() => parseHiringEmployers(payload([employer], []), search)).toThrow(/citable/);
    expect(() => parseHiringEmployers({ output: [] }, search)).toThrow(/did not complete/);
    expect(parseHiringEmployers(payload([]), search)).toEqual([]);
  });
  it("accepts provider citation annotations when search action sources are absent", () => {
    const result = payload([employer], []);
    const content = result.output[1] as any;
    content.content[0].annotations = [{ type: "url_citation", url }];
    expect(parseHiringEmployers(result, search)).toHaveLength(1);
  });
  it("accepts citable public HTTP listings without accepting arbitrary model-only URLs", () => {
    const httpUrl = url.replace("https:", "http:");
    const result = payload([{ ...employer, jobs: [{ ...job, sourceURL: httpUrl }] }], [httpUrl]);
    expect(parseHiringEmployers(result, search)).toHaveLength(1);
  });
  it("excludes unnamed agency clients and unrelated employer industries", () => {
    expect(parseHiringEmployers(payload([{ ...employer, agencyUnidentified: true },
      { ...employer, industry: "Technology" }]), search)).toEqual([]);
  });
  it("searches jobs without a Google business search or Maps key", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://proxy.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload([employer]) });
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverHiringEmployers(search)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://proxy.example/responses");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).input).toContain("JOB OPENINGS first");
  });
  it("requires the minimum unique job count before employer research", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://proxy.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload([employer, employer]) }));
    expect(await discoverHiringEmployers({ ...search, filters: { minRelevantJobs: 2 } })).toEqual([]);
  });
  it("applies radius to job locations, not employer headquarters", async () => {
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://proxy.example");
    vi.stubEnv("AI_INTEGRATIONS_OPENAI_API_KEY", "test-only");
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-only");
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload([employer]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [{ location: { latitude: 30.26, longitude: -97.74 } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ places: [{ location: { latitude: 30.27, longitude: -97.75 } }] }) });
    vi.stubGlobal("fetch", fetcher);
    expect(await discoverHiringEmployers({ ...search, filters: { radiusMiles: 10 } })).toHaveLength(1);
    expect(JSON.parse(fetcher.mock.calls[2][1].body).textQuery).toBe("Austin, Texas");
  });
});

describe("contact lookup qualification", () => {
  const report = () => ({ ...parseRecruitingResearch({ employerIdentity: "confirmed", jobs: [job] },
    { companyName: job.employer, identityVerified: true, allowedSourceUrls: [url] }), commercialFit: 80 });
  it("requires verified hiring plus an explicit service match", () => {
    expect(eligibleHiringResearch(report(), true)).toBe(true);
    expect(eligibleHiringResearch(report(), false)).toBe(false);
  });
  it.each([
    { employerIdentity: "unverified" }, { automationSuppressed: true }, { jobs: [] }, { commercialFit: 0 },
  ])("blocks lookup for %j", changes => {
    expect(eligibleHiringResearch({ ...report(), ...changes }, true)).toBe(false);
  });
});

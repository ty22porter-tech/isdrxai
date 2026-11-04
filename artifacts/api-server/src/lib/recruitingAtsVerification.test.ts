import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRecruitingResearch } from "./recruitingResearch";
import { verifyPublishedAtsJobs } from "./recruitingAtsVerification";

const id = "70d0d4af-ed2c-478b-9e93-7e1d6dd66aa2";
const company = "Service Wire";
const source = `https://jobs.lever.co/servicewire/${id}/apply`;
const rawJob = { employer: company, title: "Machine Operator", location: "Houston, TX 77044",
  sourceURL: source, status: "unknown", evidence: "Machine Operator in Houston, TX." };
const report = () => parseRecruitingResearch({ employerIdentity: "confirmed", jobs: [rawJob] }, {
  companyName: company, identityVerified: true, allowedSourceUrls: [source],
});
const published = { id, text: "Machine Operator", categories: { location: "Houston, TX 77044" },
  descriptionPlain: "Service Wire is hiring a Machine Operator in Houston.", updatedAt: Date.now() };
afterEach(() => vi.unstubAllGlobals());

describe("public ATS posting verification", () => {
  it("verifies a sourced Houston opening independently of AI without guessing its posting date", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(published) });
    vi.stubGlobal("fetch", fetcher);
    const result = await verifyPublishedAtsJobs(report(), company);
    expect(fetcher).toHaveBeenCalledWith(`https://api.lever.co/v0/postings/servicewire/${id}`,
      expect.objectContaining({ redirect: "error" }));
    expect(result.jobs[0]).toMatchObject({ status: "active", title: "Machine Operator", location: "Houston, TX 77044", postedAt: null });
    expect(result.uniqueActiveJobs).toBe(1);
  });
  it("never substitutes posting publication for employer verification", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const unverified = { ...report(), employerIdentity: "unverified" as const };
    expect(await verifyPublishedAtsJobs(unverified, company)).toBe(unverified);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps unavailable and mismatched postings unknown rather than inventing closure", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ ...published, id: "different-job" }) });
    vi.stubGlobal("fetch", fetcher);
    expect((await verifyPublishedAtsJobs(report(), company)).jobs[0].status).toBe("unknown");
    expect((await verifyPublishedAtsJobs(report(), company)).jobs[0].status).toBe("unknown");
  });
  it("does not fetch an arbitrary host disguised as an ATS source", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const input = report();
    input.jobs[0].sourceURL = `https://jobs.lever.co.attacker.example/servicewire/${id}`;
    await verifyPublishedAtsJobs(input, company);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("retains no-agencies restrictions even beyond the displayed evidence excerpt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({
      ...published, descriptionPlain: "Role details. ".repeat(250), additionalPlain: "We do not accept unsolicited resumes from agencies.",
    }) }));
    const result = await verifyPublishedAtsJobs(report(), company);
    expect(result.jobs[0].noAgencies).toBe(true);
    expect(result.automationSuppressed).toBe(true);
  });
  it("checks Greenhouse published jobs on a fixed public endpoint", async () => {
    const url = "https://job-boards.greenhouse.io/manufacturer/jobs/12345";
    const input = parseRecruitingResearch({ employerIdentity: "confirmed", jobs: [{ ...rawJob, sourceURL: url }] }, {
      companyName: company, identityVerified: true, allowedSourceUrls: [url],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({
      id: 12345, title: "Production Technician", location: { name: "Houston, TX" },
      content: "&lt;p&gt;We are hiring a Production Technician in Houston.&lt;/p&gt;",
    }) }));
    expect((await verifyPublishedAtsJobs(input, company)).jobs[0]).toMatchObject({ status: "active", title: "Production Technician" });
  });
});

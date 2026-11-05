import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecruitingJob } from "@workspace/db";
import { recruitingContactTargets } from "./recruitingContactTargeting";
import { enrichPerson } from "./apollo";

const job = (title: string, overrides: Partial<RecruitingJob> = {}) => ({
  title, location: "Houston, TX", status: "active", noAgencies: false, ...overrides,
}) as RecruitingJob;
const lead = { companyName: "Example Manufacturing", website: "https://example.com",
  email: "unknown@example.invalid", vertical: "recruiting_staffing" };
const org = { name: lead.companyName, primary_domain: "example.com", website_url: lead.website };
const candidate = (id: string, title: string, city = "Houston") => ({ id, title, city, has_email: true, organization: org });
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("recruiting department targets", () => {
  it("uses role rather than employer industry and distinguishes infrastructure", () => {
    const targets = recruitingContactTargets([job("Software Engineer"), job("Lead Site Reliability Engineer"),
      job("Lead Software Engineer - Infrastructure Platforms")]);
    expect(targets.classify("Director, Infrastructure", false)).toBe("Infrastructure & Platform Engineering");
    expect(targets.classify("Senior Software Engineering Manager", false)).toBe("Software Engineering");
    expect(targets.classify("Software Engineer", false)).toBeUndefined();
    expect(targets.classify("Technical Recruiter", false)).toBeUndefined();
    expect(targets.classify("Technical Recruiter", true)).toBe("Talent Acquisition / HR");
    expect(targets.describe("Infrastructure & Platform Engineering", false, "Houston").openingTitles)
      .toEqual(["Lead Site Reliability Engineer", "Lead Software Engineer - Infrastructure Platforms"]);
  });

  it.each([
    ["CNC HBM Machinist", "Plant Manager", "Manufacturing & Plant Operations"],
    ["Registered Nurse", "Director of Nursing", "Clinical & Nursing"],
    ["Supply Chain Engineer", "Supply Chain Director", "Supply Chain & Procurement"],
    ["People Operations Manager", "HR Manager", "Human Resources"],
    ["Credit Analyst", "Finance Director", "Finance & Accounting"],
    ["Warehouse Associate", "Warehouse Manager", "Logistics & Warehouse Operations"],
  ])("maps %s to relevant leadership", (opening, title, department) => {
    expect(recruitingContactTargets([job(opening)]).classify(title, false)).toBe(department);
  });

  it("does not target closed, unknown or agency-restricted postings", () => {
    const targets = recruitingContactTargets([job("Software Engineer", { status: "unknown" }),
      job("CNC Machinist", { status: "closed" }), job("Registered Nurse", { noAgencies: true })]);
    expect(targets.hasActiveJobs).toBe(false);
    expect(targets.titles).toEqual([]);
  });
});

describe("Apollo department contact discovery", () => {
  it("ranks local department leaders, reveals only a relevant company match and explains selection", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ people: [
        candidate("owner", "Owner"), candidate("distant", "Software Engineering Manager", "Boston"),
        candidate("local", "Software Engineering Manager"),
      ] }))
      .mockResolvedValueOnce(response({ person: { ...candidate("local", "Software Engineering Manager"),
        name: "Example Manager", email: "manager@example.com",
        phone_numbers: [{ sanitized_number: "+17135550101" }] } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await enrichPerson({ ...lead, recruitingJobs: [job("Software Engineer")] });
    expect(result).toMatchObject({ ok: true, person: { contactName: "Example Manager",
      email: "manager@example.com", phone: "+17135550101", contactMatch: {
      kind: "department", department: "Software Engineering", locationMatch: true,
      openingTitles: ["Software Engineer"], reason: expect.stringContaining("Hiring authority is not confirmed"),
    } } });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      q_organization_domains_list: ["example.com"], person_titles: expect.arrayContaining(["software engineering manager"]),
    });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ id: "local", reveal_personal_emails: false });
  });

  it("falls back to talent acquisition, never an unrelated owner", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ people: [candidate("owner", "Owner")] }))
      .mockResolvedValueOnce(response({ people: [candidate("recruiter", "Technical Recruiter")] }))
      .mockResolvedValueOnce(response({ person: { ...candidate("recruiter", "Technical Recruiter"),
        email: "recruiter@example.com" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await enrichPerson({ ...lead, recruitingJobs: [job("Software Engineer")] }))
      .toMatchObject({ ok: true, person: { contactMatch: { kind: "talent_acquisition" } } });
    expect(JSON.parse(fetcher.mock.calls[1][1].body).person_titles).toContain("technical recruiter");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("explains an employer name variant using the matched domain and labels a company phone", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ people: [candidate("plant", "Plant Manager")] }))
      .mockResolvedValueOnce(response({ person: { ...candidate("plant", "Plant Manager"),
        email: "plant@example.com", organization: { ...org, name: "Example Manufacturing LLC", phone: "+18775550101" },
      } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await enrichPerson({ ...lead, recruitingJobs: [job("Manufacturing Engineer")] });
    expect(result).toMatchObject({ ok: true, person: { phone: "+18775550101", contactMatch: {
      reason: expect.stringContaining("Apollo employer: Example Manufacturing LLC. Matched supplied employer domain: example.com."),
    } } });
    if (result.ok) expect(result.person?.contactMatch?.reason).toContain("Phone source: Apollo company record");
  });

  it("rechecks revealed department and company, without generic fallback", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ people: [candidate("one", "Software Engineering Manager"),
        candidate("two", "Software Engineering Manager")] }))
      .mockResolvedValueOnce(response({ person: { ...candidate("one", "Sales Director"), email: "sales@example.com" } }))
      .mockResolvedValueOnce(response({ person: { ...candidate("two", "Software Engineering Manager"),
        email: "wrong@other.com", organization: { name: lead.companyName, primary_domain: "other.com" } } }))
      .mockResolvedValueOnce(response({ people: [candidate("owner", "Owner")] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await enrichPerson({ ...lead, recruitingJobs: [job("Software Engineer")] }))
      .toEqual({ ok: true, person: null });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not search without active jobs and preserves known-email enrichment", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(response({ person: {
      ...candidate("known", "Software Engineering Manager"), email: "known@example.com",
    } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await enrichPerson({ ...lead, recruitingJobs: [job("Software Engineer", { status: "unknown" })] }))
      .toEqual({ ok: true, person: null });
    expect(fetcher).not.toHaveBeenCalled();
    await enrichPerson({ ...lead, email: "known@example.com", recruitingJobs: [job("Software Engineer")] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("/people/match");
  });

  it("bounds reveals to five unique people across department and HR searches", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetcher = vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (url.includes("/people/match")) return response({ person: {
        ...candidate(body.id, body.id.startsWith("hr") ? "Technical Recruiter" : "Software Engineering Manager"), email: null,
      } });
      return response({ people: body.person_titles.includes("technical recruiter")
        ? [candidate("dept-1", "Technical Recruiter"), ...Array.from({ length: 5 }, (_, i) => candidate(`hr-${i}`, "Technical Recruiter"))]
        : Array.from({ length: 5 }, (_, i) => candidate(`dept-${i}`, "Software Engineering Manager")) });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await enrichPerson({ ...lead, recruitingJobs: [job("Software Engineer")] }))
      .toEqual({ ok: true, person: null });
    const revealIds = fetcher.mock.calls.filter(([url]) => url.includes("/people/match"))
      .map(([, options]) => JSON.parse(String(options.body)).id);
    expect(revealIds).toHaveLength(5);
    expect(new Set(revealIds).size).toBe(5);
  });
});

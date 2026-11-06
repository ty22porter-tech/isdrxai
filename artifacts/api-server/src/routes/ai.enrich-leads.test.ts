import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  usersTable: {},
  prospectsTable: {},
}));
vi.mock("../lib/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/apollo", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/apollo")>(),
  enrichPerson: vi.fn(),
}));
vi.mock("../lib/sellerResearch", () => ({
  ensureCurrentSellerResearch: vi.fn(async (_id, client) => client),
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/companyDemographicResearch", () => ({ researchCompanyDemographics: vi.fn() }));
vi.mock("../lib/publicBreachResearch", () => ({ researchPublicBreachRecords: vi.fn(async () => []) }));
vi.mock("../lib/itOpportunityResearch", () => {
  class ItOpportunityResearchError extends Error {}
  class ItOpportunityResearchTimeoutError extends ItOpportunityResearchError {}
  return {
    cacheTrustedItResearch: vi.fn(),
    attachResearchProof: vi.fn((value) => ({ ...value, researchProof: "updated-server-proof" })),
    verifyResearchHandoff: vi.fn(() => ({ ok: false, reason: "missing" })),
    ItOpportunityResearchError,
    ItOpportunityResearchTimeoutError,
    researchItOpportunityIntelligence: vi.fn(),
    withResearchPipelineTimeout: vi.fn(),
  };
});

import router from "./ai";
import { db } from "@workspace/db";
import { enrichPerson } from "../lib/apollo";
import { researchCompanyDemographics } from "../lib/companyDemographicResearch";
import { researchItOpportunityIntelligence } from "../lib/itOpportunityResearch";
import { verifyResearchHandoff } from "../lib/itOpportunityResearch";
import { withResearchPipelineTimeout } from "../lib/itOpportunityResearch";
import { parseRecruitingResearch } from "../lib/recruitingResearch";

const handler = (router as any).stack.find((layer: any) => layer.route?.path === "/enrich-leads").route.stack.at(-1).handle;
const leads = (count: number) => Array.from({ length: count }, (_, index) => ({
  companyName: `Synthetic Business ${index}`,
  email: `contact${index}@example.invalid`,
}));
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

describe("recruiting research refresh", () => {
  it.each([
    ["active", "Dallas, TX", undefined, false],
    ["unknown", "Dallas, TX", undefined, true],
    ["active", "Houston, TX", undefined, true],
    ["active", "Dallas, TX", 25, undefined],
  ])("rechecks %s hiring in %s with radius %s", async (status, location, radiusMiles, expected) => {
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: async () => [{ id: "synthetic-client", vertical: "recruiting_staffing",
        sellerIntelligenceProfile: { status: "ready", websiteAnalysisStatus: "ready", sellerCompanyName: "Synthetic Recruiter",
          sellerServices: ["Engineering direct-hire recruiting"], sellerProducts: [], sellerCapabilities: [],
          userOverrides: { sellerServices: ["Engineering direct-hire recruiting"] } },
      }] }),
    } as any);
    const hiring = parseRecruitingResearch({ employerIdentity: "confirmed", jobs: [{
      employer: "Synthetic Employer", title: "Manufacturing Engineer", location, status,
      sourceURL: "https://example.com/careers/engineer", evidence: "Engineer opening.",
    }] }, { companyName: "Synthetic Employer", identityVerified: true,
      allowedSourceUrls: ["https://example.com/careers/engineer"] });
    vi.mocked(researchItOpportunityIntelligence).mockResolvedValue({ signals: [], itResearch: {
      sellerVertical: "recruiting_staffing", selectedIndustry: "Manufacturing",
      actualIndustry: "Manufacturing", industryRelationship: "match", industryExplanation: "Employer confirmed",
      industrySources: [], lastResearched: new Date().toISOString(), warnings: [],
      industryChallenges: [], prospectConcerns: [], recommendations: [{
        concernId: "engineering", offering: "Engineering direct-hire recruiting", howItHelps: "Fill engineering roles",
        businessValue: "Staff capacity", sellerEvidence: { availability: "user_approved", sources: [] },
      }], recruiting: hiring,
    } } as any);
    vi.mocked(withResearchPipelineTimeout).mockImplementation(promise => promise);
    const refresh = (router as any).stack.find((layer: any) =>
      layer.route?.path === "/opportunity-intelligence/refresh").route.stack.at(-1).handle;
    const res = response();
    await refresh({ clientId: "synthetic-client", body: {
      selectedIndustry: "Manufacturing", lead: { companyName: "Synthetic Employer", industry: "Manufacturing" },
      searchContext: { city: "Dallas", state: "TX", recruitingFilters: { radiusMiles } },
    }, log: { info: vi.fn(), warn: vi.fn() } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].outsideSelectedFilters).toBe(expected);
  });

  it("forwards preliminary postings for independent verification without looking up contacts", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: async () => [{ id: "synthetic-client", vertical: "recruiting_staffing" }] }),
    } as any);
    const hiring = parseRecruitingResearch({ jobs: [{
      employer: "Synthetic Employer", title: "Manufacturing Engineer", location: "Dallas, TX",
      status: "active", sourceURL: "https://example.com/careers/engineer", evidence: "Engineer opening in Dallas.",
    }] }, { companyName: "Synthetic Employer", identityVerified: false,
      allowedSourceUrls: ["https://example.com/careers/engineer"] });
    expect(hiring.jobs[0].status).toBe("unknown");
    vi.mocked(researchItOpportunityIntelligence).mockResolvedValue({ signals: [], itResearch: {
      sellerVertical: "recruiting_staffing", selectedIndustry: "Manufacturing",
      actualIndustry: "Manufacturing", industryRelationship: "match", industryExplanation: "Employer confirmed",
      industrySources: [], lastResearched: new Date().toISOString(), warnings: [],
      industryChallenges: [], prospectConcerns: [], recommendations: [], recruiting: hiring,
    } } as any);
    vi.mocked(withResearchPipelineTimeout).mockImplementation(promise => promise);
    const refresh = (router as any).stack.find((layer: any) =>
      layer.route?.path === "/opportunity-intelligence/refresh").route.stack.at(-1).handle;
    const res = response();
    await refresh({ clientId: "synthetic-client", body: {
      selectedIndustry: "Manufacturing", lead: { companyName: "Synthetic Employer", location: "Dallas, TX" },
      discoveredHiring: hiring.jobs,
    }, log: { info: vi.fn(), warn: vi.fn() } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(researchItOpportunityIntelligence).toHaveBeenCalledWith(expect.objectContaining({
      force: true, discoveredHiring: hiring.jobs,
    }));
    expect(enrichPerson).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].opportunityIntelligence.itResearch.recruiting.jobs)
      .toEqual(hiring.jobs);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: async () => [{ id: "synthetic-client", vertical: "janitorial" }] }),
  } as any);
  vi.mocked(researchCompanyDemographics).mockResolvedValue(undefined);
  vi.mocked(researchItOpportunityIntelligence).mockResolvedValue({ signals: [], itResearch: undefined } as any);
});

describe("contact enrichment batch limits", () => {
  it.each([21, 100])("enriches all %i search results without exceeding five concurrent Apollo calls", async count => {
    let active = 0;
    let peak = 0;
    vi.mocked(enrichPerson).mockImplementation(async input => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return { ok: true, person: { contactName: input.companyName, email: "verified@example.com", employeeCount: 10 } } as any;
    });
    const res = response();
    await handler({ body: { leads: leads(count) }, clientId: "synthetic-client" }, res);
    expect(enrichPerson).toHaveBeenCalledTimes(count);
    expect(peak).toBeLessThanOrEqual(5);
    expect(res.status).not.toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.results).toHaveLength(count);
    expect(result.results.map((item: any) => item.index)).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(result.results.every((item: any) => item.status === "enriched")).toBe(true);
  });

  it.each([0, 101])("rejects %i leads with 400 before querying the database or Apollo", async count => {
    const res = response();
    await handler({ body: { leads: leads(count) }, clientId: "synthetic-client" }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.select).not.toHaveBeenCalled();
    expect(enrichPerson).not.toHaveBeenCalled();
  });
});

describe("contact enrichment failure isolation", () => {
  it.each([
    ["missing", "proof is missing"], ["expired", "proof has expired"],
    ["identity_changed", "employer details changed"], ["seller_changed", "seller profile changed"],
    ["invalid", "proof could not be verified"],
  ] as const)("explains a %s research handoff without blaming hiring qualification or calling Apollo", async (reason, message) => {
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{
      id: "synthetic-client", vertical: "recruiting_staffing",
    }] }) } as any);
    vi.mocked(verifyResearchHandoff).mockReturnValue({ ok: false, reason });
    const res = response();
    await handler({ clientId: "synthetic-client", body: { leads: [{
      companyName: "Synthetic Employer", email: "unknown@example.invalid",
    }] } }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({ status: "failed", error: expect.stringContaining(message) });
    expect(enrichPerson).not.toHaveBeenCalled();
  });
  const realisticLead = (index: number) => ({
    companyName: `Regional Manufacturing ${index}`,
    email: `contact${index}@regional.invalid`,
    website: `regional${index}.example`,
    industry: "Manufacturing",
    city: "Columbus",
    state: "OH",
  });
  const person = {
    contactName: "Jamie Rivera",
    email: "jamie@regional.example",
    title: "Operations Director",
    phone: "555-0100",
    linkedinUrl: null,
    employeeCount: null,
    organizationDescription: null,
    website: "https://regional.example",
  };

  it("retains the verified recruiting openings used to select the Apollo contact instead of researching different roles", async () => {
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [{
      id: "synthetic-client", vertical: "recruiting_staffing",
    }] }) } as any);
    const hiring = parseRecruitingResearch({ employerIdentity: "confirmed", jobs: [{
      employer: "Regional Manufacturing 0", title: "Manufacturing Engineer", location: "Columbus, OH",
      sourceURL: "https://regional0.example/careers/123", status: "active", evidence: "Manufacturing Engineer opening.",
    }] }, { companyName: "Regional Manufacturing 0", identityVerified: true,
      allowedSourceUrls: ["https://regional0.example/careers/123"] });
    hiring.commercialFit = 80;
    vi.mocked(verifyResearchHandoff).mockReturnValue({ ok: true, handoff: { signals: [], itResearch: {
      sellerVertical: "recruiting_staffing", selectedIndustry: "Manufacturing", actualIndustry: "Manufacturing",
      industryRelationship: "match", industryExplanation: "Manufacturer", industrySources: [], warnings: [],
      industryChallenges: [], prospectConcerns: [], recommendations: [{
        concernId: "engineering", offering: "temp to hire", howItHelps: "Engineering support",
        businessValue: "Staff capacity", sellerEvidence: { availability: "user_approved", sources: [] },
      }], recruiting: hiring,
    } } } as any);
    vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person: { ...person, employeeCount: 400 } } as any);
    const res = response();
    await handler({ clientId: "synthetic-client", body: { leads: [realisticLead(0)] } }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      status: "enriched", email: person.email, opportunityIntelligence: { itResearch: {
        recruiting: { jobs: [expect.objectContaining({ title: "Manufacturing Engineer", status: "active" })] },
      } },
    });
    expect(enrichPerson).toHaveBeenCalledWith(expect.objectContaining({ recruitingJobs: hiring.jobs }));
    expect(researchItOpportunityIntelligence).not.toHaveBeenCalled();
  });

  it("retains an Apollo contact when opportunity research throws", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person } as any);
    vi.mocked(researchItOpportunityIntelligence).mockRejectedValue(new Error("provider body must not escape"));
    const res = response();
    await handler({ body: { leads: [realisticLead(0)] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      status: "enriched",
      contactName: "Jamie Rivera",
      email: "jamie@regional.example",
      researchWarning: expect.stringContaining("Opportunity research was unavailable"),
    });
    expect(res.json.mock.calls[0][0].results[0].error).toBeUndefined();
  });

  it("re-signs trusted search research for Apollo demographics when optional research fails", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({
      ok: true,
      person: { ...person, employeeCount: 84 },
    } as any);
    vi.mocked(verifyResearchHandoff).mockReturnValue({
      ok: true,
      handoff: {
        signals: [],
        itResearch: {
          selectedIndustry: "Manufacturing",
          actualIndustry: "Manufacturing",
          industryRelationship: "match",
          industryExplanation: "Verified operating sector.",
          industrySources: [],
          lastResearched: new Date().toISOString(),
          warnings: [],
          industryChallenges: [],
          prospectConcerns: [],
          recommendations: [],
        },
      },
    } as any);
    vi.mocked(researchItOpportunityIntelligence).mockRejectedValue(new Error("optional provider unavailable"));
    const res = response();
    await handler({
      body: {
        leads: [{
          ...realisticLead(0),
          opportunityIntelligence: {
            version: 3,
            score: 20,
            label: "Low Priority",
            scoreConfidence: "medium",
            definition: "Server-derived snapshot",
            breakdown: [
              "company_industry_fit",
              "verified_buying_signals",
              "seller_prospect_match",
              "decision_maker_match",
              "signal_freshness",
              "business_need_potential",
            ].map((key) => ({
              key,
              label: key,
              points: 0,
              maxPoints: 20,
              explanation: "",
              evidence: [],
            })),
            signals: [],
            whyTarget: "",
            potentialNeeds: [],
            recommendedOutreach: "",
            generatedAt: "2025-01-01T00:00:00.000Z",
            researchProof: "original-search-proof",
            itResearch: {
              selectedIndustry: "Manufacturing",
              actualIndustry: "Manufacturing",
              industryRelationship: "match",
              industryExplanation: "Verified operating sector.",
              industrySources: [],
              lastResearched: "2025-01-01T00:00:00.000Z",
              warnings: [],
              industryChallenges: [],
              prospectConcerns: [],
              recommendations: [],
            },
          },
        }],
      },
      clientId: "synthetic-client",
    }, res);

    expect(verifyResearchHandoff).toHaveBeenCalledWith(
      "original-search-proof",
      "synthetic-client",
      expect.objectContaining({ companyName: "Regional Manufacturing 0", employeeCount: undefined }),
      expect.objectContaining({ id: "synthetic-client" }),
    );
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      status: "enriched",
      employeeCount: 84,
      opportunityIntelligence: {
        researchProof: "updated-server-proof",
      },
      researchWarning: expect.stringContaining("existing opportunity intelligence was kept"),
    });
  });

  it("isolates demographics failure and still retains the Apollo contact", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person } as any);
    vi.mocked(researchCompanyDemographics).mockRejectedValue(new Error("private upstream detail"));
    const res = response();
    await handler({ body: { leads: [realisticLead(0)] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      status: "enriched",
      contactName: "Jamie Rivera",
      researchWarning: expect.stringContaining("Company size research was unavailable"),
    });
  });

  it("keeps an explicit Apollo failure failed with a useful safe error", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({ ok: false, planBlocked: false, error: "Apollo rate limit reached — try again in a minute." });
    const res = response();
    await handler({ body: { leads: [realisticLead(0)] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results[0]).toEqual({
      index: 0,
      status: "failed",
      error: "Apollo rate limit reached — try again in a minute.",
    });
  });

  it("keeps no-person Apollo results as not_found even when optional research fails", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person: null });
    vi.mocked(researchCompanyDemographics).mockRejectedValue(new Error("demographics unavailable"));
    vi.mocked(researchItOpportunityIntelligence).mockRejectedValue(new Error("research unavailable"));
    const res = response();
    await handler({ body: { leads: [realisticLead(0)] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      index: 0,
      status: "not_found",
      researchWarning: expect.stringContaining("Company size research was unavailable"),
    });
  });

  it("does not mark a name-only result at a placeholder address as enriched, while retaining research", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({
      ok: true,
      person: { ...person, email: null, employeeCount: 45 },
    } as any);
    const res = response();
    await handler({ body: { leads: [realisticLead(0)] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({
      status: "not_found",
      contactName: "Jamie Rivera",
      employeeCount: 45,
    });
    expect(res.json.mock.calls[0][0].results[0].email).toBeUndefined();
    expect(researchItOpportunityIntelligence).toHaveBeenCalled();
  });

  it.each(["missing@regional.INVALID", "missing@invalid.com", "not-an-email"])(
    "does not mark an unusable returned email %s as enriched",
    async email => {
      vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person: { ...person, email } } as any);
      const res = response();
      await handler({ body: { leads: [realisticLead(0)] }, clientId: "synthetic-client" }, res);
      expect(res.json.mock.calls[0][0].results[0]).toMatchObject({ status: "not_found", contactName: "Jamie Rivera" });
      expect(res.json.mock.calls[0][0].results[0].email).toBeUndefined();
    },
  );

  it("retains a usable existing email when Apollo finds a person without returning an address", async () => {
    vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person: { ...person, email: null } } as any);
    const res = response();
    await handler({ body: { leads: [{ ...realisticLead(0), email: " Jamie@Regional.Example " }] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results[0]).toMatchObject({ status: "enriched", email: "jamie@regional.example" });
  });

  it("converts one unexpected lead exception to a failure while other leads succeed", async () => {
    vi.mocked(enrichPerson)
      .mockRejectedValueOnce(new Error("unexpected secret-bearing provider response"))
      .mockResolvedValueOnce({ ok: true, person: { ...person, employeeCount: 25 } } as any);
    const res = response();
    await handler({ body: { leads: [realisticLead(0), realisticLead(1)] }, clientId: "synthetic-client" }, res);
    expect(res.json.mock.calls[0][0].results).toEqual([
      { index: 0, status: "failed", error: "Contact lookup could not be completed for this lead. Try again." },
      expect.objectContaining({ index: 1, status: "enriched", contactName: "Jamie Rivera" }),
    ]);
  });
});

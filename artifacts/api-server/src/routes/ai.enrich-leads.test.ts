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
vi.mock("../lib/apollo", () => ({ enrichPerson: vi.fn() }));
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

const handler = (router as any).stack.find((layer: any) => layer.route?.path === "/enrich-leads").route.stack.at(-1).handle;
const leads = (count: number) => Array.from({ length: count }, (_, index) => ({
  companyName: `Synthetic Business ${index}`,
  email: `contact${index}@example.invalid`,
}));
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

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
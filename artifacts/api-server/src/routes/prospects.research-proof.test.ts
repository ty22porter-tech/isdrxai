import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: { select: vi.fn() } };
});
vi.mock("../lib/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/sellerResearch", () => ({
  ensureCurrentSellerResearch: vi.fn(async (_id, client) => client),
}));

import type { OpportunityIntelligence } from "@workspace/db";
import { db } from "@workspace/db";
import { attachResearchProof } from "../lib/itOpportunityResearch";
import router, { ResearchHandoffError, trustedProspectValues } from "./prospects";

const secret = "prospect-proof-regression-secret-at-least-32-characters";
const seller = {
  id: "tenant-a",
  vertical: "it_services",
  sellerIntelligenceProfile: null,
  sellerServicePriorities: "",
} as any;
const lead = {
  companyName: "Regional Manufacturing",
  contactName: "Jamie Rivera",
  email: "jamie@regional.example",
  website: "https://regional.example",
  industry: "Manufacturing",
  city: "Columbus",
  state: "OH",
  employeeCount: undefined,
};
const report = {
  selectedIndustry: "Manufacturing",
  actualIndustry: "Manufacturing",
  industryRelationship: "match",
  industryExplanation: "The official site identifies its manufacturing operation.",
  industrySources: [],
  lastResearched: "2025-01-01T00:00:00.000Z",
  warnings: [],
  industryChallenges: [],
  prospectConcerns: [],
  recommendations: [],
} as any;

function signedFor(input: Omit<typeof lead, "employeeCount"> & { employeeCount?: number }): OpportunityIntelligence {
  const categoryKeys = [
    "company_industry_fit",
    "verified_buying_signals",
    "seller_prospect_match",
    "decision_maker_match",
    "signal_freshness",
    "business_need_potential",
  ];
  const intelligence = {
    version: 3,
    score: 20,
    label: "Low Priority",
    scoreConfidence: "medium",
    definition: "Server-derived test snapshot",
    breakdown: categoryKeys.map(key => ({
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
    itResearch: report,
  } as any;
  return attachResearchProof(intelligence, seller.id, input, seller);
}

beforeEach(() => {
  process.env.SESSION_SECRET = secret;
});

afterEach(() => {
  delete process.env.SESSION_SECRET;
  vi.useRealTimers();
});

describe("single and bulk prospect research handoffs", () => {
  it("accepts the server-re-signed Apollo employee update used by both save routes", async () => {
    const enriched = { ...lead, employeeCount: 84 };
    const updatedProof = signedFor(enriched);

    const trusted = await trustedProspectValues(
      { ...enriched, opportunityIntelligence: updatedProof },
      "it_services",
      seller,
    );

    expect(trusted.employeeCount).toBe(84);
    expect(trusted.opportunityIntelligence.itResearch.selectedIndustry).toBe("Manufacturing");
    expect(trusted.opportunityIntelligence.researchProof).toEqual(expect.any(String));
  });

  it("rejects an old proof after browser-visible demographics changed", async () => {
    const originalProof = signedFor(lead);
    await expect(trustedProspectValues(
      { ...lead, employeeCount: 84, opportunityIntelligence: originalProof },
      "it_services",
      seller,
    )).rejects.toMatchObject({
      name: "ResearchHandoffError",
      reason: "identity_changed",
    });
  });

  it("rejects tampered and cross-tenant proofs", async () => {
    const signed = signedFor(lead) as any;
    const tampered = `${signed.researchProof.slice(0, -1)}x`;
    await expect(trustedProspectValues(
      { ...lead, opportunityIntelligence: { ...signed, researchProof: tampered } },
      "it_services",
      seller,
    )).rejects.toBeInstanceOf(ResearchHandoffError);
    await expect(trustedProspectValues(
      { ...lead, opportunityIntelligence: signed },
      "it_services",
      { ...seller, id: "tenant-b" },
    )).rejects.toMatchObject({ reason: "invalid" });
  });

  it("reports expired proofs as a recoverable refresh requirement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const signed = signedFor(lead);
    vi.setSystemTime(new Date("2025-01-17T00:00:00.000Z"));

    await expect(trustedProspectValues(
      { ...lead, opportunityIntelligence: signed },
      "it_services",
      seller,
    )).rejects.toMatchObject({
      message: expect.stringContaining("Refresh"),
      reason: "expired",
    });
  });

  it("returns a clear 409 instead of a 500 for an expired single-save proof", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const signed = signedFor(lead);
    vi.setSystemTime(new Date("2025-01-17T00:00:00.000Z"));
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: async () => [seller] }),
    } as any);
    const handler = (router as any).stack.find((layer: any) =>
      layer.route?.path === "/" && layer.route?.methods?.post
    ).route.stack.at(-1).handle;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler({
      body: { ...lead, phone: "555-0100", opportunityIntelligence: signed },
      clientId: seller.id,
      log: { warn: vi.fn() },
    }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining("Refresh"),
      code: "research_refresh_required",
    });
  });

  it("returns a recoverable per-row bulk failure for an expired proof", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const signed = signedFor(lead);
    vi.setSystemTime(new Date("2025-01-17T00:00:00.000Z"));
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: () => ({ where: async () => [seller] }) } as any)
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as any);
    const handler = (router as any).stack.find((layer: any) =>
      layer.route?.path === "/bulk" && layer.route?.methods?.post
    ).route.stack.at(-1).handle;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler({
      body: {
        duplicateStrategy: "skip",
        prospects: [{ ...lead, phone: "555-0100", opportunityIntelligence: signed }],
      },
      clientId: seller.id,
    }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      added: 0,
      failed: 1,
      results: [{
        index: 0,
        success: false,
        error: expect.stringContaining("Refresh"),
      }],
    }));
  });
});
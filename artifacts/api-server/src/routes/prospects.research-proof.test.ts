import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() } };
});
vi.mock("../lib/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/sellerResearch", () => ({
  ensureCurrentSellerResearch: vi.fn(async (_id, client) => client),
}));
vi.mock("../lib/apollo", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/apollo")>(), enrichPerson: vi.fn(),
}));

import type { OpportunityIntelligence } from "@workspace/db";
import { db } from "@workspace/db";
import { attachResearchProof } from "../lib/itOpportunityResearch";
import router, { ResearchHandoffError, trustedProspectValues } from "./prospects";
import { enrichPerson } from "../lib/apollo";

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
  it("passes saved verified openings to Apollo and blocks unverified recruiting bulk enrichment", async () => {
    const jobs = [{ title: "Registered Nurse", status: "active", noAgencies: false }];
    const report = { industryRelationship: "match", recommendations: [{}], recruiting: {
      employerIdentity: "confirmed", automationSuppressed: false, commercialFit: 80, jobs,
    } };
    const row = { id: 1, clientId: "tenant-a", vertical: "recruiting_staffing",
      companyName: "Example Health", email: "unknown@example.invalid", contactName: "Owner",
      opportunityIntelligence: { itResearch: report } };
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [row] }) } as any);
    vi.mocked(enrichPerson).mockResolvedValue({ ok: true, person: null });
    vi.mocked(enrichPerson).mockClear();
    const handler = (router as any).stack.find((layer: any) =>
      layer.route?.path === "/bulk-enrich").route.stack.at(-1).handle;
    const res = { json: vi.fn() };
    await handler({ body: { ids: [1] }, clientId: "tenant-a" }, res);
    expect(enrichPerson).toHaveBeenCalledWith(expect.objectContaining({ recruitingJobs: jobs }));
    row.opportunityIntelligence.itResearch.recruiting.employerIdentity = "unverified";
    await handler({ body: { ids: [1] }, clientId: "tenant-a" }, res);
    expect(enrichPerson).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls.at(-1)?.[0]).toMatchObject({ failed: 1 });
  });
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

describe("prospect route email validation", () => {
  const handler = (path: string, method: "post" | "patch") =>
    (router as any).stack.find((layer: any) => layer.route?.path === path && layer.route?.methods?.[method]).route.stack.at(-1).handle;
  const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
  const request = (email: string) => ({
    body: { ...lead, phone: "555-0100", email },
    clientId: seller.id,
    log: { warn: vi.fn() },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReturnValue({ from: () => ({ where: async () => [seller] }) } as any);
  });

  it.each(["name@company.INVALID", "name@invalid.com", "name@sub.invalid.com", "not-an-email", "name@-company.com"])(
    "rejects %s on single save before research or persistence",
    async email => {
      const res = response();
      await handler("/", "post")(request(email), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: expect.stringContaining("Invalid email address") });
      expect(db.select).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it("reports invalid bulk rows individually without researching or saving them", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: () => ({ where: async () => [seller] }) } as any)
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as any);
    const res = response();
    await handler("/bulk", "post")({
      body: {
        duplicateStrategy: "skip",
        prospects: ["name@company.INVALID", "name@invalid.com", "name@sub.invalid.com", "no-at-sign"].map(email => request(email).body),
      },
      clientId: seller.id,
    }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      added: 0,
      failed: 4,
      results: [0, 1, 2, 3].map(index => ({ index, success: false, error: expect.stringContaining("Invalid email address") })),
    }));
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each(["name@company.INVALID", "name@invalid.com", "name@sub.invalid.com", "bad-email"])(
    "rejects an explicitly supplied update email %s before persistence",
    async email => {
      const res = response();
      await handler("/:id", "patch")({ ...request(email), params: { id: "12" }, body: { email } }, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(db.select).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it("allows editing another field on a legacy placeholder record without rewriting its email", async () => {
    const existing = { ...lead, id: 12, email: "old@company.invalid", vertical: "janitorial", opportunityIntelligence: null };
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: () => ({ where: async () => [existing] }) } as any)
      .mockReturnValueOnce({ from: () => ({ where: async () => [seller] }) } as any);
    const set = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [{ ...existing, notes: "Reviewed", createdAt: new Date() }] }) });
    vi.mocked(db.update).mockReturnValue({ set } as any);
    const res = response();
    await handler("/:id", "patch")({ ...request(existing.email), params: { id: "12" }, body: { notes: "Reviewed" } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ notes: "Reviewed" });
  });

  it("normalizes an explicitly supplied valid email on update", async () => {
    const existing = { ...lead, id: 12, vertical: "janitorial", opportunityIntelligence: null };
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: () => ({ where: async () => [existing] }) } as any)
      .mockReturnValueOnce({ from: () => ({ where: async () => [seller] }) } as any);
    const set = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [{ ...existing, createdAt: new Date() }] }) });
    vi.mocked(db.update).mockReturnValue({ set } as any);
    await handler("/:id", "patch")({ ...request(" Jamie@Regional.Example "), params: { id: "12" }, body: { email: " Jamie@Regional.Example " } }, response());
    expect(set).toHaveBeenCalledWith({ email: "jamie@regional.example" });
  });

  it("normalizes email before researching and inserting a single prospect", async () => {
    const normalized = { ...lead, phone: "555-0100", email: "jamie@regional.example" };
    const values = vi.fn().mockReturnValue({ returning: async () => [{
      ...normalized, id: 12, createdAt: new Date(),
    }] });
    vi.mocked(db.insert).mockReturnValue({ values } as any);
    await handler("/", "post")({
      ...request(" Jamie@Regional.Example "),
      body: { ...normalized, email: " Jamie@Regional.Example ", opportunityIntelligence: signedFor(normalized) },
    }, response());
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ email: "jamie@regional.example" }));
  });

  it("normalizes valid bulk email before researching and persisting the row", async () => {
    const normalized = { ...lead, phone: "555-0100", email: "jamie@regional.example" };
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: () => ({ where: async () => [seller] }) } as any)
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) } as any);
    const values = vi.fn().mockImplementation((rows: any[]) => ({
      returning: async () => rows.map(row => ({ ...row, id: 12, createdAt: new Date() })),
    }));
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => callback({
      insert: () => ({ values }),
    }) as any);
    const res = response();
    await handler("/bulk", "post")({
      clientId: seller.id,
      body: { duplicateStrategy: "skip", prospects: [{
        ...normalized, email: " Jamie@Regional.Example ", opportunityIntelligence: signedFor(normalized),
      }] },
    }, res);
    expect(values).toHaveBeenCalledWith([expect.objectContaining({ email: "jamie@regional.example" })]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ added: 1, failed: 0 }));
  });
});
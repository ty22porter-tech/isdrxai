import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  ensureCurrentSellerResearch: vi.fn(),
  generateProspectEmailDraft: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select: mocks.select },
  prospectsTable: { id: "prospect.id", clientId: "prospect.clientId" },
  usersTable: { id: "user.id" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  and: vi.fn((...values: unknown[]) => values),
}));
vi.mock("../lib/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clientId = "client-1";
    next();
  },
  requireEntitlement: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../lib/emailGeneration", () => ({
  EmailGenerationError: class EmailGenerationError extends Error {
    status = 422;
  },
  generateProspectEmailDraft: mocks.generateProspectEmailDraft,
}));
vi.mock("../lib/sellerResearch", () => ({
  ensureCurrentSellerResearch: mocks.ensureCurrentSellerResearch,
}));
vi.mock("../lib/verticals", () => ({
  getVerticalConfig: () => ({
    key: "it_services",
    senderDescriptor: "an IT services provider",
    fallbackChallenges: [],
    industryChallenges: {},
    fallbackEmailSubject: (company: string) => `A question for ${company}`,
  }),
}));
vi.mock("../lib/prospectMatching", () => ({
  genericOutreach: vi.fn(),
  industryMatch: vi.fn(() => ({ challenges: ["reliability"], operation: "operations" })),
  potentialNeedsForSeller: vi.fn(),
  sellerIntelligenceProfile: vi.fn(() => ({ ready: false, services: [], products: [], capabilities: [], ctas: [] })),
}));
vi.mock("../lib/apollo", () => ({ enrichPerson: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/opportunityIntelligence", () => ({
  buildOpportunityIntelligence: vi.fn(),
}));
vi.mock("../lib/publicBreachResearch", () => ({ researchPublicBreachRecords: vi.fn() }));
vi.mock("../lib/companyDemographicResearch", () => ({ researchCompanyDemographics: vi.fn() }));
vi.mock("../lib/itOpportunityResearch", () => ({
  cacheTrustedItResearch: vi.fn(),
  attachResearchProof: vi.fn(),
  ItOpportunityResearchError: class ItOpportunityResearchError extends Error {},
  ItOpportunityResearchTimeoutError: class ItOpportunityResearchTimeoutError extends Error {},
  researchItOpportunityIntelligence: vi.fn(),
  withResearchPipelineTimeout: vi.fn(),
}));

const prospect = {
  id: 41,
  clientId: "client-1",
  companyName: "Harbor Health",
  contactName: "Jordan Ellis",
  industry: "Healthcare",
  city: "Dallas",
  state: "TX",
} as any;
const client = { id: "client-1", vertical: "it_services" } as any;

describe("POST /api/ai/generate-email", () => {
  let router: any;

  beforeEach(async () => {
    vi.resetModules();
    mocks.select.mockReset();
    mocks.ensureCurrentSellerResearch.mockReset().mockResolvedValue(client);
    mocks.generateProspectEmailDraft.mockReset().mockResolvedValue({
      subject: "A support question for Harbor Health",
      body: "Hi Jordan,\n\nWould it be useful to compare notes?",
      relevanceScore: 90,
      regenerated: false,
    });
    mocks.select
      .mockReturnValueOnce({ from: () => ({ where: vi.fn().mockResolvedValue([prospect]) }) })
      .mockReturnValueOnce({ from: () => ({ where: vi.fn().mockResolvedValue([client]) }) });
    ({ default: router } = await import("./ai"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates the owned prospect to the AI writer and preserves the draft contract", async () => {
    const app = express();
    app.use(express.json());
    app.use(router);
    let server: Server | undefined;
    try {
      const baseUrl = await new Promise<string>((resolve) => {
        server = app.listen(0, "127.0.0.1", () => {
          const address = server?.address();
          if (!address || typeof address === "string") throw new Error("test server failed");
          resolve(`http://127.0.0.1:${address.port}`);
        });
      });
      const response = await fetch(`${baseUrl}/generate-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: 41, tone: "professional" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        subject: "A support question for Harbor Health",
        body: "Hi Jordan,\n\nWould it be useful to compare notes?",
      });
      expect(mocks.generateProspectEmailDraft).toHaveBeenCalledWith(prospect, client, "professional");
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
  });
});
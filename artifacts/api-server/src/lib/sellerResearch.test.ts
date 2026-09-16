import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  usersTable: {},
}));

import {
  parseSellerResearchResponse,
  sellerResearchIsCurrent,
  sellerResearchSameCompany,
  researchedIdentityMatchesPrior,
  sellerResearchWriteSnapshotMatches,
  researchSellerCompany,
} from "./sellerResearch";
import { buildGenericSellerProfile } from "./sellerIntelligence";

const toolSources = [{
  type: "web_search_call",
  status: "completed",
  action: {
    sources: [{
      url: "https://acme-clean.example/services",
      title: "Acme Clean Services | Official Company",
      published_date: "2026-08-01T00:00:00Z",
    }],
  },
}];

function response(overrides: Record<string, unknown> = {}) {
  return {
    output: [
      ...structuredClone(toolSources),
      {
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            identityStatus: "confirmed",
            resolvedCompanyName: "Acme Clean",
            identityAliases: ["Acme Facilities"],
            identitySourceUrls: ["https://acme-clean.example/services"],
            officialSourceUrls: ["https://acme-clean.example/services"],
            sellerServices: ["commercial cleaning"],
            sellerProducts: [],
            sellerCapabilities: ["floor care"],
            sellerDifferentiators: [],
            sellerCertifications: [],
            sellerIndustriesServed: [],
            sellerBusinessOutcomes: [],
            sellerProblemsSolved: [],
            sellerProofPoints: [],
            sellerPortfolioExamples: [],
            sellerValuePropositions: [],
            sellerTypicalCustomers: [],
            sellerCTAs: [],
            factEvidence: {
              sellerServices: {
                "commercial cleaning": ["https://acme-clean.example/services"],
              },
              sellerCapabilities: {
                "floor care": ["https://acme-clean.example/services"],
              },
            },
            ...overrides,
          }),
        }],
      },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("seller company-name research", () => {
  it("accepts only actual completed web-search sources and preserves tool metadata", () => {
    const profile = parseSellerResearchResponse(response(), {
      companyName: "Acme Clean",
      vertical: "janitorial",
      website: null,
    });
    expect(profile.researchVersion).toBe(2);
    expect(profile.researchStatus).toBe("ready");
    expect(profile.researchIdentity).toEqual({
      companyName: "Acme Clean",
      vertical: "janitorial",
      aliases: ["Acme Facilities"],
    });
    expect(profile.researchMethod).toBe("responses_web_search");
    expect(profile.researchSources?.[0]).toMatchObject({
      title: "Acme Clean Services | Official Company",
      url: "https://acme-clean.example/services",
      publishedDate: "2026-08-01T00:00:00.000Z",
    });
    expect(profile.sellerWebsite).toBeNull();
  });

  it("discards seller facts without a matching completed-source factEvidence entry", () => {
    const profile = parseSellerResearchResponse(response({
      sellerServices: ["commercial cleaning", "unsupported offering"],
      factEvidence: {
        sellerServices: {
          "commercial cleaning": ["https://acme-clean.example/services"],
        },
      },
    }), {
      companyName: "Acme Clean",
      vertical: "janitorial",
    });
    expect(profile.sellerServices).toEqual(["commercial cleaning"]);
    expect(profile.sellerCapabilities).toEqual([]);
    expect(profile.status).toBe("needs_review");
  });

  it("does not treat a model-controlled title on an unrelated host as an official identity source", () => {
    const spoofed = response({
      identitySourceUrls: ["https://unrelated.example/acme"],
      officialSourceUrls: ["https://unrelated.example/acme"],
    });
    (spoofed.output[0] as any).action.sources[0] = {
      url: "https://unrelated.example/acme",
      title: "Acme Clean | Official Company",
    };
    expect(() => parseSellerResearchResponse(spoofed, {
      companyName: "Acme Clean",
      vertical: "janitorial",
    })).toThrow(/official source/i);
  });

  it("fails explicitly when sources are absent, incomplete, or identity is ambiguous", () => {
    const noSources = response();
    (noSources.output[0] as any).status = "in_progress";
    expect(() => parseSellerResearchResponse(noSources, {
      companyName: "Acme Clean",
      vertical: "janitorial",
    })).toThrow(/completed web-search sources/i);

    expect(() => parseSellerResearchResponse(response({ identityStatus: "ambiguous" }), {
      companyName: "Acme Clean",
      vertical: "janitorial",
    })).toThrow(/disambiguate/i);

    expect(() => parseSellerResearchResponse(response({
      officialSourceUrls: ["https://unrelated.example/about"],
      identitySourceUrls: ["https://unrelated.example/about"],
    }), {
      companyName: "Acme Clean",
      vertical: "janitorial",
    })).toThrow(/official source/i);
  });

  it("uses company name and seller vertical in the Responses web-search request, never the submitted website", async () => {
    const priorBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const priorKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://research.example";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => response(),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const profile = await researchSellerCompany({
        companyName: "Acme Clean",
        vertical: "janitorial",
        website: "https://submitted-website.example",
      }, { force: true, clientId: "tenant-a" });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(body.input).toContain('Acme Clean');
      expect(body.input).toContain('janitorial');
      expect(body.input).toContain("Do not use, fetch, crawl, or depend on any seller website");
      expect(body.input).not.toContain("submitted-website.example");
      expect(profile.researchIdentity?.vertical).toBe("janitorial");
    } finally {
      if (priorBase === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = priorBase;
      if (priorKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = priorKey;
    }
  });

  it("treats a company-name change as a new identity while allowing vertical changes for the same company", () => {
    const profile = {
      ...buildGenericSellerProfile(null, "janitorial", "legacy"),
      sellerCompanyName: "Acme Clean",
      researchVersion: 2,
      researchStatus: "ready" as const,
      researchIdentity: {
        companyName: "Acme Clean",
        vertical: "janitorial",
        aliases: ["Acme Facilities"],
      },
      researchLastAnalyzed: new Date().toISOString(),
    };
    expect(sellerResearchSameCompany(profile, "Acme Clean")).toBe(true);
    expect(sellerResearchSameCompany(profile, "Acme Facilities")).toBe(true);
    expect(sellerResearchSameCompany(profile, "Other Clean")).toBe(false);
    expect(sellerResearchIsCurrent(profile, "Acme Clean", "janitorial")).toBe(true);
    expect(sellerResearchIsCurrent(profile, "Acme Clean", "fleet_wraps")).toBe(false);
  });

  it("keeps approvals across a rebrand when the new result cites the prior name as an alias", () => {
    const prior = {
      ...buildGenericSellerProfile(null, "janitorial", "legacy"),
      sellerCompanyName: "Acme Clean",
      researchIdentity: {
        companyName: "Acme Clean",
        vertical: "janitorial",
      },
    } as any;
    const researched = {
      ...buildGenericSellerProfile(null, "janitorial", "new"),
      sellerCompanyName: "Acme Facilities",
      researchIdentity: {
        companyName: "Acme Facilities",
        vertical: "janitorial",
        aliases: ["Acme Clean"],
      },
    } as any;
    expect(researchedIdentityMatchesPrior(researched, prior)).toBe(true);
  });

  it("rejects a Settings research write when ensure refreshed the profile concurrently", () => {
    const before = {
      businessName: "Acme Clean",
      vertical: "janitorial",
      sellerIntelligenceProfile: {
        status: "ready",
        userOverrides: { sellerServices: ["approved service"] },
      },
    };
    // This is the profile a concurrent ensureCurrentSellerResearch call
    // returned after acquiring the advisory lock.
    const afterEnsure = {
      ...before,
      sellerIntelligenceProfile: {
        ...before.sellerIntelligenceProfile,
        researchLastAnalyzed: "2026-08-01T00:00:00.000Z",
      },
    };
    expect(sellerResearchWriteSnapshotMatches(before, before)).toBe(true);
    expect(sellerResearchWriteSnapshotMatches(afterEnsure, before)).toBe(false);
    expect(sellerResearchWriteSnapshotMatches({
      ...before,
      businessName: "New Company",
    }, before)).toBe(false);
  });
});

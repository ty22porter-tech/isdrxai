/**
 * Tests for prospect-search: Google Places integration, result mapping,
 * IT-services scoring overlay, and missing/invalid key error handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { genericOutreach, sellerContext, sellerIntelligenceProfile } from "../lib/prospectMatching";

// ── Mocks must be hoisted before imports ──────────────────────────────────────
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  usersTable: {},
  prospectsTable: {},
}));
vi.mock("../lib/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => { _req.clientId = "client-1"; next(); },
  requireEntitlement: (_req: any, _res: any, next: any) => { next(); },
}));
vi.mock("../lib/verticals", () => ({
  getVerticalConfig: (v: string | undefined) => ({ key: v === "it_services" || v === "fleet_wraps" || v === "recruiting_staffing" ? v : "janitorial" }),
}));
vi.mock("../lib/sellerResearch", () => ({
  ensureCurrentSellerResearch: vi.fn((_id: string, client: any) => client),
}));
vi.mock("../lib/itOpportunityResearch", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/itOpportunityResearch")>(),
  researchItOpportunityIntelligence: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("seller intelligence fallback", () => {
  it("uses only configured seller facts and keeps a limited profile discovery-led", () => {
    const ready = sellerIntelligenceProfile({
      sellerIntelligenceProfile: {
        status: "ready",
        websiteAnalysisStatus: "ready",
        sellerCompanyName: "Northstar Graphics",
        sellerServices: ["fleet lettering"],
        sellerProducts: [],
        sellerCapabilities: ["on-site installation"],
        sellerDifferentiators: ["certified installers"],
        sellerCertifications: [],
        sellerIndustriesServed: [],
        sellerBusinessOutcomes: ["consistent field branding"],
        sellerProblemsSolved: [],
        sellerProofPoints: ["50 local projects"],
        sellerPortfolioExamples: [],
        sellerValuePropositions: [],
        sellerCTAs: ["compare your current vehicle graphics"],
      },
    } as any);
    expect(ready.ready).toBe(true);
    expect(ready.name).toBe("Northstar Graphics");
    expect(genericOutreach({ sellerIntelligenceProfile: { sellerCompanyName: "Northstar Graphics" } } as any, "HVAC", "fleet_wraps"))
      .toMatch(/seller-specific capabilities are unavailable/i);
  });

  it("uses priority services to rank approved offers without turning them into seller facts", () => {
    const user = {
      sellerServicePriorities: "fleet lettering",
      sellerIntelligenceProfile: {
        status: "ready",
        websiteAnalysisStatus: "ready",
        sellerCompanyName: "Northstar Graphics",
        sellerServices: ["fleet lettering"],
        sellerProducts: [],
        sellerCapabilities: ["on-site installation"],
        sellerDifferentiators: [],
        sellerCertifications: [],
        sellerIndustriesServed: [],
        sellerBusinessOutcomes: ["consistent field branding"],
        sellerProblemsSolved: [],
        sellerProofPoints: [],
        sellerPortfolioExamples: [],
        sellerValuePropositions: [],
        sellerTypicalCustomers: [],
        sellerCTAs: [],
      },
    } as any;
    expect(genericOutreach(user, "HVAC", "fleet_wraps")).toContain("fleet lettering");

    const limitedContext = sellerContext({
      sellerServicePriorities: "unsupported priority",
      sellerIntelligenceProfile: null,
    } as any, "HVAC", "fleet_wraps");
    expect(limitedContext).toContain("discovery strategy only");
    expect(limitedContext).toContain("Do not invent");
  });
});

import {
  placeToLeadBase,
  addFleetOverlay,
  websiteDomain,
  searchRealBusinesses,
  ProspectSearchError,
  type PlaceResult,
} from "./ai";
import aiRouter from "./ai";
import { db } from "@workspace/db";
import { researchItOpportunityIntelligence } from "../lib/itOpportunityResearch";
import { requiresRecruitingResearch } from "../lib/recruitingFilters";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PLACE: PlaceResult = {
  displayName: { text: "Riverside Medical Center" },
  formattedAddress: "123 Main St, Chicago, IL 60601",
  nationalPhoneNumber: "(312) 555-0100",
  websiteUri: "https://www.riversidemedical.com",
  businessStatus: "OPERATIONAL",
};
const PLACE_NO_WEB: PlaceResult = { ...PLACE, websiteUri: undefined };
const PLACE_NO_PHONE: PlaceResult = { ...PLACE, nationalPhoneNumber: undefined, internationalPhoneNumber: undefined };

const ENV_KEY = "GOOGLE_MAPS_API_KEY";
let savedKey: string | undefined;

beforeEach(() => { savedKey = process.env[ENV_KEY]; delete process.env[ENV_KEY]; });
afterEach(() => {
  if (savedKey !== undefined) process.env[ENV_KEY] = savedKey; else delete process.env[ENV_KEY];
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── websiteDomain ────────────────────────────────────────────────────────────
describe("websiteDomain", () => {
  it("strips www prefix", () => expect(websiteDomain("https://www.example.com")).toBe("example.com"));
  it("keeps non-www domains", () => expect(websiteDomain("https://acme.io/path")).toBe("acme.io"));
  it("returns undefined for undefined input", () => expect(websiteDomain(undefined)).toBeUndefined());
  it("returns undefined for malformed URL", () => expect(websiteDomain("not-a-url")).toBeUndefined());
});

// ─── placeToLeadBase ──────────────────────────────────────────────────────────
describe("placeToLeadBase", () => {
  it("maps all basic fields from a full Place result", () => {
    const lead = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.companyName).toBe("Riverside Medical Center");
    expect(lead.phone).toBe("(312) 555-0100");
    expect(lead.website).toBe("riversidemedical.com");
    expect(lead.address).toBe("123 Main St, Chicago, IL 60601");
    expect(lead.email).toMatch(/\.invalid$/); // always a non-deliverable placeholder
    expect(lead.city).toBe("Chicago");
    expect(lead.state).toBe("IL");
    expect(lead.contactName).toBe("Owner");
    expect(lead.vertical).toBe("janitorial");
  });

  it("rates confidence 'high' when both phone and website are present", () => {
    const lead = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.confidence).toBe("high");
  });

  it("rates confidence 'medium' when only phone is present", () => {
    const lead = placeToLeadBase(PLACE_NO_WEB, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.confidence).toBe("medium");
  });

  it("rates confidence 'low' when neither phone nor website is present", () => {
    const noContact = { ...PLACE_NO_WEB, nationalPhoneNumber: undefined, internationalPhoneNumber: undefined };
    const lead = placeToLeadBase(noContact, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.confidence).toBe("low");
  });

  it("always uses .invalid placeholder email — even when website is present", () => {
    // The website domain must NOT be used to guess info@domain, as that could
    // dispatch real outreach to an unverified recipient.
    const lead = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.email).toMatch(/\.invalid$/);
  });

  it("uses .invalid TLD placeholder email when no website is present", () => {
    const lead = placeToLeadBase(PLACE_NO_WEB, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.email).toMatch(/\.invalid$/);
  });

  it("falls back to internationalPhoneNumber when nationalPhoneNumber is absent", () => {
    const intl = { ...PLACE, nationalPhoneNumber: undefined, internationalPhoneNumber: "+1 312-555-0100" };
    const lead = placeToLeadBase(intl, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.phone).toBe("+1 312-555-0100");
  });

  it("uses 'Unknown business' for a place with no displayName", () => {
    const noName: PlaceResult = { ...PLACE, displayName: undefined };
    const lead = placeToLeadBase(noName, "Chicago", "IL", "Healthcare", "janitorial");
    expect(lead.companyName).toBe("Unknown business");
  });

  it("falls back to 'Local business' industry label when industry is 'All Industries'", () => {
    const lead = placeToLeadBase(PLACE, "Chicago", "IL", "All Industries", "janitorial");
    expect(lead.industry).toBe("Local business");
  });
});

describe("addFleetOverlay", () => {
  it("adds the complete fleet-wrap result intelligence without claiming an unverified fleet size", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "HVAC", "fleet_wraps");
    const lead = addFleetOverlay(base, "HVAC");

    expect(lead.vertical).toBe("fleet_wraps");
    expect(lead.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(lead.opportunityScore).toBeLessThanOrEqual(100);
    expect(lead.potentialNeeds.length).toBeGreaterThan(0);
    expect(lead.fleetBrandingSignal).toMatch(/Unverified:/i);
    expect(lead.whyTarget).toMatch(/Seller capabilities have not been configured/i);
    expect(lead.potentialNeeds.join(" ")).not.toMatch(/C4|wraps/i);
    expect(lead.recommendedOutreach).toMatch(/seller-specific capabilities are unavailable/i);
    expect(lead.scoreExplanation).toMatch(/not assumed/i);
  });

  it("uses verified public signals and explicitly labels unknown fleet evidence", () => {
    const base = placeToLeadBase(PLACE_NO_WEB, "Chicago", "IL", "Unknown Industry", "fleet_wraps");
    const lead = addFleetOverlay(base, "Unknown Industry");

    expect(lead.fleetBrandingSignal).toContain("published business phone number");
    expect(lead.fleetBrandingSignal).toContain("Verified:");
    expect(lead.fleetBrandingSignal).toContain("Industry Fit:");
    expect(lead.fleetBrandingSignal).toContain("Unverified:");
    expect(lead.whyTarget).toContain("Riverside Medical Center");
    expect(lead.whyTarget).toContain("Chicago, IL");
  });

  it("uses the generic industry fallback without inventing seller capabilities", () => {
    const hvac = addFleetOverlay(placeToLeadBase(PLACE, "Dallas", "TX", "HVAC", "fleet_wraps"), "HVAC");
    const roofing = addFleetOverlay(placeToLeadBase(PLACE, "Dallas", "TX", "Roofing", "fleet_wraps"), "Roofing");

    expect(hvac.potentialNeeds.join(" ")).not.toMatch(/C4|wrap/i);
    expect(roofing.potentialNeeds.join(" ")).not.toMatch(/C4|wrap/i);
    expect(hvac.whyTarget).toMatch(/unverified/i);
  });

  it("uses discovery language instead of inventing fleet facts for a generic business", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Commercial", "fleet_wraps");
    const lead = addFleetOverlay(base, "Commercial");

    expect(lead.whyTarget).toMatch(/unverified/i);
    expect(lead.recommendedOutreach).toMatch(/discovery/i);
    const verifiedSection = lead.fleetBrandingSignal.split("Industry Fit:")[0];
    expect(verifiedSection).not.toMatch(/fleet size/i);
  });
});

// ─── searchRealBusinesses ─────────────────────────────────────────────────────
describe("searchRealBusinesses", () => {
  it("retrieves 100 unique businesses across five pages with the required token and field mask", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { textQuery: string; pageSize: number; pageToken?: string };
      const page = request.pageToken ? Number(request.pageToken.replace("page-", "")) : 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          places: Array.from({ length: 20 }, (_, index) => ({
            ...PLACE,
            id: `place-${page}-${index}`,
            displayName: { text: `Business ${page}-${index}` },
          })),
          ...(page < 5 ? { nextPageToken: `page-${page + 1}` } : {}),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 100);

    expect(results).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [index, call] of fetchMock.mock.calls.entries()) {
      const init = call[1] as RequestInit;
      const body = JSON.parse(String(init.body));
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
        "X-Goog-Api-Key": "key",
      });
      expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("places.id");
      expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("nextPageToken");
      expect(body).toEqual({
        textQuery: "Healthcare businesses in Chicago, IL",
        pageSize: 20,
        ...(index ? { pageToken: `page-${index + 1}` } : {}),
      });
    }
  });

  it("deduplicates by place id and fallback name/address while excluding closed businesses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          { ...PLACE, id: "same-id" },
          { ...PLACE, id: "same-id", displayName: { text: "Duplicate by id" } },
          { ...PLACE, id: undefined },
          { ...PLACE, id: undefined, displayName: { text: "  RIVERSIDE   MEDICAL CENTER " }, formattedAddress: " 123 MAIN ST, CHICAGO, IL 60601 " },
          { ...PLACE, id: "closed", businessStatus: "CLOSED_PERMANENTLY" },
        ],
      }),
    }));

    const results = await searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 10);

    expect(results).toHaveLength(2);
    expect(results.every(place => place.businessStatus === "OPERATIONAL")).toBe(true);
  });

  it("stops when there is no next-page token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ places: [{ ...PLACE, id: "only" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 100))
      .resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops on a repeated next-page token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ places: [{ ...PLACE, id: "one" }], nextPageToken: "repeat" }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ places: [{ ...PLACE, id: "two" }], nextPageToken: "repeat" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 100))
      .resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails the complete search when a later page fails instead of returning partial results", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ places: [{ ...PLACE, id: "one" }], nextPageToken: "next" }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 500,
        json: async () => ({ error: { message: "Provider failed" } }),
      }));

    await expect(searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 100))
      .rejects.toMatchObject({
        status: 502,
        message: expect.stringMatching(/page 2.*no partial results/i),
      });
  });

  it("returns filtered operational places on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          PLACE,
          { ...PLACE, displayName: { text: "Closed Clinic" }, businessStatus: "CLOSED_PERMANENTLY" },
        ],
      }),
    }));
    const results = await searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 5);
    expect(results).toHaveLength(1);
    expect(results[0].displayName?.text).toBe("Riverside Medical Center");
  });

  it("returns empty array when places key is absent in response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({}),
    }));
    const results = await searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 5);
    expect(results).toEqual([]);
  });

  it("throws ProspectSearchError 401 for invalid-key 400 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: { message: "API key not valid. Please pass a valid API key." } }),
    }));
    await expect(searchRealBusinesses("bad-key", "Chicago", "IL", "Healthcare", 5))
      .rejects.toBeInstanceOf(ProspectSearchError);
    await expect(searchRealBusinesses("bad-key", "Chicago", "IL", "Healthcare", 5))
      .rejects.toMatchObject({ status: 401 });
  });

  it("throws ProspectSearchError 403 for permission-denied response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: async () => ({ error: { message: "Places API not enabled" } }),
    }));
    await expect(searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 5))
      .rejects.toMatchObject({ status: 403 });
  });

  it("throws ProspectSearchError 429 for quota exceeded response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { message: "Quota exceeded" } }),
    }));
    await expect(searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 5))
      .rejects.toMatchObject({ status: 429 });
  });

  it("throws ProspectSearchError 502 for unexpected server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ error: { message: "Internal error" } }),
    }));
    await expect(searchRealBusinesses("key", "Chicago", "IL", "Healthcare", 5))
      .rejects.toMatchObject({ status: 502 });
  });
});

describe("prospect-search request validation", () => {
  it.each([0, 101, 1.5])("returns 400 for invalid count %s before querying the database", async (count) => {
    const routeLayer = (aiRouter as any).stack.find((layer: any) => layer.route?.path === "/prospect-search");
    const handler = routeLayer.route.stack.at(-1).handle;
    const req = {
      body: { city: "Chicago", state: "IL", industry: "Healthcare", count },
      clientId: "client-1",
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Prospect search request is invalid. Count must be a whole number from 1 to 100.",
    });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("recruiting search research failures", () => {
  async function search(filters: Record<string, unknown>, places = [PLACE]) {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: async () => [{ id: "client-1", vertical: "recruiting_staffing" }] }),
    } as any);
    vi.mocked(researchItOpportunityIntelligence).mockRejectedValue(new Error("Research provider timed out"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ places }),
    }));
    const handler = (aiRouter as any).stack.find((layer: any) =>
      layer.route?.path === "/prospect-search").route.stack.at(-1).handle;
    const req = {
      body: { city: "Houston", state: "TX", industry: "Healthcare", count: 5, recruitingFilters: filters },
      clientId: "client-1",
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await handler(req, res);
    return { req, res };
  }
  it("returns discovered employers with a research warning for broad searches", async () => {
    const { res, req } = await search({ industries: ["Healthcare"], serviceMatchOnly: false });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({
      companyName: PLACE.displayName?.text,
      researchError: "Research provider timed out",
      opportunityScore: 0,
      scoreLabel: "Research unavailable",
    })]);
    expect(req.log.info).toHaveBeenCalledWith(expect.objectContaining({
      discovered: 1, returned: 1, researchFailures: 1,
    }), "Prospect search completed");
  });
  it("reports research failure instead of pretending strict filters found no employers", async () => {
    const { res } = await search({ industries: ["Healthcare"], serviceMatchOnly: false, jobTitles: "Nurse" });
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/Found 1 employers, but research failed for 1/) });
  });
  it("keeps a genuine empty business lookup distinct from research failure", async () => {
    const { res } = await search({ industries: ["Healthcare"], serviceMatchOnly: false }, []);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith([]);
  });
  it("does not mistake industries, radius, or disabled/default controls for evidence requirements", () => {
    expect(requiresRecruitingResearch({ industries: ["Healthcare"], radiusMiles: 25, serviceMatchOnly: false, confidence: "any", signalType: "any", minRelevantJobs: 0 })).toBe(false);
    expect(requiresRecruitingResearch({ serviceMatchOnly: true })).toBe(true);
    expect(requiresRecruitingResearch({ minRelevantJobs: 1 })).toBe(true);
    expect(requiresRecruitingResearch({ recencyDays: 30 })).toBe(true);
    expect(requiresRecruitingResearch({ confidence: "high" })).toBe(true);
    expect(requiresRecruitingResearch({ signalType: "expansion" })).toBe(true);
  });
});

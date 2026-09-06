/**
 * Tests for prospect-search: Google Places integration, result mapping,
 * IT-services scoring overlay, and missing/invalid key error handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { genericOutreach, sellerIntelligenceProfile } from "../lib/prospectMatching";

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
  getVerticalConfig: (v: string | undefined) => ({ key: v === "it_services" || v === "fleet_wraps" ? v : "janitorial" }),
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
});

import {
  placeToLeadBase,
  addItOverlay,
  addFleetOverlay,
  websiteDomain,
  searchRealBusinesses,
  ProspectSearchError,
  type PlaceResult,
} from "./ai";

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

// ─── addItOverlay ─────────────────────────────────────────────────────────────
describe("addItOverlay", () => {
  it("adds opportunityScore (0–100) and scoreLabel", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "it_services");
    const lead = addItOverlay(base, "Healthcare");
    expect(lead.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(lead.opportunityScore).toBeLessThanOrEqual(100);
    expect(["High Priority","Strong Fit","Possible Fit","Low Priority"]).toContain(lead.scoreLabel);
  });

  it("adds non-empty potentialNeeds array", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "it_services");
    const lead = addItOverlay(base, "Healthcare");
    expect(Array.isArray(lead.potentialNeeds)).toBe(true);
    expect(lead.potentialNeeds!.length).toBeGreaterThan(0);
  });

  it("adds complianceConsideration mentioning HIPAA for Healthcare", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "it_services");
    const lead = addItOverlay(base, "Healthcare");
    expect(lead.complianceConsideration).toMatch(/HIPAA/i);
  });

  it("adds recommendedOutreach string", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "it_services");
    const lead = addItOverlay(base, "Healthcare");
    expect(typeof lead.recommendedOutreach).toBe("string");
    expect(lead.recommendedOutreach!.length).toBeGreaterThan(0);
  });

  it("sets vertical to 'it_services'", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Healthcare", "it_services");
    const lead = addItOverlay(base, "Healthcare");
    expect(lead.vertical).toBe("it_services");
  });

  it("produces stable (deterministic) scores for the same company name", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Retail", "it_services");
    const a = addItOverlay(base, "Retail");
    const b = addItOverlay(base, "Retail");
    expect(a.opportunityScore).toBe(b.opportunityScore);
    expect(a.scoreLabel).toBe(b.scoreLabel);
  });

  it("falls back gracefully for unknown industry", () => {
    const base = placeToLeadBase(PLACE, "Chicago", "IL", "Unknown", "it_services");
    const lead = addItOverlay(base, "Unknown");
    expect(lead.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(lead.potentialNeeds)).toBe(true);
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

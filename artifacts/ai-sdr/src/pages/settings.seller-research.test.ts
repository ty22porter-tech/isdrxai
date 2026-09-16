import { describe, expect, it } from "vitest";
import { sellerResearchTimestamps } from "@/components/company-intelligence-editor";
import { buildWebsiteSettingsUpdate, hasCurrentSellerResearch } from "./settings";

describe("seller research provenance", () => {
  it("does not present a legacy ready profile as current", () => {
    expect(hasCurrentSellerResearch(
      { status: "ready", sellerCompanyName: "Northstar Graphics", sellerIndustry: "fleet_wraps" },
      "Northstar Graphics",
      "fleet_wraps",
    )).toBe(false);
  });

  it("requires matching identity and research metadata before showing ready", () => {
    const profile = {
      researchVersion: "2025-01",
      researchStatus: "ready",
      researchIdentity: { companyName: "Northstar Graphics", vertical: "fleet_wraps" },
    };
    expect(hasCurrentSellerResearch(profile, "Northstar Graphics", "fleet_wraps")).toBe(true);
    expect(hasCurrentSellerResearch(profile, "Other Company", "fleet_wraps")).toBe(false);
  });

  it("sends an explicit blank website when clearing a previously saved value", () => {
    expect(buildWebsiteSettingsUpdate("   ")).toEqual({ website: "" });
    expect(buildWebsiteSettingsUpdate(" https://example.com ")).toEqual({ website: "https://example.com" });
  });

  it("uses successful evidence time for last researched and keeps failed attempts separate", () => {
    expect(sellerResearchTimestamps({
      researchStatus: "failed",
      researchedGenerated: "2025-01-03T00:00:00.000Z",
      researchLastAnalyzed: "2025-01-03T00:00:00.000Z",
      lastAnalysisAttemptAt: "2025-01-03T00:00:00.000Z",
    })).toEqual({
      lastResearched: undefined,
      lastAttempt: "2025-01-03T00:00:00.000Z",
    });
    expect(sellerResearchTimestamps({
      researchStatus: "ready",
      researchedGenerated: "2025-01-02T00:00:00.000Z",
      researchLastAnalyzed: "2025-01-01T00:00:00.000Z",
      lastAnalysisAttemptAt: "2025-01-03T00:00:00.000Z",
    })).toEqual({
      lastResearched: "2025-01-01T00:00:00.000Z",
      lastAttempt: "2025-01-03T00:00:00.000Z",
    });
  });
});
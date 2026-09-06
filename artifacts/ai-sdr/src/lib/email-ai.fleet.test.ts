import { describe, expect, it } from "vitest";
import { generateFollowUpEmail, generateIntroEmail } from "./email-ai";

describe("dynamic Fleet email fallback", () => {
  it("uses discovery language when seller intelligence is unavailable", () => {
    const result = generateIntroEmail({
      contactName: "Sam",
      companyName: "Rescue Air",
      industry: "HVAC",
      city: "Dallas",
    }, "fleet_wraps");

    expect(result.body).toMatch(/service vehicles/i);
    expect(result.body).toMatch(/Seller-specific capabilities are not available/i);
    expect(result.body).not.toMatch(/\bI noticed\b|\bI came across\b|\bI wanted to reach out\b|I hope this email finds you well/i);
    expect(result.body).not.toMatch(/\b\d+\s+(vehicles|vans|trucks)\b/i);
  });

  it("changes the generic business context by prospect industry", () => {
    const hvac = generateIntroEmail({ companyName: "Air Co", industry: "HVAC", city: "Dallas" }, "fleet_wraps");
    const roofing = generateIntroEmail({ companyName: "Roof Co", industry: "Roofing", city: "Dallas" }, "fleet_wraps");

    expect(roofing.body).toMatch(/job site|neighborhood/i);
    expect(roofing.body).not.toBe(hvac.body);
  });

  it("uses exact configured seller capabilities in Fleet follow-ups", () => {
    const result = generateFollowUpEmail({
      contactName: "Jordan",
      companyName: "Route Co",
      industry: "Delivery & Logistics",
      city: "Fort Worth",
    }, "fleet_wraps", {
      status: "ready",
      websiteAnalysisStatus: "ready",
      sellerCompanyName: "Example Graphics",
      sellerCapabilities: ["multi-vehicle graphics programs"],
      sellerBusinessOutcomes: ["consistent field branding"],
    });

    expect(result.body).toContain("Example Graphics");
    expect(result.body).toContain("multi-vehicle graphics programs");
    expect(result.body).toMatch(/logistics|multi-vehicle|operating vehicles|vehicle branding/i);
    expect(result.body).not.toMatch(/^I wanted to follow up/im);
  });
});
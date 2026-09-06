import { describe, expect, it } from "vitest";
import { generateFollowUpEmail, generateIntroEmail } from "./email-ai";

describe("C4 Wraps Fleet email fallback", () => {
  it("matches an HVAC prospect to C4 capabilities without a generic opener", () => {
    const result = generateIntroEmail({
      contactName: "Sam",
      companyName: "Rescue Air",
      industry: "HVAC",
      city: "Dallas",
    }, "fleet_wraps");

    expect(result.body).toContain("C4 Wraps");
    expect(result.body).toMatch(/service vehicles/i);
    expect(result.body).toMatch(/in-house design|commercial service-vehicle wraps/i);
    expect(result.body).not.toMatch(/\bI noticed\b|\bI came across\b|\bI wanted to reach out\b|I hope this email finds you well/i);
    expect(result.body).not.toMatch(/\b\d+\s+(vehicles|vans|trucks)\b/i);
  });

  it("changes the business value and C4 solution for roofing", () => {
    const hvac = generateIntroEmail({ companyName: "Air Co", industry: "HVAC", city: "Dallas" }, "fleet_wraps");
    const roofing = generateIntroEmail({ companyName: "Roof Co", industry: "Roofing", city: "Dallas" }, "fleet_wraps");

    expect(roofing.body).toMatch(/job site|neighborhood/i);
    expect(roofing.body).toMatch(/truck wraps|trailer graphics/i);
    expect(roofing.body).not.toBe(hvac.body);
  });

  it("keeps Fleet follow-ups C4-specific and discovery-led", () => {
    const result = generateFollowUpEmail({
      contactName: "Jordan",
      companyName: "Route Co",
      industry: "Delivery & Logistics",
      city: "Fort Worth",
    }, "fleet_wraps");

    expect(result.body).toContain("C4 Wraps");
    expect(result.body).toMatch(/logistics|multi-vehicle|operating vehicles/i);
    expect(result.body).toMatch(/how Route Co currently handles vehicle branding/i);
    expect(result.body).not.toMatch(/^I wanted to follow up/im);
  });
});
import { describe, expect, it } from "vitest";
import { hasSellerProfileForProspecting } from "./prospecting";

describe("prospecting seller profile gate", () => {
  it("requires seller company name and seller vertical", () => {
    expect(hasSellerProfileForProspecting({ businessName: "Northstar Graphics", vertical: "fleet_wraps" })).toBe(true);
    expect(hasSellerProfileForProspecting({ businessName: "Northstar Graphics", vertical: "" })).toBe(false);
    expect(hasSellerProfileForProspecting({ businessName: "  ", vertical: "janitorial" })).toBe(false);
  });

  it("does not require a website", () => {
    expect(hasSellerProfileForProspecting({ businessName: "Northstar Graphics", vertical: "fleet_wraps" })).toBe(true);
    expect(hasSellerProfileForProspecting({ businessName: "Northstar Graphics", vertical: "fleet_wraps", website: "" } as any)).toBe(true);
  });
});
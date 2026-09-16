import { describe, expect, it } from "vitest";
import { supportsOpportunityRefresh } from "./prospect-detail";

describe("prospect opportunity intelligence refresh", () => {
  it("allows existing prospects for every supported seller vertical to refresh", () => {
    expect(supportsOpportunityRefresh("it_services")).toBe(true);
    expect(supportsOpportunityRefresh("janitorial")).toBe(true);
    expect(supportsOpportunityRefresh("fleet_wraps")).toBe(true);
    expect(supportsOpportunityRefresh("")).toBe(false);
    expect(supportsOpportunityRefresh("unsupported")).toBe(false);
  });
});
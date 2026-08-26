import { describe, expect, it } from "vitest";
import { matchesEngagementSearch } from "./engagementSearch";

const prospect = ["Cobalt Product Solutions", "Taylor Brooks", "taylor@cobalt.example"];

describe("matchesEngagementSearch", () => {
  it("keeps plain searches case-insensitive and substring based", () => {
    expect(matchesEngagementSearch(prospect, "product")).toBe(true);
    expect(matchesEngagementSearch(prospect, "TAYLOR@")).toBe(true);
    expect(matchesEngagementSearch(prospect, "missing")).toBe(false);
  });

  it("treats a lone percent sign and blank input as match all", () => {
    expect(matchesEngagementSearch(prospect, "%")).toBe(true);
    expect(matchesEngagementSearch(prospect, "  %  ")).toBe(true);
    expect(matchesEngagementSearch(prospect, "")).toBe(true);
  });

  it("supports percent signs as safe multi-character wildcards", () => {
    expect(matchesEngagementSearch(prospect, "Cobalt%")).toBe(true);
    expect(matchesEngagementSearch(prospect, "%Solutions")).toBe(true);
    expect(matchesEngagementSearch(prospect, "t%r@cobalt.example")).toBe(true);
    expect(matchesEngagementSearch(prospect, "Cobalt%Logitech")).toBe(false);
  });

  it("treats regex characters as literal text", () => {
    expect(matchesEngagementSearch(["ACME [North]"], "%[North]")).toBe(true);
    expect(matchesEngagementSearch(["ACME North"], "%[North]")).toBe(false);
  });
});
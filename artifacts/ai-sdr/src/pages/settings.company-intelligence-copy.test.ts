import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync("src/pages/settings.tsx", "utf8");

describe("Settings seller research experience", () => {
  it("makes seller identity required and keeps website optional", () => {
    expect(settingsSource).toContain("Seller Company Name");
    expect(settingsSource).toContain("SELLER COMPANY NAME REQUIRED");
    expect(settingsSource).toContain("Required to identify your seller business and start public research.");
    expect(settingsSource).toContain("Company Website");
    expect(settingsSource).toContain("(optional)");
    expect(settingsSource).toContain("it does not determine seller research");
    expect(settingsSource).not.toContain("COMPANY WEBSITE REQUIRED");
    expect(settingsSource).not.toContain("website intelligence is the foundation");
  });

  it("keeps manual guidance optional and frames refresh as seller research maintenance", () => {
    expect(settingsSource).toContain("OPTIONAL AI EMPLOYEE INSTRUCTIONS");
    expect(settingsSource).toContain("Public seller research already identifies your company.");
    expect(settingsSource).toContain("Anything you want your AI employee to know?");
    expect(settingsSource).toContain("Services you want your AI employee to prioritize");
    expect(settingsSource).toContain("this is your approved ICP solution catalog");
    expect(settingsSource).toContain("prospect's website-backed business challenge");
    expect(settingsSource).toContain("For Fleet & Vehicle Wraps, this is your approved solution catalog");
    expect(settingsSource).toContain("prospect's documented business operation or verified company event");
    expect(settingsSource).toContain("your individual client profile");
    expect(settingsSource).toContain("Refresh Seller Research");
    expect(settingsSource).not.toContain("Reanalyze Website");
  });

  it("does not trigger a second reanalysis after the settings save succeeds", () => {
    const refreshEndpointUses = settingsSource.match(/\/users\/company-intelligence\/refresh/g) ?? [];
    expect(refreshEndpointUses).toHaveLength(1);
    expect(settingsSource).toContain("sellerIntelligenceUpdateFailed");
  });
});
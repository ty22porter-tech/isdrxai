import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync("src/pages/settings.tsx", "utf8");

describe("Settings Company Intelligence experience", () => {
  it("presents the website as the required intelligence foundation", () => {
    expect(settingsSource).toContain("Company Website");
    expect(settingsSource).toContain("COMPANY WEBSITE REQUIRED");
    expect(settingsSource).toContain("iSDRX AI uses your website to learn what your company sells");
    expect(settingsSource).not.toContain("Company Website <span className=\"text-xs text-muted-foreground font-normal\">(optional)");
  });

  it("keeps manual guidance optional and frames reanalysis as maintenance", () => {
    expect(settingsSource).toContain("OPTIONAL AI EMPLOYEE INSTRUCTIONS");
    expect(settingsSource).toContain("Your AI employee already learns your company from your website. Add information below only if you want to give it additional guidance.");
    expect(settingsSource).toContain("Anything you want your AI employee to know?");
    expect(settingsSource).toContain("Services you want your AI employee to prioritize");
    expect(settingsSource).toContain("this is your approved ICP solution catalog");
    expect(settingsSource).toContain("prospect's website-backed business challenge");
    expect(settingsSource).toContain("For Fleet & Vehicle Wraps, this is your approved solution catalog");
    expect(settingsSource).toContain("prospect's documented business operation or verified company event");
    expect(settingsSource).toContain("your individual client profile");
    expect(settingsSource).toContain("Reanalyze Website");
    expect(settingsSource).not.toContain("Refresh Company Intelligence");
  });

  it("does not trigger a second reanalysis after the settings save succeeds", () => {
    const refreshEndpointUses = settingsSource.match(/\/users\/company-intelligence\/refresh/g) ?? [];
    expect(refreshEndpointUses).toHaveLength(1);
    expect(settingsSource).toContain("sellerIntelligenceUpdateFailed");
  });
});
import { describe, expect, it } from "vitest";
import type { SellerIntelligenceProfile } from "@workspace/db";
import { archiveSellerProfile, preferencesForIndustrySwitch } from "./sellerIndustryPreferences";

const recruiting = { sellerServicePriorities: "Engineering direct-hire recruiting", sellerDifferentiatorsInput: "Manufacturing recruiting specialists" };
const itPreferences = { sellerServicePriorities: "Managed IT services", sellerDifferentiatorsInput: "Helpdesk support" };
const profile = { status: "ready", sellerServices: ["Managed IT services"] } as SellerIntelligenceProfile;

describe("industry-specific seller preferences", () => {
  it("clears old-industry preferences when the target industry has no saved preferences", () => {
    expect(preferencesForIndustrySwitch(recruiting, recruiting, null)).toEqual({
      sellerServicePriorities: null, sellerDifferentiatorsInput: null,
    });
    expect(preferencesForIndustrySwitch(recruiting, {}, undefined).sellerServicePriorities).toBeNull();
  });
  it("restores the target industry's saved preferences instead of the form's stale old values", () => {
    const archived = archiveSellerProfile(profile, itPreferences);
    expect(preferencesForIndustrySwitch(recruiting, recruiting, archived)).toEqual(itPreferences);
    expect(preferencesForIndustrySwitch(recruiting, {}, archived)).toEqual(itPreferences);
  });
  it("honors an explicit new preference entered while switching industries", () => {
    const archived = archiveSellerProfile(profile, itPreferences);
    expect(preferencesForIndustrySwitch(recruiting, { sellerServicePriorities: "Cybersecurity assessments" }, archived))
      .toEqual({ ...itPreferences, sellerServicePriorities: "Cybersecurity assessments" });
  });
  it("does not confuse whitespace changes with an approval to carry another industry's catalog", () => {
    expect(preferencesForIndustrySwitch(recruiting, {
      sellerServicePriorities: ` ${recruiting.sellerServicePriorities} `,
    }, null).sellerServicePriorities).toBeNull();
  });
  it("archives a copy without changing current profile facts or fabricating a missing profile", () => {
    const archived = archiveSellerProfile(profile, itPreferences);
    expect(archived?.industryPreferences).toEqual(itPreferences);
    expect(profile).not.toHaveProperty("industryPreferences");
    expect(archiveSellerProfile(null, recruiting)).toBeNull();
  });
});

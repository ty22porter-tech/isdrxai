import type { ArchivedSellerProfile, SellerIndustryPreferences, SellerIntelligenceProfile } from "@workspace/db";

/** Settings submits the whole form: unchanged old-industry text is not a new
 * approval to use those claims in a different industry's solution catalog. */
export function preferencesForIndustrySwitch(
  current: SellerIndustryPreferences,
  submitted: Partial<SellerIndustryPreferences>,
  archived: ArchivedSellerProfile | null | undefined,
): SellerIndustryPreferences {
  const value = (key: keyof SellerIndustryPreferences) => {
    const incoming = submitted[key];
    const normalized = (input: string | null | undefined) => input?.trim() || null;
    return incoming === undefined || normalized(incoming) === normalized(current[key])
      ? archived?.industryPreferences?.[key] ?? null
      : incoming;
  };
  return {
    sellerServicePriorities: value("sellerServicePriorities"),
    sellerDifferentiatorsInput: value("sellerDifferentiatorsInput"),
  };
}

export function archiveSellerProfile(
  profile: SellerIntelligenceProfile | null,
  preferences: SellerIndustryPreferences,
): ArchivedSellerProfile | null {
  return profile ? { ...profile, industryPreferences: {
    sellerServicePriorities: preferences.sellerServicePriorities,
    sellerDifferentiatorsInput: preferences.sellerDifferentiatorsInput,
  } } : null;
}

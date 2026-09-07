import type {
  OpportunityIntelligence,
  OpportunityScoreCategory,
  OpportunitySignal,
} from "@workspace/db";
import type { usersTable } from "@workspace/db";
import {
  genericOutreach,
  industryMatch,
  potentialNeedsForSeller,
  sellerIntelligenceProfile,
} from "./prospectMatching";
import { researchOfficialWebsite } from "./officialWebsiteResearch";

export const OPPORTUNITY_SCORE_DEFINITION =
  "The Opportunity Score measures how strongly this prospect matches your company, target customer profile, verified signals, and potential business need. It does not represent the probability that the prospect will make a purchase.";

interface OpportunityLead {
  companyName: string;
  contactTitle?: string | null;
  industry: string;
  city: string;
  state: string;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
}

interface PersistedOpportunityInput extends OpportunityLead {
  title?: string | null;
  opportunityIntelligence?: unknown;
}

const scoreLabel = (score: number): OpportunityIntelligence["label"] =>
  score >= 80 ? "High Priority" : score >= 60 ? "Strong Fit" : score >= 40 ? "Possible Fit" : "Low Priority";

const bounded = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

const safeSourceUrl = (website?: string | null) => {
  if (!website) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).toString();
  } catch {
    return undefined;
  }
};

function category(
  key: OpportunityScoreCategory["key"],
  label: string,
  points: number,
  maxPoints: number,
  explanation: string,
  evidence: string[],
): OpportunityScoreCategory {
  return { key, label, points: bounded(points, maxPoints), maxPoints, explanation, evidence };
}

export function buildOpportunityIntelligence(
  lead: OpportunityLead,
  vertical: string,
  client?: typeof usersTable.$inferSelect,
  researchedSignals: OpportunitySignal[] = [],
): OpportunityIntelligence {
  const generatedAt = new Date().toISOString();
  const seller = sellerIntelligenceProfile(client);
  const match = industryMatch(lead.industry, vertical);
  const sellerOffers = [...seller.capabilities, ...seller.services, ...seller.products, ...seller.valuePropositions];
  const sellerCapability = sellerOffers[0];
  const sellerOutcome = seller.outcomes[0] || seller.valuePropositions[0];
  const priorities = (client?.sellerServicePriorities ?? "")
    .split(/[\n,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
  const relevantPriority = priorities.find(priority =>
    sellerOffers.some(offer => offer.toLowerCase().includes(priority.toLowerCase()) || priority.toLowerCase().includes(offer.toLowerCase())),
  );
  const sellerIndustryMatch = seller.industriesServed.some(value =>
    value.toLowerCase().includes(lead.industry.toLowerCase()) || lead.industry.toLowerCase().includes(value.toLowerCase()),
  );
  const decisionMakerKnown = Boolean(
    lead.contactTitle?.trim() &&
    !/pending|unknown|owner$/i.test(lead.contactTitle.trim()),
  );

  const signals: OpportunitySignal[] = [{
    signalType: "business_listing",
    signalTitle: "Business identity returned by Google Places",
    signalDescription: `${lead.companyName} was returned for the selected ${lead.industry} search in ${lead.city}, ${lead.state}.`,
    signalClassification: "verified",
    confidenceLevel: "high",
    freshness: "unknown",
    sourceName: "Google Places",
    dateDiscovered: generatedAt,
    dateVerified: generatedAt,
    supportingEvidence: "Direct business record returned by the Google Places API.",
    points: 0,
  }];
  if (lead.address) {
    signals.push({
      signalType: "operating_address",
      signalTitle: "Published operating address",
      signalDescription: lead.address,
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "unknown",
      sourceName: "Google Places",
      dateDiscovered: generatedAt,
      dateVerified: generatedAt,
      supportingEvidence: "The Google Places record includes this formatted address.",
      points: 0,
    });
  }
  if (lead.website) {
    signals.push({
      signalType: "company_website",
      signalTitle: "Published company website",
      signalDescription: lead.website,
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "unknown",
      sourceName: "Google Places",
      sourceURL: safeSourceUrl(lead.website),
      dateDiscovered: generatedAt,
      dateVerified: generatedAt,
      supportingEvidence: "The Google Places record links to this website.",
      points: 0,
    });
  }
  if (lead.phone) {
    signals.push({
      signalType: "published_phone",
      signalTitle: "Published business phone",
      signalDescription: lead.phone,
      signalClassification: "verified",
      confidenceLevel: "high",
      freshness: "unknown",
      sourceName: "Google Places",
      dateDiscovered: generatedAt,
      dateVerified: generatedAt,
      supportingEvidence: "The Google Places record includes this business phone number.",
      points: 0,
    });
  }
  signals.push({
    signalType: "industry_fit",
    signalTitle: "Potential industry implication",
    signalDescription: match.operation,
    signalClassification: "implication",
    confidenceLevel: "low",
    freshness: "unknown",
    dateDiscovered: generatedAt,
    relatedSellerCapability: sellerCapability,
    potentialBusinessImpact: sellerOutcome || "Discovery may reveal a relevant operational priority.",
    points: 0,
  });

  const rolePatterns: Record<string, RegExp> = {
    fleet_wraps: /\b(?:hvac|field(?: service)?|mobile|maintenance|pest control|restoration|home health|utility|landscap|roof|plumb|electric|install|technician|(?:service|route|delivery|cdl) driver|driver|crew)\b/i,
    janitorial: /\b(?:facility|facilities|property|operations?|plant|warehouse|environmental services|production)\b/i,
    it_services: /\b(?:it manager|information technology|systems? administrator|help desk|cyber|network engineer|cloud engineer|information security|compliance|technology (?:director|manager))\b/i,
  };
  const hiringPattern = rolePatterns[vertical] ?? rolePatterns.janitorial;
  const buyingEvidence: OpportunitySignal[] = [];
  const datedBuyingEvidence: OpportunitySignal[] = [];
  let relevantHiringVerified = false;
  for (const researched of researchedSignals) {
    if (!researched.sourceURL || !researched.supportingEvidence) continue;
    if (researched.signalClassification !== "verified") {
      signals.push({ ...researched, points: 0 });
      continue;
    }
    const isHiring = researched.signalType === "hiring_listing";
    const relevantHiring = isHiring && hiringPattern.test(`${researched.signalTitle} ${researched.signalDescription}`);
    const rawPoints = researched.signalType === "fleet_vehicle_evidence"
      ? (vertical === "fleet_wraps" ? 14 : 2)
      : researched.signalType === "acquisition" || researched.signalType === "rebrand"
        ? 9
        : researched.signalType === "new_location" || researched.signalType === "expansion" || researched.signalType === "company_launch"
          ? 8
          : relevantHiring
            ? 6
            : 0;
    const recencyMultiplier = researched.freshness === "stale"
      ? 0.25
      : researched.freshness === "older"
        ? 0.6
        : researched.freshness === "active"
          ? 0.8
          : 1;
    const confidenceMultiplier = researched.confidenceLevel === "high" ? 1 : researched.confidenceLevel === "medium" ? 0.75 : 0;
    const basePoints = Math.round(rawPoints * recencyMultiplier * confidenceMultiplier);
    const scored = { ...researched, points: basePoints };
    signals.push(scored);
    if (basePoints > 0) {
      buyingEvidence.push(scored);
      if (scored.freshness !== "unknown" && scored.freshness !== "stale") datedBuyingEvidence.push(scored);
    }
    if (relevantHiring) {
      relevantHiringVerified = true;
      const implication = vertical === "fleet_wraps"
        ? "Relevant field-role hiring may increase future mobile workforce capacity and could create vehicle-branding considerations; it does not verify any vehicle purchase or fleet growth."
        : vertical === "it_services"
          ? "Relevant technology hiring may indicate changing support, infrastructure, security, or compliance demands."
          : "Relevant facilities or operations hiring may increase facility traffic or cleaning coordination needs.";
      signals.push({
        signalType: "hiring_implication",
        signalTitle: "Potential implication of relevant hiring",
        signalDescription: implication,
        signalClassification: "implication",
        confidenceLevel: "medium",
        freshness: scored.freshness,
        sourceName: scored.sourceName,
        sourceURL: scored.sourceURL,
        sourceDate: scored.sourceDate,
        dateDiscovered: generatedAt,
        relatedSellerCapability: sellerCapability,
        potentialBusinessImpact: implication,
        points: 0,
      });
    }
  }

  const defaultUnknowns = vertical === "fleet_wraps"
    ? ["Current fleet size", "Vehicle purchase or expansion plans", "Recent acquisition, company launch, or rebrand", "Current vehicle graphics provider"]
    : vertical === "it_services"
      ? ["Current IT provider", "Cybersecurity problems or incidents", "Technology contract timing and budget"]
      : ["Current janitorial provider", "Contract expiration or replacement plans", "Cleaning budget and service gaps"];
  const verifiedTypes = new Set(researchedSignals.filter(signal => signal.signalClassification === "verified").map(signal => signal.signalType));
  const unknowns = defaultUnknowns.filter(title => {
    if (/vehicle purchase|fleet size/i.test(title) && verifiedTypes.has("fleet_vehicle_evidence")) return true;
    if (/expansion/i.test(title) && (verifiedTypes.has("expansion") || verifiedTypes.has("new_location"))) return false;
    if (/acquisition|launch|rebrand/i.test(title) && (verifiedTypes.has("acquisition") || verifiedTypes.has("company_launch") || verifiedTypes.has("rebrand"))) return false;
    return true;
  });
  if (!relevantHiringVerified && !researchedSignals.some(signal => signal.signalType === "hiring_research_status")) {
    unknowns.push("Current relevant hiring activity");
  }
  for (const title of unknowns) {
    signals.push({
      signalType: "unknown",
      signalTitle: title,
      signalDescription: `${title} was not confirmed by the available source data.`,
      signalClassification: "unconfirmed",
      confidenceLevel: "low",
      freshness: "unknown",
      dateDiscovered: generatedAt,
      points: 0,
    });
  }

  const companyFitPoints = 18 + (lead.address ? 4 : 0) + (lead.website ? 3 : 0);
  const sellerMatchPoints = seller.ready
    ? 12 + (sellerIndustryMatch ? 4 : 0) + (relevantPriority ? 3 : 0) + (sellerOutcome ? 1 : 0)
    : 0;
  const businessNeedPoints = 3 + (seller.ready ? 2 : 0);
  const buyingPoints = Math.min(30, buyingEvidence.reduce((sum, signal) => sum + signal.points, 0));
  const freshnessWeight = (value: OpportunitySignal["freshness"]) =>
    value === "recent" ? 10 : value === "active" ? 7 : value === "older" ? 3 : 0;
  const freshnessPoints = Math.min(10, Math.max(0, ...datedBuyingEvidence.map(signal => freshnessWeight(signal.freshness))));
  const effectiveFreshnessPoints = datedBuyingEvidence.length ? freshnessPoints : 0;
  const scoreConfidence: OpportunityIntelligence["scoreConfidence"] =
    buyingPoints >= 18 && datedBuyingEvidence.length >= 2 ? "high" : buyingPoints > 0 ? "medium" : "low";
  const breakdown = [
    category(
      "company_industry_fit",
      "Company / Industry Fit",
      companyFitPoints,
      25,
      "This score reflects the selected target industry and verified public business information. General industry fit is not treated as a company-specific buying event.",
      [
        `${lead.companyName} was returned for the selected ${lead.industry} search.`,
        ...(lead.address ? ["A public operating address is available."] : []),
        ...(lead.website ? ["A public company website is available."] : []),
      ],
    ),
    category(
      "verified_buying_signals",
      "Verified Buying Signals",
      buyingPoints,
      30,
      buyingEvidence.length
        ? "Points are awarded only for sourced, company-specific official evidence; hiring receives points only when the listed role is relevant to this seller vertical."
        : "No relevant hiring, expansion, acquisition, rebrand, vehicle, or other buying event was verified by the official sources inspected.",
      buyingEvidence.length
        ? buyingEvidence.map(signal => `${signal.signalTitle} (+${signal.points})`)
        : ["Business listing details confirm identity and contactability, but they are not buying signals."],
    ),
    category(
      "seller_prospect_match",
      "Seller-to-Prospect Match",
      sellerMatchPoints,
      20,
      seller.ready
        ? "The score uses approved Company Intelligence to measure whether the seller has a plausible capability match. It does not assume the prospect currently needs that service."
        : "Approved Company Intelligence is unavailable, so no seller-specific match points were awarded.",
      seller.ready
        ? [
            `Relevant configured capability: ${sellerCapability}.`,
            ...(relevantPriority ? [`Configured priority service considered: ${relevantPriority}.`] : []),
            ...(sellerIndustryMatch ? [`The seller identifies ${lead.industry} among industries served.`] : []),
          ]
        : ["Complete or approve Company Intelligence to enable seller-specific scoring."],
    ),
    category(
      "decision_maker_match",
      "Decision-Maker Match",
      decisionMakerKnown ? 10 : 0,
      10,
      decisionMakerKnown
        ? "A named, relevant contact was identified."
        : "A relevant decision-maker has not yet been verified.",
      [decisionMakerKnown ? `Contact role: ${lead.contactTitle}.` : "Contact enrichment is pending or did not verify a decision-maker."],
    ),
    category(
      "signal_freshness",
      "Signal Freshness",
      effectiveFreshnessPoints,
      10,
      effectiveFreshnessPoints
        ? "Freshness points reflect the most recent non-stale, dated verified buying evidence."
        : "No current, explicitly dated buying signal was verified. Discovery time alone earns no freshness points.",
      datedBuyingEvidence.length ? datedBuyingEvidence.map(signal => `${signal.signalTitle}: ${signal.freshness}`) : ["No dated buying signal was verified."],
    ),
    category(
      "business_need_potential",
      "Business Need Potential",
      businessNeedPoints,
      5,
      "Industry context creates a reasonable possibility of need, but this remains an implication until discovery or a verified signal confirms it.",
      [
        match.operation,
        ...(sellerCapability ? [`Potential seller connection: ${sellerCapability}.`] : []),
      ],
    ),
  ] satisfies OpportunityScoreCategory[];
  const score = breakdown.reduce((sum, item) => sum + item.points, 0);
  const potentialNeeds = potentialNeedsForSeller(client, lead.industry, vertical)
    .slice(0, 3)
    .map(need => /^(potential|if|confirm|understand|determine|explore)/i.test(need)
      ? need
      : `Potential opportunity: ${need.charAt(0).toLowerCase()}${need.slice(1)}`);
  const verifiedSummary = [
    `${lead.companyName} was returned by Google Places for the selected ${lead.industry} search in ${lead.city}, ${lead.state}`,
    ...(lead.address ? ["a public operating address is listed"] : []),
    ...(lead.website ? ["a public website is listed"] : []),
  ].join("; ");
  const whyTarget = `Verified: ${verifiedSummary}. Potential implication: ${match.operation} ${
    seller.ready && sellerCapability
      ? `${seller.name}'s ${sellerCapability} may be relevant if discovery confirms a matching need.`
      : "No seller-specific need is assumed until Company Intelligence and discovery support it."
  }`;
  const recommendedOutreach = buyingEvidence.length
    ? `Lead with the verified ${buyingEvidence[0].signalTitle.toLowerCase()} and describe only its supported potential implication. ${genericOutreach(client, lead.industry, vertical)}`
    : `No strong company-specific buying signal has been verified. Use discovery-led messaging and do not imply hiring, expansion, fleet growth, purchases, or provider dissatisfaction. ${genericOutreach(client, lead.industry, vertical)}`;

  return {
    version: 1,
    score,
    label: scoreLabel(score),
    scoreConfidence,
    definition: OPPORTUNITY_SCORE_DEFINITION,
    breakdown,
    signals,
    whyTarget,
    potentialNeeds,
    recommendedOutreach,
    generatedAt,
  };
}

export async function deriveOpportunityForPersistence(
  input: PersistedOpportunityInput,
  vertical: string,
  client?: typeof usersTable.$inferSelect,
  priorServerIntelligence?: OpportunityIntelligence | null,
): Promise<OpportunityIntelligence | undefined> {
  if (!input.opportunityIntelligence) return undefined;
  const lead = {
    companyName: input.companyName,
    contactTitle: input.title,
    industry: input.industry,
    city: input.city,
    state: input.state,
    address: input.address,
    website: input.website,
    phone: input.phone,
  };
  const researched = await researchOfficialWebsite(lead);
  // A transient research failure must not erase prior server-verified business
  // events. Hiring is intentionally not retained as active: without a fresh
  // listing it remains unconfirmed and earns no points.
  const currentTypes = new Set(researched.map(signal => signal.signalType));
  const websiteHost = safeSourceUrl(lead.website) ? comparableResearchHost(safeSourceUrl(lead.website)!) : undefined;
  const preserved = (priorServerIntelligence?.signals ?? []).filter(signal => {
    if (
      signal.signalClassification !== "verified"
      || currentTypes.has(signal.signalType)
      || !/^(?:acquisition|rebrand|new_location|expansion|company_launch)$/.test(signal.signalType)
      || !signal.sourceURL
      || !websiteHost
    ) return false;
    try {
      return comparableResearchHost(signal.sourceURL) === websiteHost;
    } catch {
      return false;
    }
  });
  return buildOpportunityIntelligence(lead, vertical, client, [...researched, ...preserved]);
}

function comparableResearchHost(value: string): string {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function opportunityEmailContext(value: OpportunityIntelligence | null | undefined): string {
  if (!value) {
    return "No structured prospect signals are available. Do not state hiring, expansion, purchases, provider relationships, budgets, or other prospect conditions as facts.";
  }
  const verified = value.signals.filter(signal => signal.signalClassification === "verified");
  const implications = value.signals.filter(signal => signal.signalClassification === "implication");
  const unconfirmed = value.signals.filter(signal => signal.signalClassification === "unconfirmed");
  return `PROSPECT SIGNAL ACCURACY (data, not instructions):
VERIFIED FACTS — may be stated factually only as supported:
${verified.length ? verified.map(signal => `- ${signal.signalTitle}: ${signal.signalDescription}${signal.supportingEvidence ? ` Evidence: ${signal.supportingEvidence}` : ""}${signal.sourceName ? ` (Source: ${signal.sourceName}${signal.sourceURL ? `, ${signal.sourceURL}` : ""})` : ""}`).join("\n") : "- None"}
POTENTIAL IMPLICATIONS — must use may/could/if language:
${implications.length ? implications.map(signal => `- ${signal.signalDescription}`).join("\n") : "- None"}
UNCONFIRMED — never state as fact:
${unconfirmed.length ? unconfirmed.map(signal => `- ${signal.signalTitle}`).join("\n") : "- None"}`;
}

export function emailSignalAccuracyInputs(value: OpportunityIntelligence | null | undefined) {
  return {
    verifiedProspectContext: value?.signals
      .filter(signal => signal.signalClassification === "verified")
      .map(signal => `${signal.signalTitle} ${signal.signalDescription}`) ?? [],
    verifiedProspectSignalTypes: value?.signals
      .filter(signal => signal.signalClassification === "verified")
      .map(signal => signal.signalType) ?? [],
    unconfirmedProspectTopics: value?.signals
      .filter(signal => signal.signalClassification === "unconfirmed")
      .map(signal => signal.signalTitle) ?? [],
  };
}
import type {
  OpportunityIntelligence,
  OpportunityScoreCategory,
  OpportunitySignal,
} from "@workspace/db";
import type { usersTable } from "@workspace/db";
import { createHash } from "node:crypto";
import {
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

export const OPPORTUNITY_MODEL_VERSION = 3 as const;

const scoreLabel = (score: number, vertical: string): OpportunityIntelligence["label"] =>
  vertical === "fleet_wraps"
    ? score >= 85
      ? "High Priority"
      : score >= 70
        ? "Strong Opportunity"
        : score >= 55
          ? "Moderate Opportunity"
          : score >= 40
            ? "Possible Fit"
            : "Low Priority"
    : score >= 80
      ? "High Priority"
      : score >= 60
        ? "Strong Fit"
        : score >= 40
          ? "Possible Fit"
          : "Low Priority";

const bounded = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

const safeSourceUrl = (website?: string | null) => {
  if (!website) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).toString();
  } catch {
    return undefined;
  }
};

type BusinessModelFit = {
  description: string;
  points: number;
  strength: "strong" | "possible" | "weak";
  basis: "verified" | "industry_hypothesis";
};

const FLEET_CENTERED_INDUSTRY =
  /\b(?:transport(?:ation)?|bus|motorcoach|shuttle|charter|limousine|limo|chauffeur|taxi|courier|delivery|trucking|logistics|moving|towing|waste|rental car)\b/i;
const FIELD_SERVICE_INDUSTRY =
  /\b(?:hvac|plumb|electric|roof|landscap|pest|restoration|home health|field service|mobile service|maintenance|utility|construction)\b/i;
const FACILITY_CENTERED_INDUSTRY =
  /\b(?:manufactur|warehouse|distribution|healthcare|hospital|clinic|school|education|hotel|hospitality|retail|office|facility|industrial|property management)\b/i;
const TECHNOLOGY_CRITICAL_INDUSTRY =
  /\b(?:healthcare|finance|financial|insurance|legal|manufactur|logistics|technology|software|education|government|professional services)\b/i;

function businessModelFit(
  lead: OpportunityLead,
  vertical: string,
  researchedSignals: OpportunitySignal[],
): BusinessModelFit {
  const verifiedModel = researchedSignals.find(signal =>
    signal.signalClassification === "verified"
    && (signal.signalType === "business_model_evidence" || signal.signalType === "fleet_vehicle_evidence"),
  );

  if (vertical === "fleet_wraps") {
    if (verifiedModel) {
      return {
        description: verifiedModel.signalDescription,
        points: 20,
        strength: "strong",
        basis: "verified",
      };
    }
    if (FLEET_CENTERED_INDUSTRY.test(lead.industry)) {
      return {
        description: `The selected ${lead.industry} category suggests that ${lead.companyName} may rely on commercial vehicles for service delivery and brand visibility, but that operating model has not been verified on an official source.`,
        points: 10,
        strength: "possible",
        basis: "industry_hypothesis",
      };
    }
    if (FIELD_SERVICE_INDUSTRY.test(lead.industry)) {
      return {
        description: `The selected ${lead.industry} category suggests possible use of customer-facing field-service vehicles, but ${lead.companyName}'s vehicle-dependent operations have not been verified.`,
        points: 8,
        strength: "possible",
        basis: "industry_hypothesis",
      };
    }
    return {
      description: `${lead.companyName}'s operating model has not been verified as vehicle-dependent or customer-facing.`,
      points: 3,
      strength: "weak",
      basis: "industry_hypothesis",
    };
  }

  if (vertical === "it_services") {
    const strong = TECHNOLOGY_CRITICAL_INDUSTRY.test(lead.industry);
    return {
      description: `The selected ${lead.industry} category suggests that reliable and secure technology ${strong ? "may be important to core operations" : "could support daily operations"}, but ${lead.companyName}'s current technology priorities have not been verified.`,
      points: strong ? 12 : 7,
      strength: "possible",
      basis: "industry_hypothesis",
    };
  }

  const strong = FACILITY_CENTERED_INDUSTRY.test(lead.industry);
  return {
    description: `The selected ${lead.industry} category suggests that ${strong ? "occupied or operational facilities may require consistent upkeep" : "facility-service relevance is possible"}, but ${lead.companyName}'s current cleaning scope has not been verified.`,
    points: strong ? 12 : 6,
    strength: "possible",
    basis: "industry_hypothesis",
  };
}

function noCurrentSignalCaveat(vertical: string): string {
  if (vertical === "fleet_wraps") {
    return "No current fleet expansion, vehicle purchase, rebrand, or other time-sensitive buying signal has been verified.";
  }
  if (vertical === "it_services") {
    return "No current technology project, security event, provider change, or other time-sensitive buying signal has been verified.";
  }
  return "No current facility expansion, contract change, service issue, or other time-sensitive buying signal has been verified.";
}

const freshnessRank = (freshness: OpportunitySignal["freshness"]): number =>
  freshness === "recent" ? 4
    : freshness === "active" ? 3
      : freshness === "older" ? 2
        : freshness === "unknown" ? 1
          : 0;

const isCurrentBuyingSignal = (signal: OpportunitySignal): boolean =>
  signal.signalType === "hiring_listing"
  || signal.freshness === "recent"
  || signal.freshness === "active";

function rankBuyingSignals(signals: OpportunitySignal[]): OpportunitySignal[] {
  const confidenceRank = (signal: OpportunitySignal) =>
    signal.confidenceLevel === "high" ? 2 : signal.confidenceLevel === "medium" ? 1 : 0;
  return [...signals].sort((a, b) =>
    Number(isCurrentBuyingSignal(b)) - Number(isCurrentBuyingSignal(a))
    || b.points - a.points
    || freshnessRank(b.freshness) - freshnessRank(a.freshness)
    || confidenceRank(b) - confidenceRank(a),
  );
}

const FLEET_SELLER_CAPABILITY =
  /\b(?:fleet|vehicle|van|truck|bus|motorcoach|car)\b[^|]{0,80}\b(?:wrap|graphic|letter(?:ing)?|decal|brand|design|install)\b|\b(?:wrap|graphic|letter(?:ing)?|decal|brand|design|install)\b[^|]{0,80}\b(?:fleet|vehicle|van|truck|bus|motorcoach|car)\b/i;

function fleetDecisionMakerScore(title?: string | null, industry = ""): { points: number; explanation: string } {
  const normalized = title?.trim() || "";
  if (!normalized || /pending|unknown|not found/i.test(normalized)) {
    return { points: 0, explanation: "A relevant fleet, operations, procurement, or marketing decision-maker has not yet been verified." };
  }
  if (/\b(?:fleet (?:manager|director)|director of fleet|operations director|director of operations|procurement|purchasing|marketing director|director of marketing|chief marketing officer|cmo)\b/i.test(normalized)) {
    return { points: 10, explanation: `${normalized} is a strong decision-maker match for fleet operations, purchasing, or brand execution.` };
  }
  if (/\b(?:chief operating officer|coo|general manager|operations manager|facilities manager)\b/i.test(normalized)) {
    return { points: 8, explanation: `${normalized} is a relevant operational decision-maker, though fleet or brand ownership may still need confirmation.` };
  }
  if (/\b(?:owner|president)\b/i.test(normalized)) {
    const points = FLEET_CENTERED_INDUSTRY.test(industry) || FIELD_SERVICE_INDUSTRY.test(industry) ? 9 : 6;
    return {
      points,
      explanation: `${normalized} may own the decision${points === 9 ? " in this fleet or field-service business" : ""}, but direct fleet responsibility is not verified.`,
    };
  }
  if (/\b(?:office manager|human resources|hr manager|administrator|administrative)\b/i.test(normalized)) {
    return { points: 5, explanation: `${normalized} is a real contact with possible influence, but is not the strongest fleet, operations, procurement, or marketing decision-maker.` };
  }
  return { points: 2, explanation: `${normalized} was identified, but the role has weak or unclear ownership of fleet branding decisions.` };
}

function nonFleetDecisionMakerScore(
  title: string | null | undefined,
  vertical: string,
): { points: number; explanation: string } {
  const role = title?.trim() || "";
  if (!role || /pending|unknown|not found|decision maker(?:\s*\(.*\))?$/i.test(role)) {
    return { points: 0, explanation: "A relevant decision-maker has not yet been verified." };
  }

  const executivePattern = vertical === "it_services"
    ? /\b(?:cio|cto|chief (?:information|technology|digital|security) officer|vp|vice president|head|director)\b.*\b(?:it|information technology|technology|infrastructure|systems|security|cybersecurity)\b|\b(?:it|information technology|technology|infrastructure|systems|security|cybersecurity)\b.*\b(?:vp|vice president|head|director)\b/i
    : /\b(?:vp|vice president|head|director)\b.*\b(?:facilities|facility|operations|property|maintenance|environmental services)\b|\b(?:facilities|facility|operations|property|maintenance|environmental services)\b.*\b(?:vp|vice president|head|director)\b/i;
  if (executivePattern.test(role)) {
    return { points: 10, explanation: `${role} is a verified, highly relevant decision-maker for this service category.` };
  }

  const managerPattern = vertical === "it_services"
    ? /\b(?:it|information technology|technology|infrastructure|systems|network|security|cybersecurity)\s+manager\b|\bmanager\b.*\b(?:it|information technology|technology|infrastructure|systems|network|security|cybersecurity)\b/i
    : /\b(?:facilities|facility|operations|property|maintenance|environmental services|office)\s+manager\b|\bmanager\b.*\b(?:facilities|facility|operations|property|maintenance|environmental services)\b/i;
  if (managerPattern.test(role)) {
    return { points: 7, explanation: `${role} is a verified contact with likely influence over this service category.` };
  }

  if (/\b(?:owner|president|chief executive officer|ceo|general manager)\b/i.test(role)) {
    return { points: 6, explanation: `${role} is a verified senior contact, but direct ownership of this service category still needs confirmation.` };
  }

  return { points: 2, explanation: `${role} is a verified contact record, but decision-making relevance for this service category is unclear.` };
}

function signalAgeDays(signal: OpportunitySignal, asOf: string): number | undefined {
  if (!signal.sourceDate) return undefined;
  const sourceTime = new Date(signal.sourceDate).getTime();
  const asOfTime = new Date(asOf).getTime();
  if (!Number.isFinite(sourceTime) || !Number.isFinite(asOfTime) || sourceTime > asOfTime) return undefined;
  return (asOfTime - sourceTime) / 86_400_000;
}

function signalFreshnessPoints(signal: OpportunitySignal, asOf: string): number {
  const age = signalAgeDays(signal, asOf);
  if (age !== undefined) {
    if (age <= 30) return 10;
    if (age <= 90) return 8;
    if (age <= 180) return 6;
    if (age <= 365) return 3;
    return 0;
  }
  return 0;
}

function uniqueResearchSignals(researchedSignals: OpportunitySignal[]): OpportunitySignal[] {
  const normalized = (value?: string) => (value || "")
    .toLowerCase()
    .replace(/^official job listing:\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const unique = new Map<string, OpportunitySignal>();
  for (const signal of researchedSignals) {
    const hiringLocation = signal.signalDescription.match(/\bin\s+(.+?)\s+on (?:its|the) /i)?.[1] || "";
    const key = signal.signalType === "hiring_listing"
      ? [signal.signalType, normalized(signal.signalTitle), normalized(hiringLocation)].join("|")
      : [
          signal.signalType,
          normalized(signal.supportingEvidence || signal.signalDescription),
          signal.sourceDate
            ? (signal.sourceDate instanceof Date ? signal.sourceDate.toISOString() : signal.sourceDate).slice(0, 10)
            : "",
        ].join("|");
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, { ...signal, corroboratingSources: [...(signal.corroboratingSources || [])] });
      continue;
    }
    if (signal.sourceURL && signal.sourceURL !== existing.sourceURL) {
      existing.corroboratingSources = [
        ...(existing.corroboratingSources || []),
        {
          sourceName: signal.sourceName,
          sourceURL: signal.sourceURL,
          sourceDate: signal.sourceDate,
        },
      ];
    }
  }
  return [...unique.values()];
}

function fleetHiringPoints(signals: OpportunitySignal[]): { points: number; awardedSignal?: OpportunitySignal } {
  const roleScore = (signal: OpportunitySignal) => {
    const text = `${signal.signalTitle} ${signal.signalDescription} ${signal.supportingEvidence || ""}`;
    if (/\b(?:accountant|accounting|office administrator|administrative assistant|bookkeeper)\b/i.test(text)) return 0;
    if (/\b(?:fleet manager|fleet director|director of fleet)\b/i.test(text)) return 7;
    if (/\b(?:driver|cdl|chauffeur|mechanic|route|delivery|service technician|field service|mobile technician|maintenance technician|hvac|plumb|electric|install|roof|restoration|pest control|landscap|utility field|field sales(?: representative)?|crew)\b/i.test(text)) return 6;
    return 0;
  };
  const relevant = signals
    .filter(signal => signal.signalType === "hiring_listing")
    .map(signal => ({ signal, rolePoints: roleScore(signal) }))
    .filter(item => item.rolePoints > 0)
    .sort((a, b) => b.rolePoints - a.rolePoints);
  if (!relevant.length) return { points: 0 };

  const openingCount = relevant.reduce((total, { signal }) => {
    const text = `${signal.signalTitle} ${signal.signalDescription} ${signal.supportingEvidence || ""}`;
    const explicit = text.match(/\b(\d{1,3})\s+(?:current\s+|open\s+)?[\w/&-]+(?:\s+[\w/&-]+){0,8}\s+(?:openings?|roles?|positions?|jobs?)\b/i)
      || text.match(/\b(?:openings?|roles?|positions?|jobs?)\s*:?\s*(\d{1,3})\b/i);
    return total + (explicit ? Number(explicit[1]) : 1);
  }, 0);
  const countBonus = openingCount >= 8 ? 2 : openingCount >= 3 ? 1 : 0;
  return {
    points: Math.min(8, relevant[0].rolePoints + countBonus),
    awardedSignal: relevant[0].signal,
  };
}

function signalTraceId(signal: OpportunitySignal): string {
  return createHash("sha256")
    .update([
      signal.signalType,
      signal.signalTitle,
      signal.signalDescription,
      signal.sourceURL || "",
      signal.sourceDate ? String(signal.sourceDate) : "",
      signal.signalClassification,
    ].join("|"))
    .digest("hex")
    .slice(0, 16);
}

function explicitOpeningCount(signal: OpportunitySignal): number | null {
  const text = `${signal.signalTitle} ${signal.signalDescription} ${signal.supportingEvidence || ""}`;
  const explicit = text.match(/\b(\d{1,3})\s+(?:current\s+|open\s+)?[\w/&-]+(?:\s+[\w/&-]+){0,8}\s+(?:openings?|roles?|positions?|jobs?)\b/i)
    || text.match(/\b(?:openings?|roles?|positions?|jobs?)\s*:?\s*(\d{1,3})\b/i);
  return explicit ? Number(explicit[1]) : null;
}

function buildHiringResearch(signals: OpportunitySignal[], generatedAt: string): NonNullable<OpportunityIntelligence["hiringResearch"]> {
  const listings = signals.filter(signal => signal.signalType === "hiring_listing");
  const checkedWithoutResult = signals.some(signal => signal.signalType === "hiring_research_status");
  const roles = [...new Set(listings.map(signal => signal.signalTitle.replace(/^Official job listing:\s*/i, "").trim()).filter(Boolean))];
  const locations = [...new Set(listings.map(signal =>
    signal.signalDescription.match(/\bin\s+(.+?)\s+on (?:its|the) /i)?.[1]?.trim(),
  ).filter((value): value is string => Boolean(value)))];
  const explicitCounts = listings.map(explicitOpeningCount).filter((value): value is number => value !== null);
  const datedListings = listings.map(signal => signalAgeDays(signal, generatedAt)).filter((value): value is number => value !== undefined);
  const hasActiveListing = listings.some(signal => signal.signalType === "hiring_listing" && signal.confidenceLevel !== "low");
  const status: NonNullable<OpportunityIntelligence["hiringResearch"]>["status"] = hasActiveListing
    ? datedListings.length && Math.min(...datedListings) > 180
      ? "RECENT_HIRING_SIGNAL"
      : "VERIFIED_ACTIVE_HIRING"
    : checkedWithoutResult
      ? "NO_ACTIVE_HIRING_FOUND"
      : "UNKNOWN";
  const sources = listings.flatMap(signal => [
    ...(signal.sourceURL ? [{ sourceName: signal.sourceName, sourceURL: signal.sourceURL, sourceDate: signal.sourceDate }] : []),
    ...(signal.corroboratingSources || []),
  ]);
  return {
    status,
    roles,
    locations,
    count: listings.length ? (explicitCounts.length ? explicitCounts.reduce((sum, count) => sum + count, 0) : listings.length) : null,
    sources,
    confidence: listings.some(signal => signal.confidenceLevel === "high") ? "high" : listings.length ? "medium" : "low",
    evidence: listings.map(signal => signal.supportingEvidence || signal.signalDescription),
  };
}

export function validateOpportunityIntelligence(
  value: OpportunityIntelligence,
  vertical: string,
): { passed: boolean; calculatedTotal: number; categoryMaxTotal: number; checks: Array<{ name: string; passed: boolean }> } {
  const expectedKeys: OpportunityScoreCategory["key"][] = [
    "company_industry_fit",
    "verified_buying_signals",
    "seller_prospect_match",
    "decision_maker_match",
    "signal_freshness",
    "business_need_potential",
  ];
  const calculatedTotal = value.breakdown.reduce((sum, item) => sum + item.points, 0);
  const categoryMaxTotal = value.breakdown.reduce((sum, item) => sum + item.maxPoints, 0);
  const buyingSignals = value.signals.filter(signal => signal.points > 0);
  const ids = value.signals.map(signal => signal.signalId).filter(Boolean);
  const freshness = value.breakdown.find(item => item.key === "signal_freshness")?.points || 0;
  const sellerMatch = value.breakdown.find(item => item.key === "seller_prospect_match")?.points || 0;
  const strongestSignal = [...buyingSignals].sort((a, b) => b.points - a.points)[0];
  const checks = [
    {
      name: "six named score categories",
      passed: value.breakdown.length === 6 && expectedKeys.every(key => value.breakdown.some(item => item.key === key)),
    },
    {
      name: "category maxima total 100",
      passed: categoryMaxTotal === 100 && (vertical !== "fleet_wraps" || value.breakdown.map(item => item.maxPoints).join(",") === "20,30,20,10,10,10"),
    },
    { name: "breakdown exactly matches headline total", passed: calculatedTotal === value.score },
    {
      name: "every scored buying signal is verified and sourced",
      passed: buyingSignals.every(signal =>
        signal.signalClassification === "verified"
        && Boolean(signal.sourceURL)
        && Boolean(signal.supportingEvidence)
        && Boolean(signal.pointReason),
      ),
    },
    {
      name: "implications and unconfirmed facts earn zero points",
      passed: value.signals.every(signal => signal.signalClassification === "verified" || signal.points === 0),
    },
    {
      name: "company verification earns zero buying-signal points",
      passed: value.signals.every(signal =>
        !/^(?:business_listing|operating_address|company_website|published_phone|industry_category|business_category)$/.test(signal.signalType)
        || signal.points === 0,
      ),
    },
    {
      name: "hiring research has an explicit status",
      passed: Boolean(value.hiringResearch?.status),
    },
    {
      name: "duplicate signals do not earn duplicate points",
      passed: ids.length === new Set(ids).size,
    },
    {
      name: "seller intelligence controls seller-match points",
      passed: sellerMatch === 0 || (
        value.scoringInputs?.sellerProfileStatus === "ready"
        && Boolean(value.scoringInputs.sellerCapabilitiesConsidered.length)
      ),
    },
    {
      name: "decision-maker relevance is evaluated",
      passed: Boolean(value.breakdown.find(item => item.key === "decision_maker_match")?.evidence.length),
    },
    {
      name: "freshness uses dated verified buying signals only",
      passed: freshness === 0 || buyingSignals.some(signal =>
        Boolean(signal.sourceDate)
        && signal.signalClassification === "verified"
        && signalFreshnessPoints(signal, String(value.generatedAt)) === freshness,
      ),
    },
    {
      name: "why target uses the scored evidence",
      passed: !/Google Places returned|returned by Google Places/i.test(value.whyTarget)
        && (!strongestSignal || value.whyTarget.includes(strongestSignal.signalDescription)),
    },
    {
      name: "opportunity score contains no engagement inputs",
      passed: !/\b(?:email opens?|link clicks?|attachment views?|calendly clicks?|meeting activity)\b/i.test(JSON.stringify(value.scoringInputs || {})),
    },
    {
      name: "signals older than one year earn zero buying points",
      passed: value.signals.every(signal => signal.freshness !== "stale" || signal.points === 0),
    },
  ];
  return { passed: checks.every(check => check.passed), calculatedTotal, categoryMaxTotal, checks };
}

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
  const uniqueResearched = uniqueResearchSignals(researchedSignals);
  const modelFit = businessModelFit(lead, vertical, uniqueResearched);
  const sellerOffers = [...seller.capabilities, ...seller.services, ...seller.products, ...seller.valuePropositions];
  const sellerOutcome = seller.outcomes[0] || seller.valuePropositions[0];
  const priorities = (client?.sellerServicePriorities ?? "")
    .split(/[\n,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
  const relevantPriority = priorities.find(priority =>
    sellerOffers.some(offer => offer.toLowerCase().includes(priority.toLowerCase()) || priority.toLowerCase().includes(offer.toLowerCase())),
  );
  const sellerCapability = (
    relevantPriority
      ? sellerOffers.find(offer =>
          offer.toLowerCase().includes(relevantPriority.toLowerCase())
          || relevantPriority.toLowerCase().includes(offer.toLowerCase()),
        )
      : undefined
  ) ?? sellerOffers[0];
  const sellerIndustryMatch = seller.industriesServed.some(value =>
    value.toLowerCase().includes(lead.industry.toLowerCase()) || lead.industry.toLowerCase().includes(value.toLowerCase()),
  );
  const fleetDecisionMaker = fleetDecisionMakerScore(lead.contactTitle, lead.industry);
  const nonFleetDecisionMaker = nonFleetDecisionMakerScore(lead.contactTitle, vertical);

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
    fleet_wraps: /\b(?:fleet (?:manager|director)|director of fleet|chauffeur|mechanic|hvac|field(?: service| sales(?: representative)?)?|mobile|maintenance|pest control|restoration|home health|utility|landscap|roof|plumb|electric|install|technician|(?:service|route|delivery|cdl) driver|driver|crew)\b/i,
    janitorial: /\b(?:facility|facilities|property|operations?|plant|warehouse|environmental services|production)\b/i,
    it_services: /\b(?:it manager|information technology|systems? administrator|help desk|cyber|network engineer|cloud engineer|information security|compliance|technology (?:director|manager))\b/i,
  };
  const hiringPattern = rolePatterns[vertical] ?? rolePatterns.janitorial;
  const buyingEvidence: OpportunitySignal[] = [];
  const freshnessEvidence: OpportunitySignal[] = [];
  let relevantHiringVerified = false;
  const fleetHiring = vertical === "fleet_wraps" ? fleetHiringPoints(uniqueResearched) : { points: 0 };
  for (const researched of uniqueResearched) {
    if (!researched.sourceURL || !researched.supportingEvidence) {
      signals.push({
        ...researched,
        signalClassification: "unconfirmed",
        points: 0,
        pointReason: "Rejected for scoring because a source URL and supporting evidence are required.",
      });
      continue;
    }
    if (researched.signalClassification !== "verified") {
      signals.push({
        ...researched,
        points: 0,
        pointReason: researched.signalClassification === "implication"
          ? "Potential implications do not earn Opportunity points."
          : "Unconfirmed claims do not earn Opportunity points.",
      });
      continue;
    }
    const isHiring = researched.signalType === "hiring_listing";
    const relevantHiring = isHiring && hiringPattern.test(`${researched.signalTitle} ${researched.signalDescription}`);
    const configuredRawPoints = researched.signalType === "vehicle_purchase" || researched.signalType === "fleet_expansion"
      ? (vertical === "fleet_wraps" ? 15 : 3)
      : researched.signalType === "new_route"
        ? (vertical === "fleet_wraps" ? 10 : 3)
        : researched.signalType === "rebrand" || researched.signalType === "logo_change"
          ? 12
          : researched.signalType === "acquisition"
            ? 10
            : researched.signalType === "company_vehicle_job_mention"
              ? vertical === "fleet_wraps" ? 6 : 0
              : researched.signalType === "new_location"
          || researched.signalType === "new_market"
            || researched.signalType === "new_facility"
            || researched.signalType === "expansion"
            || researched.signalType === "company_launch"
                ? 10
                : researched.signalType === "service_expansion"
                  ? 8
                  : relevantHiring
                    ? vertical === "fleet_wraps"
                      ? researched === fleetHiring.awardedSignal ? fleetHiring.points : 0
                      : 6
                    : 0;
    const genericExpansionNeedsFleetContext = /^(?:new_location|new_market|service_expansion|new_facility|expansion|company_launch)$/.test(researched.signalType);
    const rawPoints = vertical === "fleet_wraps" && genericExpansionNeedsFleetContext && modelFit.strength === "weak"
      ? 0
      : configuredRawPoints;
    const agePoints = signalFreshnessPoints(researched, generatedAt);
    const sourceAge = signalAgeDays(researched, generatedAt);
    const recencyMultiplier = sourceAge === undefined
      ? isHiring ? 1 : 0.5
      : agePoints >= 10
        ? 1
        : agePoints >= 8
          ? 0.9
          : agePoints >= 6
            ? 0.75
            : agePoints >= 3
              ? 0.5
              : agePoints >= 1
                ? 0.15
                : 0;
    const confidenceMultiplier = researched.confidenceLevel === "high" ? 1 : researched.confidenceLevel === "medium" ? 0.75 : 0;
    const basePoints = Math.round(rawPoints * recencyMultiplier * confidenceMultiplier);
    const scored = {
      ...researched,
      dateVerified: researched.dateVerified || generatedAt,
      points: basePoints,
      pointReason: rawPoints === 0
        ? configuredRawPoints > 0
          ? "The event is verified, but no fleet-relevant operating model connects this generic expansion to the seller's services."
          : "This verified information does not match a scored buying-signal rule."
        : `${rawPoints}-point ${researched.signalType.replace(/_/g, " ")} rule × ${recencyMultiplier.toFixed(2)} age factor × ${confidenceMultiplier.toFixed(2)} confidence factor = ${basePoints} points.`,
    };
    signals.push(scored);
    if (basePoints > 0) {
      buyingEvidence.push(scored);
      if (agePoints > 0) freshnessEvidence.push(scored);
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
        pointReason: "Potential implications receive zero Verified Buying Signal points.",
        points: 0,
      });
    }
  }

  const defaultUnknowns = vertical === "fleet_wraps"
    ? ["Current fleet size", "Vehicle purchase or expansion plans", "Recent acquisition, company launch, or rebrand", "Current vehicle graphics provider"]
    : vertical === "it_services"
      ? ["Current IT provider", "Cybersecurity problems or incidents", "Technology contract timing and budget"]
      : ["Current janitorial provider", "Contract expiration or replacement plans", "Cleaning budget and service gaps"];
  const verifiedTypes = new Set(uniqueResearched.filter(signal => signal.signalClassification === "verified").map(signal => signal.signalType));
  const unknowns = defaultUnknowns.filter(title => {
    if (/fleet size/i.test(title)) return true;
    if (/vehicle purchase/i.test(title) && (verifiedTypes.has("vehicle_purchase") || verifiedTypes.has("fleet_expansion"))) return false;
    if (/expansion/i.test(title) && (
      verifiedTypes.has("expansion")
      || verifiedTypes.has("new_location")
      || verifiedTypes.has("new_market")
      || verifiedTypes.has("new_route")
      || verifiedTypes.has("service_expansion")
      || verifiedTypes.has("new_facility")
      || verifiedTypes.has("fleet_expansion")
    )) return false;
    if (/acquisition|launch|rebrand/i.test(title) && (
      verifiedTypes.has("acquisition")
      || verifiedTypes.has("company_launch")
      || verifiedTypes.has("rebrand")
      || verifiedTypes.has("logo_change")
    )) return false;
    return true;
  });
  if (!relevantHiringVerified && !uniqueResearched.some(signal => signal.signalType === "hiring_research_status")) {
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
      dateVerified: generatedAt,
      pointReason: "Unconfirmed information receives zero Opportunity points.",
      points: 0,
    });
  }

  const fleetSellerCapability = sellerOffers.some(offer => FLEET_SELLER_CAPABILITY.test(offer));
  // Google Places identity, address, website, phone, and category details never
  // add Opportunity points. Only operating-model relevance contributes here.
  const companyFitPoints = vertical === "fleet_wraps"
    ? Math.min(20, modelFit.points)
    : Math.min(25, modelFit.points + (lead.website ? 2 : 1));
  const sellerMatchPoints = vertical === "fleet_wraps"
    ? !seller.ready || !fleetSellerCapability || modelFit.strength === "weak"
      ? 0
      : Math.min(
          20,
          (modelFit.basis === "verified" ? 12 : 7)
            + (sellerIndustryMatch ? 3 : 0)
            + (relevantPriority ? 3 : 0)
            + (sellerOutcome ? 2 : 0),
        )
    : seller.ready
      ? 12 + (sellerIndustryMatch ? 4 : 0) + (relevantPriority ? 3 : 0) + (sellerOutcome ? 1 : 0)
      : 0;
  const businessNeedPoints = vertical === "fleet_wraps"
    ? modelFit.strength === "weak"
      ? 0
      : modelFit.basis === "verified"
        ? sellerMatchPoints >= 10 ? 10 : 7
        : sellerMatchPoints >= 10 ? 7 : 4
    : 3 + (seller.ready ? 2 : 0);
  const buyingPoints = Math.min(30, buyingEvidence.reduce((sum, signal) => sum + signal.points, 0));
  const rankedBuyingEvidence = rankBuyingSignals(buyingEvidence);
  const freshnessPoints = Math.min(10, Math.max(0, ...freshnessEvidence.map(signal => signalFreshnessPoints(signal, generatedAt))));
  const effectiveFreshnessPoints = freshnessEvidence.length ? freshnessPoints : 0;
  const decisionMakerPoints = vertical === "fleet_wraps" ? fleetDecisionMaker.points : nonFleetDecisionMaker.points;
  const officialModelVerified = modelFit.basis === "verified";
  const companyVerificationCount = signals.filter(signal =>
    signal.signalClassification === "verified"
    && /^(?:business_listing|operating_address|company_website|published_phone)$/.test(signal.signalType)
  ).length;
  const reliableBuyingSignalCount = buyingEvidence.filter(signal => signal.confidenceLevel === "high").length;
  const scoreConfidence: OpportunityIntelligence["scoreConfidence"] =
    vertical === "fleet_wraps"
      ? officialModelVerified && sellerMatchPoints >= 12 && decisionMakerPoints >= 5 && reliableBuyingSignalCount >= 2 && effectiveFreshnessPoints >= 6
        ? "high"
        : officialModelVerified && sellerMatchPoints > 0
          || reliableBuyingSignalCount > 0
          || companyVerificationCount >= 3 && decisionMakerPoints >= 5 && seller.ready
            ? "medium"
            : "low"
      : buyingPoints >= 18 && freshnessEvidence.length >= 2 ? "high" : buyingPoints > 0 ? "medium" : "low";
  const scoreConfidenceReason = scoreConfidence === "high"
    ? "Multiple reliable, current company-specific signals support the score, along with verified seller fit and a relevant decision-maker."
    : scoreConfidence === "medium"
      ? "Verified company or operating-model evidence supports the score, but direct buying signals, source coverage, or decision-maker evidence remains limited."
      : "The score relies mostly on broad ICP context or limited company-specific evidence; timing and buying intent remain uncertain.";
  const companyFitMax = vertical === "fleet_wraps" ? 20 : 25;
  const businessNeedMax = vertical === "fleet_wraps" ? 10 : 5;
  const breakdown = [
    category(
      "company_industry_fit",
      vertical === "fleet_wraps" ? "Company / ICP Fit" : "Company / Industry Fit",
      companyFitPoints,
      companyFitMax,
      vertical === "fleet_wraps"
        ? "Only verified operating-model evidence or a clearly qualified ICP hypothesis contributes. Google Places, address, website, phone, and company existence add zero Opportunity points."
        : "This score reflects business-model relevance to the seller. Public listing details contribute only minimal identity and contactability weight.",
      [
        modelFit.description,
        "Company verification is supporting information only and is not a reason to pursue the account.",
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
        ? rankedBuyingEvidence.map(signal => `${signal.signalTitle} (+${signal.points})`)
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
      seller.ready && sellerMatchPoints > 0
        ? [
            `Relevant configured capability: ${sellerCapability}.`,
            ...(relevantPriority ? [`Configured priority service considered: ${relevantPriority}.`] : []),
            ...(sellerIndustryMatch ? [`The seller identifies ${lead.industry} among industries served.`] : []),
          ]
        : seller.ready
          ? ["Approved seller capabilities were evaluated, but no prospect operating-model relevance was verified."]
          : ["Complete or approve Company Intelligence to enable seller-specific scoring."],
    ),
    category(
      "decision_maker_match",
      "Decision-Maker Match",
      decisionMakerPoints,
      10,
      vertical === "fleet_wraps"
        ? fleetDecisionMaker.explanation
        : nonFleetDecisionMaker.explanation,
      [decisionMakerPoints ? `Contact role: ${lead.contactTitle}.` : "Contact enrichment is pending or did not verify a decision-maker."],
    ),
    category(
      "signal_freshness",
      "Signal Freshness",
      effectiveFreshnessPoints,
      10,
      effectiveFreshnessPoints >= 6
        ? "Freshness points reflect the age of the most recent current, company-specific verified buying signal."
        : effectiveFreshnessPoints
          ? "Only older verified buying evidence was found, so freshness receives limited credit."
        : "No current, explicitly dated buying signal was verified. Discovery time and signals older than one year earn no freshness points.",
      freshnessEvidence.length
        ? freshnessEvidence.map(signal => `${signal.signalTitle}: ${signalFreshnessPoints(signal, generatedAt)} freshness points based on source age.`)
        : ["No dated or currently active buying signal was verified."],
    ),
    category(
      "business_need_potential",
      "Business Need Potential",
      businessNeedPoints,
      businessNeedMax,
      vertical === "fleet_wraps"
        ? modelFit.basis === "verified"
          ? "Verified vehicle-centered operations create legitimate potential for fleet-branding consistency, but do not prove an active purchase."
          : modelFit.strength === "weak"
            ? "No credible fleet or commercial-vehicle need has been established."
            : "Industry context suggests a possible vehicle-branding need, but the prospect's operating model remains unverified."
        : "Industry context creates a reasonable possibility of need, but this remains an implication until discovery or a verified signal confirms it.",
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
  const strongestBuyingSignal = rankedBuyingEvidence[0];
  const strongestHistoricalSignal = rankBuyingSignals(signals.filter(signal =>
    signal.signalClassification === "verified"
    && signal.points === 0
    && (signal.freshness === "older" || signal.freshness === "stale")
    && /^\d+-point /.test(signal.pointReason || ""),
  ))[0];
  const strongestNarrativeSignal = strongestBuyingSignal || strongestHistoricalSignal;
  const sellerFit = seller.ready && sellerCapability && sellerMatchPoints > 0
    ? `This creates ${modelFit.strength === "strong" ? "a potentially strong" : "a possible"} fit for ${seller.name}'s ${sellerCapability}${sellerOutcome ? `, which may support ${sellerOutcome}` : ""}.`
    : "";
  const signalRelevance = strongestNarrativeSignal
    ? strongestNarrativeSignal.signalType === "hiring_listing"
      ? `${strongestNarrativeSignal.signalDescription} This current official listing may indicate sustained or increasing operating capacity, but it does not verify a purchase, expansion, or provider change.`
      : isCurrentBuyingSignal(strongestNarrativeSignal)
        ? `${strongestNarrativeSignal.signalDescription} This current verified event creates a timely reason to explore whether ${sellerCapability || "the seller's services"} may be relevant.`
        : strongestNarrativeSignal.freshness === "older" || strongestNarrativeSignal.freshness === "stale"
          ? `${strongestNarrativeSignal.signalDescription} This is verified historical context, not a current buying signal. ${noCurrentSignalCaveat(vertical)}`
          : `${strongestNarrativeSignal.signalDescription} The event is verified, but its date is not; it should not be treated as timely. ${noCurrentSignalCaveat(vertical)}`
    : noCurrentSignalCaveat(vertical);
  const whyTarget = !seller.ready || (!strongestNarrativeSignal && modelFit.strength === "weak")
    ? `No strong seller-specific reason to prioritize ${lead.companyName} has been identified yet. ${noCurrentSignalCaveat(vertical)}`
    : strongestNarrativeSignal
      ? `${signalRelevance} ${modelFit.description} ${sellerFit}`
      : `${modelFit.description} ${sellerFit} ${signalRelevance}`;
  const recommendedOutreach = strongestNarrativeSignal
    ? isCurrentBuyingSignal(strongestNarrativeSignal)
      ? `Lead with the verified ${strongestNarrativeSignal.signalTitle.toLowerCase()}, connect it to ${sellerCapability || "the relevant seller capability"}, and ask whether the related operational priority is current.`
      : `Use the verified ${strongestNarrativeSignal.signalTitle.toLowerCase()} only as background context and ask whether a related priority exists now; do not present the event as current.`
    : modelFit.strength === "weak"
      ? "Keep this prospect low priority until discovery or new evidence establishes a seller-specific reason to engage."
      : `Lead with the business-model relevance described above and ask about ${match.challenges[0]}. Use discovery-oriented messaging because no current buying event has been verified.`;
  const hiringResearch = buildHiringResearch(uniqueResearched, generatedAt);
  const tracedSignals = signals.map(signal => ({
    ...signal,
    signalId: signal.signalId || signalTraceId(signal),
    dateVerified: signal.dateVerified || generatedAt,
    pointReason: signal.pointReason || (
      signal.signalClassification === "verified"
        ? "Verified supporting information; no Opportunity points are assigned by this signal."
        : signal.signalClassification === "implication"
          ? "Potential implications receive zero Opportunity points."
          : "Unconfirmed information receives zero Opportunity points."
    ),
  }));
  const scoringInputs: NonNullable<OpportunityIntelligence["scoringInputs"]> = {
    vertical,
    companyName: lead.companyName,
    industry: lead.industry,
    contactTitle: lead.contactTitle || null,
    businessModelBasis: modelFit.basis,
    sellerProfileStatus: seller.ready ? "ready" : "limited",
    sellerCapabilitiesConsidered: sellerOffers,
    sellerPriorityConsidered: relevantPriority || null,
  };
  const candidate: OpportunityIntelligence = {
    version: OPPORTUNITY_MODEL_VERSION,
    score,
    label: scoreLabel(score, vertical),
    scoreConfidence,
    scoreConfidenceReason,
    definition: OPPORTUNITY_SCORE_DEFINITION,
    breakdown,
    signals: tracedSignals,
    whyTarget,
    potentialNeeds,
    recommendedOutreach,
    hiringResearch,
    scoringInputs,
    generatedAt,
  };
  const integrity = validateOpportunityIntelligence(candidate, vertical);
  if (!integrity.passed) {
    const failed = integrity.checks.filter(check => !check.passed).map(check => check.name);
    throw new Error(`Opportunity Score integrity validation failed: ${failed.join(", ")}.`);
  }
  return { ...candidate, integrity: { status: "passed", ...integrity } };
}

const STORED_RESEARCH_SIGNAL =
  /^(?:hiring_listing|hiring_research_status|business_model_evidence|fleet_vehicle_evidence|company_vehicle_job_mention|vehicle_purchase|fleet_expansion|new_route|new_market|service_expansion|new_facility|logo_change|acquisition|rebrand|new_location|expansion|company_launch)$/;

export function refreshStoredOpportunityForRead(
  prospect: PersistedOpportunityInput & { vertical?: string | null },
  client?: typeof usersTable.$inferSelect,
): { intelligence: OpportunityIntelligence | null | undefined; changed: boolean } {
  const existing = prospect.opportunityIntelligence as OpportunityIntelligence | null | undefined;
  const vertical = prospect.vertical || "janitorial";
  if (!existing || vertical !== "fleet_wraps" || existing.version === OPPORTUNITY_MODEL_VERSION) {
    return { intelligence: existing, changed: false };
  }
  const retainedResearch = (existing.signals || []).filter(signal =>
    STORED_RESEARCH_SIGNAL.test(signal.signalType)
    && Boolean(signal.sourceURL)
    && Boolean(signal.supportingEvidence),
  );
  return {
    intelligence: buildOpportunityIntelligence({
      companyName: prospect.companyName,
      contactTitle: prospect.title ?? prospect.contactTitle,
      industry: prospect.industry,
      city: prospect.city,
      state: prospect.state,
      address: prospect.address,
      website: prospect.website,
      phone: prospect.phone,
    }, vertical, client, retainedResearch),
    changed: true,
  };
}

export function shouldRefreshStoredOpportunity(
  intelligence: OpportunityIntelligence | null | undefined,
): boolean {
  return Boolean(intelligence && intelligence.version !== OPPORTUNITY_MODEL_VERSION);
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
      || !/^(?:vehicle_purchase|fleet_expansion|new_route|new_market|service_expansion|new_facility|logo_change|acquisition|rebrand|new_location|expansion|company_launch)$/.test(signal.signalType)
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
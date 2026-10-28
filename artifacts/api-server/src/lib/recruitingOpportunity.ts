import type { OpportunityIntelligence, OpportunitySignal, ItResearch, usersTable } from "@workspace/db";
import { sellerIntelligenceProfile } from "./prospectMatching";

type Lead = { companyName: string; industry: string; contactTitle?: string | null; employeeCount?: number | null; city: string; state: string };
const daysAgo = (value: string | Date | null | undefined) =>
  value && Number.isFinite(Date.parse(String(value))) ? Math.max(0, (Date.now() - Date.parse(String(value))) / 86_400_000) : null;

export function buildRecruitingOpportunity(
  lead: Lead,
  client: typeof usersTable.$inferSelect | undefined,
  report?: ItResearch,
): OpportunityIntelligence {
  const now = new Date().toISOString();
  const research = report?.recruiting;
  const seller = sellerIntelligenceProfile(client);
  const offerings = [...seller.services, ...seller.products, ...seller.capabilities];
  const recommendations = report?.recommendations.filter(rec =>
    offerings.some(offering => offering.toLowerCase() === rec.offering.toLowerCase())
    && rec.sellerEvidence.availability !== "unavailable") ?? [];
  const jobs = research?.jobs.filter(job => job.status === "active" && !job.noAgencies) ?? [];
  const confirmedGrowth = research?.growthSignals.filter(signal => signal.confirmedHiring) ?? [];
  const fitKnown = Boolean(research?.employerIdentity === "confirmed" && report?.industryRelationship === "match");
  const roleAndTerritoryMatch = recommendations.length > 0;
  const stakeholder = /\b(?:owner|founder|ceo|chro|hr|human resources|talent|recruit|plant|operations|warehouse|procurement|hiring|director|manager)\b/i.test(lead.contactTitle ?? "")
    && !/pending|unknown/i.test(lead.contactTitle ?? "");
  const freshJobs = jobs.filter(job => {
    const age = daysAgo(job.postedAt);
    return age !== null && age <= 30;
  });
  const freshGrowth = confirmedGrowth.filter(signal => {
    const age = daysAgo(signal.announcementDate);
    return age !== null && age <= 90;
  });
  const suppressed = !research || research.automationSuppressed;
  const points = [
    fitKnown ? 20 : 0,
    Math.min(25, jobs.length * 4 + confirmedGrowth.length * 7),
    roleAndTerritoryMatch ? 20 : 0,
    stakeholder ? 7 : 0,
    Math.min(15, freshJobs.length * 3 + freshGrowth.length * 5),
    Math.min(10, jobs.filter(job => job.urgent || job.verifiedReposting).length * 3 + confirmedGrowth.length * 3),
  ];
  if (!roleAndTerritoryMatch) {
    points[1] = 0;
    points[4] = 0;
    points[5] = 0;
  }
  // No service match means no recommendation-ready opportunity; ambiguous employers
  // and explicit agency restrictions must not become automated high-priority leads.
  const rawScore = points.reduce((sum, point) => sum + point, 0);
  const score = suppressed ? 0 : roleAndTerritoryMatch ? rawScore : Math.min(rawScore, 29);
  const categories = [
    ["company_industry_fit", "Employer industry fit", 20,
      fitKnown ? `Verified employer in ${report?.actualIndustry || lead.industry}.` : "Employer identity or industry fit remains unverified."],
    ["verified_buying_signals", "Verified hiring evidence", 25,
      `${jobs.length} unique active agency-eligible listings and ${confirmedGrowth.length} growth events with announced hiring. A listing does not prove demand for an agency.`],
    ["seller_prospect_match", "Recruiter service and specialty match", 20,
      roleAndTerritoryMatch ? `${recommendations.length} evidence-led matches to actual seller services; role, territory and placement fit still require discovery.` : "No supported match to the seller's confirmed offerings. No generic recruiter service is assumed."],
    ["decision_maker_match", "Relevant employer stakeholder", 10,
      stakeholder ? "A likely employer stakeholder is present; purchasing authority is not verified." : "A relevant employer contact has not been identified."],
    ["signal_freshness", "Evidence freshness", 15,
      `${freshJobs.length} listings with published dates within 30 days; ${freshGrowth.length} confirmed hiring announcements within 90 days. Unknown dates earn no recency points.`],
    ["business_need_potential", "Explicit urgency and growth", 10,
      "Only sourced urgency, verified repostings and announced growth hiring count; old postings alone do not prove a hard-to-fill role."],
  ] as const;
  const signals: OpportunitySignal[] = [
    ...jobs.map(job => ({
      signalType: "hiring_listing", signalTitle: job.title,
      signalDescription: `${job.employer}: ${job.title} — ${job.location}. ${job.postedAt ? `Published ${job.postedAt}.` : "Posting age unknown."}`,
      signalClassification: "verified" as const,
      confidenceLevel: "medium" as const,
      freshness: (job.postedAt && (daysAgo(job.postedAt) ?? 999) <= 30 ? "recent" : job.postedAt ? "older" : "unknown") as "recent" | "older" | "unknown",
      sourceName: "Cited public hiring source", sourceURL: job.sourceURL,
      sourceDate: job.postedAt || undefined,
      dateDiscovered: job.firstSeenAt, dateVerified: job.lastVerifiedAt,
      supportingEvidence: job.evidence, points: Math.min(4, 25 / Math.max(1, jobs.length)),
    })),
    ...(research?.growthSignals ?? []).map(signal => ({
      signalType: signal.type === "new_company" ? "company_launch" : signal.type,
      signalTitle: signal.title,
      signalDescription: `${signal.location}. ${signal.confirmedHiring ? signal.hiringPlans : "Potential staffing implications only; hiring is not confirmed."}`,
      signalClassification: signal.confirmedHiring ? "verified" as const : "implication" as const,
      confidenceLevel: signal.confirmedHiring ? "medium" as const : "low" as const,
      freshness: (signal.announcementDate && (daysAgo(signal.announcementDate) ?? 999) <= 90 ? "recent" : "unknown") as "recent" | "unknown",
      sourceName: "Cited growth announcement", sourceURL: signal.sourceURL,
      sourceDate: signal.announcementDate || undefined,
      dateDiscovered: now, dateVerified: now, supportingEvidence: signal.evidence,
      points: signal.confirmedHiring ? 7 : 0,
    })),
  ];
  const commercialFit = Math.round((points[0] + points[2] + points[3]) / 50 * 100);
  const evidenceConfidence: "high" | "medium" | "low" = !suppressed && (freshJobs.length > 1 || freshGrowth.length > 0) ? "high"
    : !suppressed && jobs.length > 0 ? "medium" : "low";
  const next = recommendations[0];
  const whyTarget = suppressed
    ? (research?.suppressionReasons.join(" ") || "Complete current employer research before outreach.")
    : next
      ? `${lead.companyName} has ${jobs.length} verified unique active relevant listing(s). ${next.offering} may help with ${next.prospectConcern}; confirm the employer's interest in external recruiting support.`
      : "Research has not established a match to this recruiter's actual services. Review specialties, placement types and territory before targeting.";
  const updatedReport = report && research ? {
    ...report,
    recruiting: { ...research, commercialFit, evidenceConfidence },
    recommendations: suppressed ? [] : recommendations,
  } : report;
  return {
    version: 3, score,
    label: score >= 80 ? "High Priority" : score >= 60 ? "Strong Fit" : score >= 30 ? "Possible Fit" : "Low Priority",
    scoreConfidence: evidenceConfidence,
    definition: "Employer opportunity fit based on deduplicated hiring evidence, seller-service match, freshness and relevant contacts. Not engagement, buying intent or purchase probability.",
    breakdown: categories.map(([key, label, maxPoints, explanation], i) => ({
      key, label, maxPoints, points: suppressed ? 0 : points[i], explanation,
      evidence: i === 1 ? jobs.slice(0, 5).map(job => `${job.title}: ${job.sourceURL}`) : [],
    })),
    signals, whyTarget,
    potentialNeeds: next && !suppressed ? recommendations.map(rec => `${rec.prospectConcern} — potential fit: ${rec.offering}`) : [],
    recommendedOutreach: next && !suppressed
      ? `${next.outreachAngle} Ask: ${next.discoveryQuestion} Offer a hiring-needs discovery call; do not imply available candidates, guaranteed placements or willingness to use an agency.`
      : "",
    generatedAt: now,
    ...(updatedReport ? { itResearch: updatedReport } : {}),
  };
}

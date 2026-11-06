import type { ProspectLead } from "@workspace/api-client-react";

export function recruitingContactEligible(lead: Pick<ProspectLead, "opportunityIntelligence" | "researchError" | "outsideSelectedFilters">): boolean {
  const report = lead.opportunityIntelligence?.itResearch;
  const hiring = report?.recruiting;
  return Boolean(!lead.researchError && !lead.outsideSelectedFilters
    && hiring?.employerIdentity === "confirmed" && !hiring.automationSuppressed
    && report?.industryRelationship === "match" && Boolean(report.recommendations?.length)
    && hiring.commercialFit > 0
    && hiring.jobs.some(job => job.status === "active" && !job.noAgencies));
}

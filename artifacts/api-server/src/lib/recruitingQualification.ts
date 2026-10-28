import { z } from "zod/v4";
import type { RecruitingQualification, prospectsTable } from "@workspace/db";

export const RECRUITING_QUALIFICATION_LABELS: Record<keyof RecruitingQualification, string> = {
  roles: "Roles", hiresNeeded: "Number of hires", targetStartDates: "Target start dates / urgency",
  skillsCredentials: "Skills and credentials", shiftsLocations: "Shifts and hiring locations",
  compensation: "Compensation range", employmentType: "Employment type",
  currentApproach: "Current recruiting approach", currentAgencies: "Current agencies / vendors",
  hiringChallenges: "Disclosed hiring challenges", vendorRequirements: "Vendor requirements",
  budget: "Budget", decisionProcess: "Decision process / stakeholders",
  agencyRenewalDates: "Agency agreement renewal / expiration",
};

export const recruitingQualificationSchema = z.object(Object.fromEntries(
  Object.keys(RECRUITING_QUALIFICATION_LABELS).map(key => [key, z.string().trim().max(2000).optional()]),
)).strict();

export function recruitingPreMeetingBrief(prospect: typeof prospectsTable.$inferSelect): string {
  if (prospect.vertical !== "recruiting_staffing") return "";
  const research = prospect.opportunityIntelligence?.itResearch;
  const hiring = research?.recruiting;
  const disclosed = prospect.recruitingQualification ?? {};
  const fields = Object.entries(RECRUITING_QUALIFICATION_LABELS)
    .map(([key, label]) => `${label}: ${disclosed[key as keyof RecruitingQualification]?.trim() || "Not disclosed — ask during discovery"}`);
  const jobs = hiring?.jobs.filter(job => job.status === "active").map(job =>
    `- ${job.title} — ${job.location}; posted ${job.postedAt || "date unknown"}; ${job.sourceURL}${job.noAgencies ? " [NO AGENCIES]" : ""}`) ?? [];
  const growth = hiring?.growthSignals.map(signal =>
    `- ${signal.title}: ${signal.confirmedHiring ? "announced hiring" : "staffing implications only, hiring unconfirmed"}; ${signal.sourceURL}`) ?? [];
  const recommendations = research?.recommendations.map(rec => `- ${rec.offering}: ${rec.howItHelps}\n  Discovery question: ${rec.discoveryQuestion}`) ?? [];
  return [
    "RECRUITING PRE-MEETING BRIEF",
    `Employer: ${prospect.companyName} (${research?.actualIndustry || prospect.industry})`,
    `Likely stakeholder: ${prospect.contactName || "Not identified"}${prospect.title ? ` — ${prospect.title}` : ""}. Hiring authority requires confirmation.`,
    `Research last verified: ${hiring?.lastSuccessfulResearch || "Not researched"}`,
    "HIRING EVIDENCE", ...jobs, ...growth,
    ...(hiring?.suppressionReasons.length ? ["RESTRICTIONS", ...hiring.suppressionReasons] : []),
    "EMPLOYER-DISCLOSED NEEDS (not inferred)", ...fields,
    "MATCHING VERIFIED SELLER SERVICES / TALKING POINTS", ...recommendations,
    "OPEN QUESTIONS",
    "Does the employer want external recruiting help? Who approves an agency? Confirm role requirements, timelines, budget, current vendors and agreement dates.",
    "Job advertisements alone do not prove external-recruiter demand. Do not claim candidates, placements or guarantees without seller evidence.",
  ].join("\n");
}

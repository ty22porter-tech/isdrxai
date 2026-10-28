import type { ProspectSearchBody } from "@workspace/api-zod";
import type { z } from "zod";
import type { OpportunityIntelligence } from "@workspace/db";
export type RecruitingFilters = NonNullable<z.infer<typeof ProspectSearchBody>["recruitingFilters"]>;

const matches = (value: string | null | undefined, query?: string) =>
  !query?.trim() || query.split(/[,;]+/).map(term => term.trim().toLowerCase())
    .filter(Boolean).some(term => (value ?? "").toLowerCase().includes(term));

/** Discovery filters must not silently require a successful hiring-research call. */
export function requiresRecruitingResearch(filters?: RecruitingFilters): boolean {
  if (!filters) return false;
  return Boolean(filters.serviceMatchOnly
    || [filters.subindustry, filters.companySize, filters.jobTitles, filters.roleFamilies,
      filters.seniority, filters.employmentType, filters.workArrangement,
      filters.hiringLocation, filters.openingBefore].some(value => value?.trim())
    || (filters.signalType && filters.signalType !== "any")
    || (filters.confidence && filters.confidence !== "any")
    || (filters.recencyDays ?? 0) > 0 || (filters.minRelevantJobs ?? 0) > 0);
}

export function filterRecruitingOpportunity(
  intelligence: OpportunityIntelligence,
  filters: RecruitingFilters | undefined,
  employer: { employeeCount?: number | null; industry: string },
): boolean {
  const report = intelligence.itResearch;
  const research = report?.recruiting;
  if (!research || research.employerIdentity === "agency_unidentified") return false;
  if (!filters) return true;
  if (filters.industries?.length && !filters.industries.includes(employer.industry as any)) return false;
  if (filters.subindustry && !matches(report?.actualIndustry, filters.subindustry)
    && !matches(report?.industryExplanation, filters.subindustry)) return false;
  if (filters.companySize?.trim()) {
    const size = employer.employeeCount;
    if (!size) return false; // Unknown size is not evidence of meeting a size filter.
    const range = filters.companySize.replace(/,/g, "").match(/^(\d+)(?:[-–](\d+)|\+)?$/);
    const min = range ? Number(range[1]) : NaN;
    const max = range?.[2] ? Number(range[2]) : Infinity;
    if (!Number.isFinite(min) || size < min || (Number.isFinite(max) && size > max)) return false;
  }
  const jobs = research.jobs.filter(job => job.status === "active"
    && matches(job.title, filters.jobTitles)
    && matches(job.roleFamily, filters.roleFamilies)
    && matches(job.seniority, filters.seniority)
    && matches(job.employmentType, filters.employmentType)
    && matches(job.workArrangement, filters.workArrangement)
    && matches(job.location, filters.hiringLocation)
    && (!filters.recencyDays || (job.postedAt && Date.now() - Date.parse(job.postedAt) <= filters.recencyDays * 86_400_000)));
  const hasJobFilter = Boolean(filters.jobTitles || filters.roleFamilies || filters.seniority
    || filters.employmentType || filters.workArrangement || filters.hiringLocation);
  if ((hasJobFilter || filters.signalType === "jobs") && !jobs.length) return false;
  if (jobs.length < (filters.minRelevantJobs ?? 0)) return false;
  const growth = research.growthSignals.filter(signal =>
    (!filters.recencyDays || (signal.announcementDate && Date.now() - Date.parse(signal.announcementDate) <= filters.recencyDays * 86_400_000))
    && (!filters.openingBefore || (signal.expectedOpeningDate
      && Date.parse(signal.expectedOpeningDate) <= Date.parse(filters.openingBefore))));
  if (filters.signalType === "expansion" && !growth.some(signal => signal.type === "expansion")) return false;
  if (filters.signalType === "relocation" && !growth.some(signal => signal.type === "relocation")) return false;
  if (filters.signalType === "new_business" && !growth.some(signal => signal.type === "new_company" || signal.type === "new_location" || signal.type === "formation")) return false;
  if (filters.openingBefore && !growth.length) return false;
  if (filters.recencyDays && !jobs.length && !growth.length) return false;
  if (filters.confidence && filters.confidence !== "any" && research.evidenceConfidence !== filters.confidence) return false;
  if (filters.serviceMatchOnly && !report?.recommendations.length) return false;
  return true;
}

export function distanceMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude))
    * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

import type { RecruitingFilters, RecruitingQualification, RecruitingJob } from "@workspace/api-client-react";

export const RECRUITING_VERTICAL = "recruiting_staffing" as const;
export const RECRUITING_LABEL = "Recruiting & Staffing";

export const RECRUITING_INDUSTRIES = [
  "Healthcare",
  "Oil & Gas",
  "Technology",
  "Financial Services",
  "Engineering",
  "Manufacturing",
  "Logistics & Warehousing",
] as const;

export type RecruitingIndustry = (typeof RECRUITING_INDUSTRIES)[number];

export type SellerVertical = "janitorial" | "it_services" | "fleet_wraps" | "recruiting_staffing";

/** Never falls through to janitorial for a known non-janitorial vertical. */
export function normalizeVertical(value?: string | null): SellerVertical {
  if (value === "it_services" || value === "fleet_wraps" || value === "recruiting_staffing") return value;
  return "janitorial";
}

export const VERTICAL_LABELS: Record<SellerVertical, string> = {
  janitorial: "Janitorial",
  it_services: "IT Services",
  fleet_wraps: "Fleet & Commercial Vehicle Wraps",
  recruiting_staffing: RECRUITING_LABEL,
};

export type RecruitingFilterState = {
  industries: RecruitingIndustry[];
  subindustry: string;
  radiusMiles: string;
  hiringLocation: string;
  companySize: string;
  jobTitles: string;
  roleFamilies: string;
  seniority: string;
  employmentType: string;
  workArrangement: string;
  signalType: NonNullable<RecruitingFilters["signalType"]>;
  recencyDays: string;
  confidence: NonNullable<RecruitingFilters["confidence"]>;
  minRelevantJobs: string;
  openingBefore: string;
  serviceMatchOnly: boolean;
};

export const DEFAULT_RECRUITING_FILTERS: RecruitingFilterState = {
  industries: [],
  subindustry: "",
  radiusMiles: "",
  hiringLocation: "",
  companySize: "",
  jobTitles: "",
  roleFamilies: "",
  seniority: "",
  employmentType: "",
  workArrangement: "",
  signalType: "any",
  recencyDays: "",
  confidence: "any",
  minRelevantJobs: "",
  openingBefore: "",
  serviceMatchOnly: true,
};

const filterKey = (userId: string) => `prospecting:recruiting-filters:${userId}`;

export function loadRecruitingFilters(userId?: string | null): RecruitingFilterState {
  if (!userId || typeof localStorage === "undefined") return { ...DEFAULT_RECRUITING_FILTERS };
  try {
    const raw = localStorage.getItem(filterKey(userId));
    if (!raw) return { ...DEFAULT_RECRUITING_FILTERS };
    const parsed = JSON.parse(raw) as Partial<RecruitingFilterState>;
    return {
      ...DEFAULT_RECRUITING_FILTERS,
      ...parsed,
      industries: (parsed.industries ?? []).filter((i): i is RecruitingIndustry =>
        (RECRUITING_INDUSTRIES as readonly string[]).includes(i)),
    };
  } catch {
    return { ...DEFAULT_RECRUITING_FILTERS };
  }
}

export function saveRecruitingFilters(userId: string | null | undefined, state: RecruitingFilterState) {
  if (!userId || typeof localStorage === "undefined") return;
  try { localStorage.setItem(filterKey(userId), JSON.stringify(state)); } catch { /* quota */ }
}

export function clearRecruitingFilters(userId?: string | null) {
  if (!userId || typeof localStorage === "undefined") return;
  try { localStorage.removeItem(filterKey(userId)); } catch { /* ignore */ }
}

const num = (v: string) => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : undefined;
};
const str = (v: string) => (v.trim() ? v.trim() : undefined);

export function toRecruitingFiltersPayload(state: RecruitingFilterState): RecruitingFilters {
  const out: RecruitingFilters = {
    industries: state.industries.length ? (state.industries as RecruitingFilters["industries"]) : undefined,
    subindustry: str(state.subindustry),
    radiusMiles: num(state.radiusMiles),
    hiringLocation: str(state.hiringLocation),
    companySize: str(state.companySize),
    jobTitles: str(state.jobTitles),
    roleFamilies: str(state.roleFamilies),
    seniority: str(state.seniority),
    employmentType: str(state.employmentType),
    workArrangement: str(state.workArrangement),
    signalType: state.signalType === "any" ? undefined : state.signalType,
    recencyDays: num(state.recencyDays),
    confidence: state.confidence === "any" ? undefined : state.confidence,
    minRelevantJobs: num(state.minRelevantJobs),
    openingBefore: str(state.openingBefore),
    serviceMatchOnly: state.serviceMatchOnly,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as RecruitingFilters;
}

/** Industry string sent to the generic search field for recruiting searches. */
export function recruitingIndustryParam(state: RecruitingFilterState): string {
  return state.industries.join(", ");
}

export const QUALIFICATION_FIELDS: { key: keyof RecruitingQualification; label: string; placeholder: string }[] = [
  { key: "roles", label: "Roles", placeholder: "Roles the employer is hiring for" },
  { key: "hiresNeeded", label: "Number of hires", placeholder: "As disclosed by the employer" },
  { key: "targetStartDates", label: "Target start dates and urgency", placeholder: "e.g. two CNC operators by June" },
  { key: "skillsCredentials", label: "Required skills and credentials", placeholder: "Licenses, certifications, tools" },
  { key: "shiftsLocations", label: "Shifts and locations", placeholder: "Sites, shifts, on-site or remote" },
  { key: "compensation", label: "Compensation range", placeholder: "Only if disclosed" },
  { key: "employmentType", label: "Employment type", placeholder: "Direct hire, temporary, contract, contract-to-hire" },
  { key: "currentApproach", label: "Current recruiting approach", placeholder: "Internal team, job boards, referrals" },
  { key: "currentAgencies", label: "Current agency relationships", placeholder: "Agencies already engaged" },
  { key: "hiringChallenges", label: "Hiring challenges", placeholder: "Stated by the employer" },
  { key: "vendorRequirements", label: "Vendor requirements", placeholder: "Insurance, MSA, VMS, compliance" },
  { key: "budget", label: "Budget", placeholder: "Fee expectations or budget" },
  { key: "decisionProcess", label: "Decision process", placeholder: "Who approves staffing vendors" },
  { key: "agencyRenewalDates", label: "Agency agreement renewal or expiration", placeholder: "Dates for existing agreements" },
];

/** Keep only non-empty trimmed values so empty fields do not overwrite. */
export function cleanQualification(q: RecruitingQualification): RecruitingQualification {
  const out: RecruitingQualification = {};
  for (const { key } of QUALIFICATION_FIELDS) {
    const v = q[key]?.trim();
    if (v) out[key] = v.slice(0, 2000);
  }
  return out;
}

/**
 * Collapse syndicated listings: employer + requisition ID when present,
 * otherwise employer + title + location. Never multiplies hires.
 */
export function dedupeJobs(jobs: RecruitingJob[]): RecruitingJob[] {
  const seen = new Map<string, RecruitingJob>();
  for (const job of jobs) {
    const norm = (s?: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const key = job.requisitionId
      ? `${norm(job.employer)}|req:${norm(job.requisitionId)}`
      : `${norm(job.employer)}|${norm(job.title)}|${norm(job.location)}`;
    const prior = seen.get(key);
    if (!prior || (prior.lastVerifiedAt || "") < (job.lastVerifiedAt || "")) seen.set(key, job);
  }
  return [...seen.values()];
}

export function postingAgeLabel(postedAt?: string | null, now = Date.now()): string {
  if (!postedAt) return "Posting age unknown";
  const t = new Date(postedAt).getTime();
  if (Number.isNaN(t)) return "Posting age unknown";
  const days = Math.max(0, Math.floor((now - t) / 86_400_000));
  return days === 0 ? "Posted today" : `Posted ${days} day${days === 1 ? "" : "s"} ago`;
}

export const GROWTH_TYPE_LABELS: Record<string, string> = {
  expansion: "Expansion",
  relocation: "Relocation",
  new_company: "New company",
  new_location: "New location of existing company",
  formation: "Business formation (early growth signal)",
};

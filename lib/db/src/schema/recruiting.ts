export interface RecruitingJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  roleFamily: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  department: string | null;
  seniority: string | null;
  salary: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastVerifiedAt: string;
  status: "active" | "closed" | "unknown";
  sourceURL: string;
  evidence: string;
  requisitionId: string | null;
  urgent: boolean;
  verifiedReposting: boolean;
  hiringQuantity: number | null;
  noAgencies: boolean;
  agencyPolicyEvidence: string | null;
}

export interface RecruitingGrowthSignal {
  type: "expansion" | "relocation" | "new_company" | "new_location" | "formation";
  title: string;
  location: string;
  announcementDate: string | null;
  expectedOpeningDate: string | null;
  hiringPlans: string | null;
  confirmedHiring: boolean;
  sourceURL: string;
  evidence: string;
}

export interface RecruitingResearch {
  employerIdentity: "confirmed" | "unverified" | "agency_unidentified";
  jobs: RecruitingJob[];
  growthSignals: RecruitingGrowthSignal[];
  coverage: Array<{
    source: string;
    status: "available" | "partial" | "unavailable";
    detail: string;
    lastSuccessfulResearch: string | null;
  }>;
  lastSuccessfulResearch: string;
  uniqueActiveJobs: number;
  automationSuppressed: boolean;
  suppressionReasons: string[];
  commercialFit: number;
  evidenceConfidence: "high" | "medium" | "low";
}

/** Disclosed employer facts, entered by the salesperson or scheduling prospect. */
export interface RecruitingQualification {
  roles?: string;
  hiresNeeded?: string;
  targetStartDates?: string;
  skillsCredentials?: string;
  shiftsLocations?: string;
  compensation?: string;
  employmentType?: string;
  currentApproach?: string;
  currentAgencies?: string;
  hiringChallenges?: string;
  vendorRequirements?: string;
  budget?: string;
  decisionProcess?: string;
  agencyRenewalDates?: string;
}

import crypto from "node:crypto";
import type { RecruitingGrowthSignal, RecruitingJob, RecruitingResearch } from "@workspace/db";

export const RECRUITING_INDUSTRIES = [
  "Healthcare", "Oil & Gas", "Technology", "Financial Services", "Engineering",
  "Manufacturing", "Logistics & Warehousing",
] as const;

const text = (value: unknown, max = 1500): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
const nullableText = (value: unknown) => text(value) || null;
const identity = (value: string) => value.toLowerCase()
  .replace(/\b(?:incorporated|inc|llc|ltd|corp|corporation|company|co)\b/g, "")
  .replace(/[^a-z0-9]/g, "");
const agencyRestriction = (evidence: string) =>
  /\b(?:no (?:recruitment |staffing |recruiting )?agenc(?:y|ies)|no unsolicited (?:resumes|résumés)|(?:do not|not) accept unsolicited (?:resumes|résumés)|agenc(?:y|ies).{0,35}(?:not accepted|do not|not permitted))\b/i.test(evidence);
const date = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    && Date.parse(value) <= Date.now()
    ? new Date(value).toISOString() : null;
const futureDate = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;

/** These known board/search URLs identify a list, not an individual opening. */
function isJobBoardOverview(value: string): boolean {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "jobs.boeing.com") return /^(?:location|search-jobs)$/.test(parts[0] ?? "");
    if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) return parts.length < 2;
    if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) {
      return !(parts[1] === "jobs" && /^\d+$/.test(parts[2] ?? ""));
    }
  } catch { /* Invalid URLs cannot become validated source URLs. */ }
  return false;
}
function canonicalUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

export const RECRUITING_RESEARCH_INSTRUCTIONS = `
RECRUITING & STAFFING EMPLOYER RESEARCH:
The seller is a recruiter selling only its approved services to employers, never candidates.
Keep the employer's industry separate from role families: a developer at a manufacturer is Manufacturing.
Engineering is a broad employer category including engineering consultancies, design/build firms,
and multidisciplinary building, infrastructure, construction or energy-services firms whose own
cited offerings include engineering. It is not limited to engineering product companies.
An engineering job title alone does not place a real-estate, finance or unrelated employer in Engineering.
Determine employer identity independently from whether its industry matches the selected filter.
Search public employer careers pages, accessible ATS listings, general and industry job boards,
plus company/news announcements. Do not claim exhaustive coverage or access to licensed databases.
Exclude agencies advertising unnamed clients; never identify the agency as the hiring employer.
Return multiple relevant jobs (up to 40) with verbatim evidence, employer identity, job location,
role family, work arrangement, employment type, department, seniority, published salary,
requisition ID, published posting date or null, and active/closed/unknown status.
Unknown posting age must stay unknown. A listing's age does not prove difficulty filling it.
Only call urgency or reposting verified when the source explicitly establishes it.
One listing is one unique opening, NOT a stated number of hires unless explicitly published.
Capture no-agencies / no-unsolicited-resumes instructions as agencyPolicyEvidence verbatim.
Research expansions, relocations, new companies and new operating locations. Distinguish
new company from new location; formation alone is an early signal, not hiring demand.
Relocation alone is NOT new hiring. Set confirmedHiring only with explicit hiring evidence.
Job ads are NOT proof of willingness to use an external recruiter.
Do not claim candidates, placements, speed, success rates, guarantees, or services not in the approved catalog.
Only cite URLs present in the web-search results or supplied official-site evidence.
In addition to the normal JSON research report, include this top-level "recruiting" object:
{
 "employerIdentity":"confirmed|unverified|agency_unidentified",
 "agencyPolicies":[{"sourceURL":"","evidence":"verbatim explicit employer no-agencies policy, including a careers-page policy when there are no current jobs"}],
 "jobs":[{"title":"","employer":"exact hiring employer name","location":"","roleFamily":null,
 "workArrangement":null,"employmentType":null,"department":null,"seniority":null,"salary":null,
 "postedAt":null,"status":"active|closed|unknown","sourceURL":"","evidence":"verbatim source excerpt",
 "requisitionId":null,"urgent":false,"verifiedReposting":false,"hiringQuantity":null,
 "agencyPolicyEvidence":null}],
 "growthSignals":[{"type":"expansion|relocation|new_company|new_location|formation",
 "title":"","location":"","announcementDate":null,"expectedOpeningDate":null,
 "hiringPlans":null,"confirmedHiring":false,"sourceURL":"","evidence":"verbatim source excerpt"}]
}
Use Industry Hiring Challenges, Prospect Hiring Needs, and Recommended Recruiting Solutions & Outreach
as the conceptual three sections. Tie every recommendation to an exact approved offeringId.
`;

/** Deduplicate syndicated listings without inflating either vacancies or hiring quantities. */
export function deduplicateRecruitingJobs(jobs: RecruitingJob[]): RecruitingJob[] {
  const results: RecruitingJob[] = [];
  for (const job of jobs) {
    const duplicate = results.find(existing =>
      identity(existing.employer) === identity(job.employer)
      && identity(existing.location) === identity(job.location)
      && (
        (existing.requisitionId && job.requisitionId
          ? existing.requisitionId.toLowerCase() === job.requisitionId.toLowerCase()
          : identity(existing.title) === identity(job.title))
        || canonicalUrl(existing.sourceURL) === canonicalUrl(job.sourceURL)
      ));
    if (!duplicate) { results.push({ ...job }); continue; }
    duplicate.noAgencies ||= job.noAgencies;
    duplicate.agencyPolicyEvidence ||= job.agencyPolicyEvidence;
    duplicate.requisitionId ||= job.requisitionId;
    // Conservative conflict resolution: a verified closed copy must not count as active demand.
    if (job.status === "closed") duplicate.status = "closed";
    if (Date.parse(job.firstSeenAt) < Date.parse(duplicate.firstSeenAt)) duplicate.firstSeenAt = job.firstSeenAt;
  }
  return results;
}

/** Preserve trusted discovery evidence without promoting it to verified hiring.
 * A successful-but-incomplete research response must not erase sourced jobs.
 */
export function preserveDiscoveredHiring(
  research: RecruitingResearch,
  discovered: RecruitingJob[],
  companyName: string,
): RecruitingResearch {
  const pending = discovered.filter(job => identity(job.employer) === identity(companyName))
    .map(job => ({ ...job, status: "unknown" as const }));
  // Verified dispositions come first, so an unknown discovery copy cannot
  // overwrite a verified active/closed result. Deduplication preserves policies.
  const jobs = deduplicateRecruitingJobs([...research.jobs, ...pending]);
  const restricted = jobs.some(job => job.noAgencies && job.status !== "closed");
  return {
    ...research, jobs,
    uniqueActiveJobs: jobs.filter(job => job.status === "active").length,
    automationSuppressed: research.automationSuppressed || restricted,
    suppressionReasons: restricted
      ? [...new Set([...research.suppressionReasons,
          "A sourced opportunity explicitly says no agencies or no unsolicited resumes. Automated pitches are paused pending review."])]
      : research.suppressionReasons,
  };
}

export function parseRecruitingResearch(
  raw: any,
  options: {
    companyName: string;
    website?: string | null;
    allowedSourceUrls: string[];
    identityVerified: boolean;
    prior?: RecruitingResearch;
  },
): RecruitingResearch {
  const now = new Date().toISOString();
  const allowed = new Set(options.allowedSourceUrls.map(canonicalUrl).filter(Boolean));
  const validatedUrl = (value: unknown) => {
    const url = canonicalUrl(value);
    return url && allowed.has(url) ? url : null;
  };
  const employerIdentity = raw?.employerIdentity === "agency_unidentified"
    ? "agency_unidentified"
    : raw?.employerIdentity === "confirmed" && options.identityVerified ? "confirmed" : "unverified";
  const agencyPolicies: Array<{ sourceURL: string; evidence: string }> = (Array.isArray(raw?.agencyPolicies) ? raw.agencyPolicies : []).flatMap((item: any) => {
    const sourceURL = validatedUrl(item?.sourceURL);
    const evidence = text(item?.evidence, 1200);
    return sourceURL && agencyRestriction(evidence) ? [{ sourceURL, evidence }] : [];
  });
  const jobs: RecruitingJob[] = [];
  for (const item of Array.isArray(raw?.jobs) ? raw.jobs.slice(0, 100) : []) {
    const sourceURL = validatedUrl(item?.sourceURL);
    const title = text(item?.title, 240);
    const employer = text(item?.employer, 240);
    const evidence = text(item?.evidence, 2200);
    if (!sourceURL || !title || !evidence || identity(employer) !== identity(options.companyName)) continue;
    const location = text(item?.location, 240) || "Location not published";
    const policy = nullableText(item?.agencyPolicyEvidence);
    const noAgencies = agencyRestriction(`${policy ?? ""} ${evidence}`);
    const id = crypto.createHash("sha256")
      .update(`${identity(employer)}|${identity(title)}|${identity(location)}|${identity(text(item?.requisitionId))}`).digest("hex").slice(0, 18);
    const prior = options.prior?.jobs.find(job => job.id === id);
    jobs.push({
      id, title, employer, location,
      roleFamily: nullableText(item?.roleFamily),
      workArrangement: nullableText(item?.workArrangement),
      employmentType: nullableText(item?.employmentType),
      department: nullableText(item?.department),
      seniority: nullableText(item?.seniority),
      salary: nullableText(item?.salary),
      postedAt: date(item?.postedAt),
      firstSeenAt: prior?.firstSeenAt || now,
      lastVerifiedAt: now,
      status: item?.status === "active" && employerIdentity === "confirmed" && !isJobBoardOverview(sourceURL)
        ? "active" : item?.status === "closed" ? "closed" : "unknown",
      sourceURL, evidence,
      requisitionId: nullableText(item?.requisitionId),
      urgent: item?.urgent === true && /\b(?:urgent|urgently|immediate(?:ly)?|asap)\b/i.test(evidence),
      verifiedReposting: item?.verifiedReposting === true && /\b(?:reposted|re-posted|reopened)\b/i.test(evidence),
      hiringQuantity: Number.isInteger(item?.hiringQuantity) && item.hiringQuantity > 0
        && new RegExp(`\\b${item.hiringQuantity}\\s+(?:hires|positions|openings|people|employees|workers)\\b`, "i").test(evidence)
        ? item.hiringQuantity : null,
      noAgencies, agencyPolicyEvidence: noAgencies ? policy || evidence : null,
    });
  }
  const uniqueJobs = deduplicateRecruitingJobs(jobs);
  const growth: RecruitingGrowthSignal[] = [];
  const seenGrowth = new Set<string>();
  for (const item of Array.isArray(raw?.growthSignals) ? raw.growthSignals.slice(0, 40) : []) {
    const sourceURL = validatedUrl(item?.sourceURL);
    const title = text(item?.title, 240);
    const evidence = text(item?.evidence, 2200);
    if (!sourceURL || !title || !evidence
      || !["expansion", "relocation", "new_company", "new_location", "formation"].includes(item?.type)) continue;
    const location = text(item?.location, 240) || "Location not verified";
    const key = `${item.type === "formation" ? "formation" : "growth"}|${identity(location)}|${date(item?.announcementDate) || "undated"}`;
    if (seenGrowth.has(key)) continue;
    seenGrowth.add(key);
    const plans = nullableText(item?.hiringPlans);
    const hiring = item.type !== "formation" && item.confirmedHiring === true && Boolean(plans)
      && /\b(?:hir(?:e|es|ing)|recruit(?:ing)?|jobs|positions|employees|workforce)\b/i.test(evidence);
    growth.push({
      type: item.type, title, location, sourceURL, evidence,
      announcementDate: date(item?.announcementDate),
      expectedOpeningDate: futureDate(item?.expectedOpeningDate),
      hiringPlans: plans, confirmedHiring: hiring && employerIdentity === "confirmed",
    });
  }
  const suppressionReasons = [
    ...agencyPolicies.map(policy => `Employer agency policy: ${policy.evidence} Source: ${policy.sourceURL}`),
    ...(employerIdentity !== "confirmed" ? ["The end hiring employer has not been verified."] : []),
    ...(uniqueJobs.some(job => job.noAgencies && job.status !== "closed")
      ? ["A sourced opportunity explicitly says no agencies or no unsolicited resumes. Automated pitches are paused pending review."] : []),
  ];
  const sourceUrls = [...allowed].filter((url): url is string => Boolean(url));
  const categories = [
    { source: "Employer career pages", urls: sourceUrls.filter(url => {
      try { return options.website && new URL(url).hostname.replace(/^www\./, "") === new URL(options.website).hostname.replace(/^www\./, ""); }
      catch { return false; }
    }) },
    { source: "Public ATS listings", urls: sourceUrls.filter(url => /greenhouse|lever\.co|workday|ashbyhq|smartrecruiters|icims|bamboohr|jobvite|recruitee/i.test(url)) },
    { source: "General job boards", urls: sourceUrls.filter(url => /indeed|linkedin|glassdoor|ziprecruiter|monster/i.test(url)) },
    { source: "Industry boards and business announcements", urls: sourceUrls.filter(url => !/indeed|linkedin|glassdoor|ziprecruiter|monster|greenhouse|lever\.co|workday|ashbyhq/i.test(url)) },
  ];
  return {
    employerIdentity, jobs: uniqueJobs, growthSignals: growth,
    coverage: [
      ...categories.map(({ source, urls }) => ({
        source, status: urls.length ? "partial" as const : "unavailable" as const,
        detail: urls.length ? "Accessible cited pages only; not exhaustive source coverage."
          : "No citable source from this category was verified in this research run.",
        lastSuccessfulResearch: urls.length ? now : null,
      })),
      { source: "Licensed hiring-data providers", status: "unavailable", detail: "No licensed hiring-data feed is connected. Contact enrichment is separate.", lastSuccessfulResearch: null },
    ],
    lastSuccessfulResearch: now,
    uniqueActiveJobs: uniqueJobs.filter(job => job.status === "active").length,
    automationSuppressed: suppressionReasons.length > 0,
    suppressionReasons, commercialFit: 0,
    evidenceConfidence: employerIdentity === "confirmed"
      && (uniqueJobs.some(job => job.status === "active") || growth.some(signal => signal.confirmedHiring))
      ? "medium" : "low",
  };
}

export function recruitingAutomationBlocked(prospect: {
  vertical?: string | null;
  opportunityIntelligence?: { itResearch?: { recruiting?: RecruitingResearch } } | null;
}): boolean {
  const research = prospect.opportunityIntelligence?.itResearch?.recruiting;
  return prospect.vertical === "recruiting_staffing"
    && (!research || research.automationSuppressed || research.employerIdentity !== "confirmed");
}

import { isJobListingPage, safeJobSource } from "@workspace/db/job-posting-url";
import { useState } from "react";
import { AlertTriangle, Briefcase, Building, ChevronDown, ExternalLink, MapPin, ShieldOff, Signal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RecruitingResearch } from "@workspace/api-client-react";
import { dedupeJobs, GROWTH_TYPE_LABELS, postingAgeLabel } from "@/lib/recruiting";


function JobPostingLink({ job, sourceOnly = false }: { job: { id: string; title: string; location: string; sourceURL: string }; sourceOnly?: boolean }) {
  const href = safeJobSource(job.sourceURL);
  const label = `${job.title} · ${job.location}`;
  if (!href) return <span>{sourceOnly ? "Posting link unavailable" : label}</span>;
  if (isJobListingPage(href)) return <span>{!sourceOnly && <span>{label} — </span>}<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid={sourceOnly ? `link-job-source-${job.id}` : undefined}>Careers page <ExternalLink className="inline h-3 w-3" /></a><span className="text-muted-foreground"> (direct posting link not available)</span></span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid={sourceOnly ? `link-job-source-${job.id}` : undefined}>{sourceOnly ? "View job posting" : label} <ExternalLink className="inline h-3 w-3" /></a>;
}

const fmt = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString();
};

const IDENTITY_LABEL: Record<string, string> = {
  confirmed: "Employer confirmed",
  unverified: "Employer unverified",
  agency_unidentified: "Agency posting, end client unidentified",
};

/**
 * Hiring and growth evidence for one employer. Separates evidence confidence
 * from commercial fit, and shows source coverage without claiming completeness.
 */
export function RecruitingEvidenceView({
  research,
  employerIndustry,
  compact,
}: {
  research: RecruitingResearch;
  employerIndustry?: string | null;
  compact?: boolean;
}) {
  const [jobsOpen, setJobsOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);
  const jobs = dedupeJobs(research.jobs ?? []);
  const activeJobs = jobs.filter((j) => j.status === "active");
  const pendingJobs = jobs.filter((j) => j.status === "unknown");
  const closedJobs = jobs.filter((j) => j.status === "closed").length;
  const growth = research.growthSignals ?? [];
  const coverage = research.coverage ?? [];
  const unavailable = coverage.filter((c) => c.status === "unavailable");
  const lastRun = fmt(research.lastSuccessfulResearch);

  const summary = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" data-testid="badge-unique-jobs">{research.uniqueActiveJobs ?? activeJobs.length} unique active openings</Badge>
      {pendingJobs.length > 0 && <Badge variant="outline">{pendingJobs.length} sourced postings awaiting verification</Badge>}
      <Badge variant="outline" data-testid="badge-commercial-fit">Commercial fit: {research.commercialFit}</Badge>
      <Badge variant="outline" className="capitalize" data-testid="badge-evidence-confidence">Evidence confidence: {research.evidenceConfidence}</Badge>
      <Badge variant="outline" data-testid="badge-employer-identity">{IDENTITY_LABEL[research.employerIdentity] ?? research.employerIdentity}</Badge>
    </div>
  );

  const pendingEvidence = pendingJobs.length ? (
    <div className="rounded-md border p-3 text-xs space-y-2" data-testid="pending-job-evidence">
      <p className="font-medium">Postings found — verification pending</p>
      <p className="text-muted-foreground">These source links were found during job discovery. Current job status or employer verification is incomplete; this does not mean there are no openings. They do not qualify for automatic contact lookup.</p>
      {pendingJobs.map(job => (
        <div key={job.id}>
          <JobPostingLink job={job} />
          <p className="text-muted-foreground">Posting date: {fmt(job.postedAt) ?? "Unknown"} · Last checked: {fmt(job.lastVerifiedAt) ?? "Unknown"}</p>
        </div>
      ))}
    </div>
  ) : null;

  const suppression = research.automationSuppressed ? (
    <div className="rounded-md border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/10 dark:text-amber-300" data-testid="status-automation-suppressed">
      <p className="flex items-center gap-1.5 font-semibold"><ShieldOff className="h-3.5 w-3.5" /> Automated recruiting outreach suppressed</p>
      <ul className="mt-1 list-disc pl-4">
        {(research.suppressionReasons?.length ? research.suppressionReasons : ["The employer posted a no-agencies or no-unsolicited-resumes instruction."]).map((r, i) => <li key={i}>{r}</li>)}
      </ul>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="space-y-2" data-testid="section-recruiting-evidence-compact">
        {summary}
        {activeJobs.length > 0 && (
          <ul className="space-y-1 text-xs" data-testid="verified-job-links">
            {activeJobs.map(job => <li key={job.id}><JobPostingLink job={job} /></li>)}
          </ul>
        )}
        {pendingEvidence}
        {suppression}
      </div>
    );
  }

  return (
    <section className="space-y-3" data-testid="section-recruiting-evidence">
      {summary}
      {pendingEvidence}
      <p className="text-xs text-muted-foreground">
        Commercial fit reflects match to your confirmed services, industries, and territory. Evidence confidence reflects how well the hiring signals are verified. An active posting does not prove the employer wants an external recruiter.
      </p>
      {employerIndustry && (
        <p className="text-xs text-muted-foreground" data-testid="text-employer-industry">
          <span className="font-medium text-foreground">Employer industry:</span> {employerIndustry}. Role categories below describe job functions, not the employer's industry.
        </p>
      )}
      {suppression}

      <div className="rounded-lg border">
        <button type="button" onClick={() => setJobsOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold" data-testid="button-toggle-jobs" aria-expanded={jobsOpen}>
          <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /> Job postings ({jobs.length} unique{closedJobs ? `, ${closedJobs} closed` : ""})</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${jobsOpen ? "rotate-180" : ""}`} />
        </button>
        {jobsOpen && (
          <ul className="divide-y border-t">
            {jobs.length === 0 && <li className="p-3 text-xs text-muted-foreground">No citable job postings were retained by this research run. This does not establish that the employer has no openings.</li>}
            {jobs.map((job) => (
              <li key={job.id} className={`space-y-1 p-3 text-xs ${job.status === "closed" ? "opacity-60" : ""}`} data-testid={`row-job-${job.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{job.title}</span>
                  <Badge variant="outline" className="capitalize">{job.status === "unknown" ? "Verification pending" : job.status}</Badge>
                  {job.urgent && <Badge variant="outline" className="border-amber-300 text-amber-700">Explicitly urgent</Badge>}
                  {job.verifiedReposting && <Badge variant="outline">Verified reposting</Badge>}
                  {job.noAgencies && <Badge variant="outline" className="border-destructive/40 text-destructive">No agencies</Badge>}
                </div>
                <p className="flex flex-wrap gap-x-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>
                  {job.roleFamily && <span>Role category: {job.roleFamily}</span>}
                  {job.seniority && <span>{job.seniority}</span>}
                  {job.employmentType && <span>{job.employmentType}</span>}
                  {job.workArrangement && <span>{job.workArrangement}</span>}
                  {job.department && <span>Dept: {job.department}</span>}
                  {job.salary && <span>Salary: {job.salary}</span>}
                  {job.hiringQuantity != null && <span>Stated openings: {job.hiringQuantity}</span>}
                </p>
                <p className="text-muted-foreground">
                  {postingAgeLabel(job.postedAt)} · First seen {fmt(job.firstSeenAt) ?? "unknown"} · {job.status === "unknown" ? "Last checked" : "Last verified"} {fmt(job.lastVerifiedAt) ?? "unknown"}
                  {job.requisitionId ? ` · Req ${job.requisitionId}` : ""}
                </p>
                {job.evidence && <p className="text-foreground/80">{job.evidence}</p>}
                {job.agencyPolicyEvidence && <p className="text-destructive">{job.agencyPolicyEvidence}</p>}
                {job.sourceURL && (
                  <JobPostingLink job={job} sourceOnly />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border">
        <button type="button" onClick={() => setGrowthOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold" data-testid="button-toggle-growth" aria-expanded={growthOpen}>
          <span className="flex items-center gap-2"><Building className="h-4 w-4 text-primary" /> Growth signals ({growth.length})</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${growthOpen ? "rotate-180" : ""}`} />
        </button>
        {growthOpen && (
          <ul className="divide-y border-t">
            {growth.length === 0 && <li className="p-3 text-xs text-muted-foreground">No expansion, relocation, or new-business signals found.</li>}
            {growth.map((g, i) => (
              <li key={i} className="space-y-1 p-3 text-xs" data-testid={`row-growth-${i}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{g.title}</span>
                  <Badge variant="outline">{GROWTH_TYPE_LABELS[g.type] ?? g.type}</Badge>
                  <Badge variant="outline" className={g.confirmedHiring ? "border-green-300 text-green-700" : "text-muted-foreground"}>
                    {g.confirmedHiring ? "Announced hiring" : "Inferred staffing need"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {g.location} · Announced {fmt(g.announcementDate) ?? "date unknown"}{g.expectedOpeningDate ? ` · Expected opening ${fmt(g.expectedOpeningDate)}` : ""}
                </p>
                {g.hiringPlans && <p>Stated hiring plans: {g.hiringPlans}</p>}
                {g.evidence && <p className="text-foreground/80">{g.evidence}</p>}
                {g.sourceURL && <a href={g.sourceURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Source <ExternalLink className="h-3 w-3" /></a>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs" data-testid="section-source-coverage">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><Signal className="h-3.5 w-3.5 text-primary" /> Source coverage</p>
        <p className="mb-2 text-muted-foreground">Coverage is limited to connected sources; not every job site is searched.{lastRun ? ` Last successful research: ${lastRun}.` : ""}</p>
        <ul className="space-y-1">
          {coverage.map((c, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <span className="font-medium">{c.source}</span>
              <span className={c.status === "available" ? "text-green-700" : c.status === "partial" ? "text-amber-700" : "text-muted-foreground"}>{c.status}</span>
              {c.detail && <span className="text-muted-foreground">{c.detail}</span>}
              {c.lastSuccessfulResearch && <span className="text-muted-foreground">({fmt(c.lastSuccessfulResearch)})</span>}
            </li>
          ))}
        </ul>
        {unavailable.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Unavailable: {unavailable.map((u) => u.source).join(", ")}</p>
        )}
      </div>
    </section>
  );
}

import type { RecruitingJob, RecruitingResearch } from "@workspace/db";
import { parseRecruitingResearch } from "./recruitingResearch";

/** Only public, published-posting endpoints on fixed provider hosts. */
function postingEndpoint(source: string) {
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.username || url.password) return;
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.hostname === "jobs.lever.co" && /^[a-z0-9_-]+$/i.test(parts[0] ?? "")
      && /^[a-f0-9-]{36}$/i.test(parts[1] ?? "")) {
      return { kind: "lever", id: parts[1], url: `https://api.lever.co/v0/postings/${parts[0]}/${parts[1]}` };
    }
    if (["job-boards.greenhouse.io", "boards.greenhouse.io"].includes(url.hostname)
      && /^[a-z0-9_-]+$/i.test(parts[0] ?? "") && parts[1] === "jobs" && /^\d+$/.test(parts[2] ?? "")) {
      return { kind: "greenhouse", id: parts[2], url: `https://boards-api.greenhouse.io/v1/boards/${parts[0]}/jobs/${parts[2]}` };
    }
  } catch { /* Unsupported sources remain pending, not closed. */ }
  return undefined;
}

function plain(value: unknown): string {
  return typeof value === "string" ? value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim() : "";
}

async function verifyJob(job: RecruitingJob, companyName: string): Promise<RecruitingJob> {
  const endpoint = postingEndpoint(job.sourceURL);
  if (!endpoint || job.status === "closed") return job;
  const pending = { ...job, status: "unknown" as const };
  try {
    const response = await fetch(endpoint.url, {
      signal: AbortSignal.timeout(6_000), redirect: "error", headers: { Accept: "application/json" },
    });
    // An unavailable source is not proof of closure.
    if (!response.ok) return pending;
    const body = await response.text();
    if (body.length > 1_000_000) return pending;
    const raw = JSON.parse(body);
    if (String(raw.id) !== endpoint.id) return pending;
    const title = plain(endpoint.kind === "lever" ? raw.text : raw.title);
    const location = plain(endpoint.kind === "lever" ? raw.categories?.location : raw.location?.name);
    if (!title || !location) return pending;
    const content = endpoint.kind === "lever"
      ? [raw.descriptionPlain, raw.additionalPlain,
          ...(Array.isArray(raw.lists) ? raw.lists.map((list: any) => `${plain(list.text)} ${plain(list.content)}`) : [])]
        .map(plain).filter(Boolean).join(" ")
      : plain(raw.content);
    // Inspect the full bounded response for restrictions before trimming evidence.
    const restriction = content.match(/[^.!?]*(?:no (?:recruitment |recruiting |staffing )?agenc(?:y|ies)|no unsolicited|not accept unsolicited|do not accept unsolicited)[^.!?]*/i)?.[0];
    const verified = parseRecruitingResearch({
      employerIdentity: "confirmed", jobs: [{
        ...job, title, location, status: "active",
        evidence: `Published ${endpoint.kind === "lever" ? "Lever" : "Greenhouse"} posting: ${title}; ${location}. ${content}`.slice(0, 2200),
        agencyPolicyEvidence: job.agencyPolicyEvidence || restriction || null,
        // Preserve actual posting dates; ATS update dates are not posting dates.
        postedAt: job.postedAt,
      }],
    }, {
      companyName, identityVerified: true, allowedSourceUrls: [job.sourceURL],
      prior: { jobs: [job] } as RecruitingResearch,
    }).jobs[0];
    return verified ? { ...verified, noAgencies: verified.noAgencies || job.noAgencies } : pending;
  } catch {
    return pending;
  }
}

/** Confirm current posting publication independently of AI, only AFTER employer
 * identity is confirmed. This is not permission to use an agency or a new feed.
 */
export async function verifyPublishedAtsJobs(research: RecruitingResearch, companyName: string): Promise<RecruitingResearch> {
  if (research.employerIdentity !== "confirmed") return research;
  const jobs = research.jobs.map(job => ({ ...job }));
  // Bound public-source requests, with no more than three in flight per employer.
  const supported = jobs.map((job, index) => ({ job, index }))
    .filter(({ job }) => job.status !== "closed" && postingEndpoint(job.sourceURL)).slice(0, 8);
  for (let offset = 0; offset < supported.length; offset += 3) {
    await Promise.all(supported.slice(offset, offset + 3).map(async ({ job, index }) => {
      jobs[index] = await verifyJob(job, companyName);
    }));
  }
  const restricted = jobs.some(job => job.noAgencies && job.status !== "closed");
  return {
    ...research, jobs, uniqueActiveJobs: jobs.filter(job => job.status === "active").length,
    evidenceConfidence: jobs.some(job => job.status === "active") ? "medium" : research.evidenceConfidence,
    automationSuppressed: research.automationSuppressed || restricted,
    suppressionReasons: restricted ? [...new Set([...research.suppressionReasons,
      "A sourced opportunity explicitly says no agencies or no unsolicited resumes. Automated pitches are paused pending review."])] : research.suppressionReasons,
  };
}

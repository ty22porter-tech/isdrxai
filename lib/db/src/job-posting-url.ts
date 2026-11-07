/** Identify known listing/search pages without inventing an individual job URL. */
export function isJobListingPage(value: string): boolean {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const path = url.pathname.toLowerCase().replace(/\/$/, "");
    // These parameters identify actual postings, including embedded ATS detail views.
    if (["gh_jid", "jobid", "job_id", "requisitionid", "jk"].some(key =>
      [...url.searchParams].some(([name, val]) => name.toLowerCase() === key && !!val.trim()))) return false;
    if (["jobs.lever.co", "jobs.eu.lever.co"].includes(url.hostname)) return parts.length < 2;
    if (["boards.greenhouse.io", "job-boards.greenhouse.io"].includes(url.hostname)) {
      return !(parts[1] === "jobs" && /^\d+$/.test(parts[2] ?? ""));
    }
    if (url.hostname.endsWith(".myworkdayjobs.com")) return !/\/job\//i.test(path);
    if (url.hostname === "jobs.boeing.com" && /^(?:location|search-jobs)$/.test(parts[0] ?? "")) return true;
    return !parts.length || /(?:^|\/)(?:careers?|jobs|job-openings|open-positions|opportunities|search|search-jobs|search-results|jobs-search)$/.test(path)
      || /\/jobs\/search\b/i.test(path);
  } catch { return true; }
}

export function safeJobSource(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

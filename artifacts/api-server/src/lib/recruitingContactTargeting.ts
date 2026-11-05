import type { RecruitingJob } from "@workspace/db";

export interface RecruitingContactMatch {
  kind: "department" | "talent_acquisition";
  department: string;
  openingTitles: string[];
  reason: string;
  locationMatch: boolean;
}

interface Department {
  name: string;
  jobs: RegExp;
  contacts: RegExp;
  titles: string[];
}

// Match the role, not the employer's sector. Infrastructure precedes general
// software engineering; specialized roles precede broad operations keywords.
const DEPARTMENTS: Department[] = [
  { name: "Infrastructure & Platform Engineering",
    jobs: /\b(sre|site reliability|infrastructure|platform|cloud|devops|network|systems administrator|cyber|security engineer)\b/i,
    contacts: /\b(sre|site reliability|infrastructure|platform|cloud|devops|network|information technology|it|security)\b/i,
    titles: ["director of infrastructure", "platform engineering manager", "site reliability engineering manager", "IT director", "IT manager"] },
  { name: "Software Engineering",
    jobs: /\b(software|developer|application|full.?stack|data engineer|machine learning|ai engineer)\b/i,
    contacts: /\b(software|engineering|technology|development|data)\b/i,
    titles: ["software engineering manager", "director of software engineering", "engineering manager", "vice president of engineering", "chief technology officer"] },
  { name: "Human Resources",
    jobs: /\b(human resources|people operations|talent acquisition|recruiter|hr)\b/i,
    contacts: /\b(human resources|people|hr|talent)\b/i,
    titles: ["human resources director", "HR manager", "head of people", "director of talent acquisition"] },
  { name: "Supply Chain & Procurement",
    jobs: /\b(supply chain|procurement|purchas|buyer|category manager|materials)\b/i,
    contacts: /\b(supply chain|procurement|purchas|materials|sourcing)\b/i,
    titles: ["supply chain director", "procurement director", "supply chain manager", "purchasing manager"] },
  { name: "Clinical & Nursing",
    jobs: /\b(nurs|rn\b|clinical|physician|pharmac|therapist|medical|patient)/i,
    contacts: /\b(nursing|clinical|medical|pharmacy|patient)\b/i,
    titles: ["director of nursing", "chief nursing officer", "clinical director", "pharmacy director", "nurse manager"] },
  { name: "Finance & Accounting",
    jobs: /\b(financ|accountan|compliance|credit|risk management|controller|audit)/i,
    contacts: /\b(financ|accounting|compliance|risk|controller|audit)/i,
    titles: ["finance director", "controller", "accounting manager", "chief financial officer", "compliance director"] },
  { name: "Manufacturing & Plant Operations",
    jobs: /\b(manufactur|machin|cnc|production|plant|quality engineer|assembly|maintenance)/i,
    contacts: /\b(manufactur|plant|production|operations|quality|maintenance)/i,
    titles: ["plant manager", "manufacturing manager", "production manager", "director of manufacturing", "operations director"] },
  { name: "Logistics & Warehouse Operations",
    jobs: /\b(warehouse|logistics|distribution|shipping|freight|driver)\b/i,
    contacts: /\b(warehouse|logistics|distribution|transport|operations)\b/i,
    titles: ["warehouse manager", "logistics director", "distribution manager", "logistics manager"] },
  { name: "Engineering",
    jobs: /\b(engineer|controls|automation|technical)\b/i,
    contacts: /\b(engineering|technical|automation)\b/i,
    titles: ["engineering manager", "director of engineering", "technical director"] },
  { name: "Sales",
    jobs: /\b(sales|account executive|business development)\b/i,
    contacts: /\b(sales|business development|commercial)\b/i,
    titles: ["sales director", "sales manager", "vice president of sales"] },
  { name: "Operations",
    jobs: /\b(operations|project manager)\b/i,
    contacts: /\b(operations|project|program)\b/i,
    titles: ["operations director", "operations manager", "project management director"] },
];

const leadership = /\b(manager|director|head|vp|vice president|chief|controller)\b/i;
const acquisition = /\b(talent acquisition|recruit(?:ing|ment|er)?|human resources|hr|people operations)\b/i;
export const RECRUITING_FALLBACK_TITLES = [
  "director of talent acquisition", "talent acquisition manager",
  "technical recruiter", "recruiting manager", "human resources director", "HR manager",
];

export function recruitingContactTargets(jobs: readonly RecruitingJob[]) {
  const active = jobs.filter(job => job.status === "active" && !job.noAgencies);
  const grouped = new Map<Department, RecruitingJob[]>();
  for (const job of active) {
    const department = DEPARTMENTS.find(d => d.jobs.test(job.title))
      ?? DEPARTMENTS.find(d => d.jobs.test(job.roleFamily ?? ""));
    if (department) grouped.set(department, [...(grouped.get(department) ?? []), job]);
  }
  // Cover up to three departments, with the most active roles first. Bound
  // provider search size and credit use even for a large employer.
  const groups = [...grouped].sort((a, b) => b[1].length - a[1].length).slice(0, 3);
  const cities = [...new Set(active.map(job => job.location.split(",")[0].trim().toLowerCase())
    .filter(city => city && !/remote|united states|nationwide/i.test(city)))];
  return {
    hasActiveJobs: active.length > 0,
    titles: [...new Set(groups.flatMap(([d]) => d.titles))],
    classify(title: string, fallback: boolean) {
      if (fallback) return acquisition.test(title) && (leadership.test(title) || /\brecruiter\b/i.test(title))
        ? "Talent Acquisition / HR" : undefined;
      // A technical recruiter belongs to the fallback tier, not Engineering.
      const hiringForHr = groups.some(([d]) => d.name === "Human Resources");
      return (!acquisition.test(title) || hiringForHr) && leadership.test(title)
        ? groups.find(([d]) => d.contacts.test(title))?.[0].name : undefined;
    },
    locationMatch(city: unknown) {
      return typeof city === "string" && cities.includes(city.trim().toLowerCase());
    },
    describe(department: string, fallback: boolean, city: unknown): RecruitingContactMatch {
      const relevant = fallback ? active : groups.find(([d]) => d.name === department)?.[1] ?? [];
      const openingTitles = [...new Set(relevant.map(job => job.title))].slice(0, 8);
      const locationMatch = typeof city === "string" && cities.includes(city.trim().toLowerCase());
      return {
        kind: fallback ? "talent_acquisition" : "department", department, openingTitles, locationMatch,
        reason: `${fallback ? "Likely recruiting contact; no reachable matching department leader was found" : `Likely ${department} contact based on their Apollo title`}. Related active openings: ${openingTitles.join("; ")}. ${locationMatch ? "Apollo contact city matches a hiring city." : "Hiring-site or business-unit responsibility is not confirmed."} Hiring authority is not confirmed.`,
      };
    },
  };
}

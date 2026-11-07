import type { OpportunityIntelligence } from "./schema/prospects";

export type RecruitingEmailRecipient = {
  opportunityIntelligence?: OpportunityIntelligence | null;
};

/** Shared by preview, template delivery, and AI prompts. Never infer jobs from notes. */
export function recruitingOpeningSummary(recipient: RecruitingEmailRecipient): string {
  const research = recipient.opportunityIntelligence?.itResearch?.recruiting;
  if (!research || research.employerIdentity !== "confirmed" || research.automationSuppressed) {
    return "I'd like to understand which roles, if any, your team is hiring for.";
  }
  const seen = new Set<string>();
  const roles = research.jobs.filter(job => job.status === "active" && !job.noAgencies
    && job.sourceURL && job.evidence && job.title.trim()).flatMap(job => {
    const role = `${job.title.trim()}${job.location?.trim() ? ` (${job.location.trim()})` : ""}`;
    const key = role.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [role];
  }).slice(0, 3);
  if (!roles.length) return "I'd like to understand which roles, if any, your team is hiring for.";
  return `Published openings identified in our research include ${roles.join("; ")}.`;
}

export function ensureRecruitingOpeningPlaceholder(body: string): string {
  if (body.includes("{{jobOpenings}}")) return body;
  const paragraphs = body.split(/\n\s*\n/);
  paragraphs.splice(paragraphs.length >= 3 ? 2 : paragraphs.length > 1 ? 1 : 0, 0, "{{jobOpenings}}");
  return paragraphs.join("\n\n");
}

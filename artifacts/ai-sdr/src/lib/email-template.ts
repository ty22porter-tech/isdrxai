import { recruitingOpeningSummary, type RecruitingEmailRecipient } from "@workspace/db/recruiting-email";
interface EmailRecipient extends RecruitingEmailRecipient {
  contactName?: string | null;
  companyName?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
}

/** Personalize drafts and repair full-name greetings in previously merged copy. */
export function mergeEmailTemplate(template: string, prospect: EmailRecipient): string {
  const fullName = prospect.contactName?.trim() ?? "";
  const firstName = fullName.split(/\s+/)[0] ?? "";
  let merged = template
    .replace(/\{\{contactName\}\}/g, () => firstName)
    .replace(/\{\{companyName\}\}/g, () => prospect.companyName ?? "")
    .replace(/\{\{city\}\}/g, () => prospect.city ?? "")
    .replace(/\{\{state\}\}/g, () => prospect.state ?? "")
    .replace(/\{\{jobOpenings\}\}/g, () => recruitingOpeningSummary(prospect))
    .replace(/\{\{industry\}\}/g, () => prospect.industry ?? "");

  if (fullName && fullName !== firstName) {
    const escapedName = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    merged = merged.replace(
      new RegExp(`(^|\\n)([\\t ]*(?:Hi|Hello|Dear|Hey)\\s+)${escapedName}(?=\\s*[,!])`, "gi"),
      (_match, start: string, greeting: string) => `${start}${greeting}${firstName}`,
    );
  }
  return merged;
}
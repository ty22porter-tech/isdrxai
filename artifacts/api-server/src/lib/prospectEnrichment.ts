import type { ApolloEnrichment, ApolloResult } from "./apollo";
import { isPlaceholderEmail } from "./apollo";

export interface EnrichmentProspect {
  id: number;
  clientId: string;
  companyName: string;
  contactName: string;
  email: string;
  title: string | null;
  linkedinUrl: string | null;
  phone: string;
  city: string;
  state: string;
  website: string | null;
  employeeCount: number | null;
  vertical: string | null;
}

export type ProspectEnrichmentUpdate = {
  contactName: string;
  email: string;
  title: string | null;
  linkedinUrl: string | null;
  phone: string;
  city: string;
  state: string;
  website: string | null;
  employeeCount: number | null;
  enrichedAt: Date;
};

const isPlaceholderPhone = (phone: string) =>
  !phone || /^\(?0{3}\)?[\s.-]?0{3}[\s.-]?0{4}$/.test(phone.trim());

const isPlaceholderContactName = (name: string) =>
  !name || name.trim() === "" || name.trim() === "Owner";

export function mergeApolloEnrichment(
  prospect: EnrichmentProspect,
  enrichment: ApolloEnrichment,
): ProspectEnrichmentUpdate {
  return {
    contactName: enrichment.contactName && isPlaceholderContactName(prospect.contactName)
      ? enrichment.contactName
      : prospect.contactName,
    email: enrichment.email && isPlaceholderEmail(prospect.email)
      ? enrichment.email
      : prospect.email,
    title: enrichment.title ?? prospect.title,
    linkedinUrl: enrichment.linkedinUrl ?? prospect.linkedinUrl,
    phone: enrichment.phone && isPlaceholderPhone(prospect.phone)
      ? enrichment.phone
      : prospect.phone,
    city: prospect.city || (enrichment.city ?? ""),
    state: prospect.state || (enrichment.state ?? ""),
    website: prospect.website ?? enrichment.website,
    employeeCount: prospect.employeeCount ?? enrichment.employeeCount,
    enrichedAt: new Date(),
  };
}

export async function runProspectEnrichment(options: {
  rows: EnrichmentProspect[];
  enrich: (prospect: EnrichmentProspect) => Promise<ApolloResult>;
  update: (prospect: EnrichmentProspect, values: ProspectEnrichmentUpdate) => Promise<void>;
  concurrency?: number;
}) {
  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  let planBlocked = false;
  const errors: string[] = [];
  const queue = [...options.rows];

  const processOne = async (prospect: EnrichmentProspect) => {
    if (planBlocked) return;
    const result = await options.enrich(prospect);
    if (!result.ok) {
      if (result.planBlocked) {
        planBlocked = true;
        if (!errors.includes(result.error)) errors.unshift(result.error);
        return;
      }
      failed++;
      if (errors.length < 5) errors.push(`${prospect.companyName}: ${result.error}`);
      return;
    }
    if (!result.person) {
      skipped++;
      return;
    }
    await options.update(prospect, mergeApolloEnrichment(prospect, result.person));
    enriched++;
  };

  await Promise.all(Array.from({ length: options.concurrency ?? 5 }, async () => {
    while (queue.length && !planBlocked) {
      const prospect = queue.shift();
      if (prospect) await processOne(prospect);
    }
  }));

  if (planBlocked) {
    return {
      enriched,
      skipped,
      failed: options.rows.length - enriched - skipped,
      planBlocked: true,
      errors: errors.slice(0, 1),
    };
  }
  return { enriched, skipped, failed, planBlocked: false, errors };
}
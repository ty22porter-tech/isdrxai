import type { SellerIntelligenceProfile, User } from "@workspace/db";

export interface SellerIntelligence {
  name?: string;
  services: string[];
  products: string[];
  capabilities: string[];
  differentiators: string[];
  certifications: string[];
  industriesServed: string[];
  outcomes: string[];
  problemsSolved: string[];
  proof: string[];
  portfolioExamples: string[];
  valuePropositions: string[];
  ctas: string[];
  ready: boolean;
}

const clean = (values: string[] | null | undefined) =>
  Array.isArray(values) ? values.map(value => value.trim()).filter(Boolean) : [];

export function sellerPriorityServices(user?: User | null): string[] {
  return (user?.sellerServicePriorities ?? "")
    .split(/[\n,;]+/)
    .map(value => value.trim())
    .filter(Boolean);
}

function prioritizeApprovedOffers(offers: string[], priorities: string[]): string[] {
  if (!priorities.length) return offers;
  const rank = (offer: string) => {
    const normalizedOffer = offer.toLowerCase();
    const index = priorities.findIndex(priority => {
      const normalizedPriority = priority.toLowerCase();
      return normalizedOffer.includes(normalizedPriority) || normalizedPriority.includes(normalizedOffer);
    });
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  return offers
    .map((offer, index) => ({ offer, index, rank: rank(offer) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ offer }) => offer);
}

/** Reads only a successfully analyzed, source-backed seller profile. */
export function sellerIntelligenceProfile(user?: User | null): SellerIntelligence {
  const profile = user?.sellerIntelligenceProfile as SellerIntelligenceProfile | null | undefined;
  // A Responses report can be fully source-backed while still needing a
  // human review of narrative depth (for example, no cited differentiator or
  // outcome). Evidence-backed offerings must remain usable for opportunity
  // recommendations in that state; requiring a separate manual approval
  // would discard the verified research we just paid to obtain.
  // Some older persisted profiles have the source-backed research payload but
  // were serialized through a schema that dropped researchStatus. The
  // researchGenerated snapshot is itself the server-produced evidence boundary
  // and is safe to use as the readiness signal in that case.
  const researchReady = profile?.researchStatus === "ready"
    || Boolean(profile?.researchGenerated && (
      profile.researchGenerated.sellerServices?.length
      || profile.researchGenerated.sellerProducts?.length
      || profile.researchGenerated.sellerCapabilities?.length
      || profile.researchGenerated.sellerValuePropositions?.length
    ));
  if (!profile || (profile.status !== "ready" && !researchReady)) {
    return {
      services: [], products: [], capabilities: [], differentiators: [],
      certifications: [], industriesServed: [], outcomes: [], problemsSolved: [],
      proof: [], portfolioExamples: [], valuePropositions: [], ctas: [], ready: false,
    };
  }
  // Service-priority preferences affect opportunity ordering, but they are not
  // approved seller capabilities. Read services from their factual source so
  // Older cached profiles cannot leak priority-only text into sales claims.
  const approvedServices = profile.userOverrides?.sellerServices
    ?? (researchReady ? profile.researchGenerated?.sellerServices : undefined)
    ?? profile.websiteGenerated?.sellerServices
    ?? profile.sellerServices;
  const approvedProducts = profile.userOverrides?.sellerProducts
    ?? (researchReady ? profile.researchGenerated?.sellerProducts : undefined)
    ?? profile.sellerProducts;
  const approvedCapabilities = profile.userOverrides?.sellerCapabilities
    ?? (researchReady ? profile.researchGenerated?.sellerCapabilities : undefined)
    ?? profile.sellerCapabilities;
  const approvedValuePropositions = profile.userOverrides?.sellerValuePropositions
    ?? (researchReady ? profile.researchGenerated?.sellerValuePropositions : undefined)
    ?? profile.sellerValuePropositions;
  const seller = {
    name: profile.sellerCompanyName?.trim() || user?.businessName?.trim() || undefined,
    services: clean(approvedServices),
    products: clean(approvedProducts),
    capabilities: clean(approvedCapabilities),
    differentiators: clean(profile.sellerDifferentiators),
    certifications: clean(profile.sellerCertifications),
    industriesServed: clean(profile.sellerIndustriesServed),
    outcomes: clean(profile.sellerBusinessOutcomes),
    problemsSolved: clean(profile.sellerProblemsSolved),
    proof: clean(profile.sellerProofPoints),
    portfolioExamples: clean(profile.sellerPortfolioExamples),
    valuePropositions: clean(approvedValuePropositions),
    ctas: clean(profile.sellerCTAs),
  };
  return {
    ...seller,
    ready: Boolean(seller.name && (
      seller.services.length ||
      seller.products.length ||
      seller.capabilities.length
    )),
  };
}

export function industryMatch(industry?: string | null, vertical?: string | null) {
  const label = industry?.trim() || "this industry";
  if (vertical === "recruiting_staffing") {
    return {
      label,
      operation: `${label} employers may have role-specific hiring needs; verify current openings and willingness to use outside recruiting support.`,
      challenges: ["confirming role requirements, placement type, territory and hiring timelines"],
      outreach: "Offer a hiring-needs discovery call only when verified seller capabilities match sourced employer needs.",
    };
  }
  if (vertical === "fleet_wraps") {
    return {
      label,
      operation: `${label} organizations may use customer-facing, field-service, delivery, or operational vehicles; whether this particular business does is unverified.`,
      challenges: ["vehicle identification", "brand consistency", "local mobile visibility"],
      outcome: "a more recognizable and consistent field presence",
    };
  }
  if (vertical === "it_services") {
    return {
      label,
      operation: `${label} organizations depend on technology, security, and support, but this company's systems, risks, vendors, and priorities are unverified.`,
      challenges: ["technology reliability", "security exposure", "support responsiveness"],
      outcome: "more reliable and secure business operations",
    };
  }
  return {
    label,
    operation: `${label} organizations often manage occupied or operational facilities, but this company's cleaning scope, schedule, and current provider are unverified.`,
    challenges: ["facility consistency", "cleaning coordination", "vendor responsiveness"],
    outcome: "a cleaner, more consistently supported facility",
  };
}

export function sellerContext(user: User | undefined, industry?: string | null, vertical?: string | null): string {
  const seller = sellerIntelligenceProfile(user);
  const priorities = sellerPriorityServices(user);
  const match = industryMatch(industry, vertical);
  const lines = [
    `PROSPECT INDUSTRY FRAMEWORK: ${match.operation}`,
    "Treat industry patterns as possible fit, never as verified facts about this prospect.",
  ];
  if ((vertical || user?.vertical) === "recruiting_staffing") {
    lines.push("RECRUITING SAFETY: Sell only confirmed recruiter capabilities to the hiring employer, not candidates. Never claim available candidates, placement results, delivery guarantees, an agency relationship or hiring difficulty without evidence. Job ads are not external-agency buying intent. Keep industry context conditional. CTA: hiring-needs discovery call or staffing consultation.");
  }
  if (!seller.ready) {
    if (priorities.length) {
      lines.push(`USER-PRIORITIZED SERVICES (discovery strategy only, not verified seller capabilities): ${priorities.join("; ")}`);
    }
    lines.push("SELLER INTELLIGENCE IS MISSING OR LIMITED: use a generic, discovery-led industry message. Do not invent the sender's services, products, capabilities, differentiators, certifications, clients, proof, outcomes, portfolio, pricing, or CTA.");
    return lines.join("\n");
  }
  lines.unshift(`SELLER COMPANY: ${seller.name}`);
  const add = (label: string, values: string[]) => {
    if (values.length) lines.push(`${label}: ${values.join("; ")}`);
  };
  add("SERVICES", seller.services);
  add("PRODUCTS", seller.products);
  add("CAPABILITIES", seller.capabilities);
  add("DIFFERENTIATORS", seller.differentiators);
  add("CERTIFICATIONS", seller.certifications);
  add("INDUSTRIES SERVED", seller.industriesServed);
  add("PROBLEMS SOLVED", seller.problemsSolved);
  add("BUSINESS OUTCOMES", seller.outcomes);
  add("VALUE PROPOSITIONS", seller.valuePropositions);
  add("PROOF POINTS (only these may be claimed)", seller.proof);
  add("PORTFOLIO EXAMPLES (only these may be claimed)", seller.portfolioExamples);
  add("CALLS TO ACTION", seller.ctas);
  if (priorities.length) {
    lines.push(`USER-PRIORITIZED SERVICES (use to rank relevant approved offers; do not treat this instruction itself as proof of a capability): ${priorities.join("; ")}`);
  }
  return lines.join("\n");
}

export function potentialNeedsForSeller(
  user: User | undefined,
  industry: string | null | undefined,
  vertical?: string | null,
): string[] {
  const seller = sellerIntelligenceProfile(user);
  const match = industryMatch(industry, vertical);
  if (!seller.ready) {
    return match.challenges.map(challenge =>
      `${challenge} → Confirm the prospect's situation before recommending a solution → Identify whether there is a real opportunity.`,
    );
  }
  const solutions = prioritizeApprovedOffers(
    [...seller.capabilities, ...seller.services, ...seller.products],
    sellerPriorityServices(user),
  );
  return match.challenges.map((challenge, index) => {
    const solution = solutions[index % solutions.length];
    const outcome = seller.outcomes[index % Math.max(1, seller.outcomes.length)] || match.outcome;
    return `${challenge} → If discovery confirms this opportunity, ${seller.name}'s ${solution} may be relevant → Potentially ${outcome}.`;
  });
}

export function genericOutreach(user: User | undefined, industry: string | null | undefined, vertical?: string | null) {
  const seller = sellerIntelligenceProfile(user);
  const match = industryMatch(industry, vertical);
  if (!seller.ready) {
    return `Lead with a discovery question about ${match.challenges[0]}; seller-specific capabilities are unavailable, so do not make a product claim.`;
  }
  const offer = prioritizeApprovedOffers(
    [...seller.capabilities, ...seller.services, ...seller.products],
    sellerPriorityServices(user),
  )[0];
  const outcome = seller.outcomes[0] || match.outcome;
  const cta = seller.ctas[0] || "ask whether a brief discovery conversation would be useful";
  return `Use a discovery-led question about ${match.challenges[0]}. If the prospect confirms it is a priority, ${seller.name}'s ${offer} may support ${outcome}; then ${cta}.`;
}
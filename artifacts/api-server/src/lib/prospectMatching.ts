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

/** Reads only a successfully analyzed, website-backed profile. */
export function sellerIntelligenceProfile(user?: User | null): SellerIntelligence {
  const profile = user?.sellerIntelligenceProfile as SellerIntelligenceProfile | null | undefined;
  if (!profile || profile.status !== "ready") {
    return {
      services: [], products: [], capabilities: [], differentiators: [],
      certifications: [], industriesServed: [], outcomes: [], problemsSolved: [],
      proof: [], portfolioExamples: [], valuePropositions: [], ctas: [], ready: false,
    };
  }
  // Service-priority preferences affect opportunity ordering, but they are not
  // approved seller capabilities. Read services from their factual source so
  // older cached profiles cannot leak priority-only text into sales claims.
  const approvedServices = profile.userOverrides?.sellerServices
    ?? profile.websiteGenerated?.sellerServices
    ?? profile.sellerServices;
  const seller = {
    name: profile.sellerCompanyName?.trim() || undefined,
    services: clean(approvedServices),
    products: clean(profile.sellerProducts),
    capabilities: clean(profile.sellerCapabilities),
    differentiators: clean(profile.sellerDifferentiators),
    certifications: clean(profile.sellerCertifications),
    industriesServed: clean(profile.sellerIndustriesServed),
    outcomes: clean(profile.sellerBusinessOutcomes),
    problemsSolved: clean(profile.sellerProblemsSolved),
    proof: clean(profile.sellerProofPoints),
    portfolioExamples: clean(profile.sellerPortfolioExamples),
    valuePropositions: clean(profile.sellerValuePropositions),
    ctas: clean(profile.sellerCTAs),
  };
  return {
    ...seller,
    ready: Boolean(seller.name && (
      seller.services.length ||
      seller.products.length ||
      seller.capabilities.length ||
      seller.valuePropositions.length
    )),
  };
}

export function industryMatch(industry?: string | null, vertical?: string | null) {
  const label = industry?.trim() || "this industry";
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
  const match = industryMatch(industry, vertical);
  const lines = [
    `PROSPECT INDUSTRY FRAMEWORK: ${match.operation}`,
    "Treat industry patterns as possible fit, never as verified facts about this prospect.",
  ];
  if (!seller.ready) {
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
  const solutions = [...seller.capabilities, ...seller.services, ...seller.products, ...seller.valuePropositions];
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
  const offer = seller.capabilities[0] || seller.services[0] || seller.products[0] || seller.valuePropositions[0];
  const outcome = seller.outcomes[0] || match.outcome;
  const cta = seller.ctas[0] || "ask whether a brief discovery conversation would be useful";
  return `Use a discovery-led question about ${match.challenges[0]}. If the prospect confirms it is a priority, ${seller.name}'s ${offer} may support ${outcome}; then ${cta}.`;
}
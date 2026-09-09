export interface IndustryProfile {
  label: string;
  painPoints: string[];
  challenges: string[];
  valueProps: string[];
  closingLine: string;
}

export const INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  "Healthcare": {
    label: "Healthcare",
    painPoints: [
      "keeping patient areas sterile and up to infection-control standards",
      "maintaining HIPAA-compliant cleaning protocols",
      "managing high-traffic restrooms and waiting rooms",
      "ensuring exam rooms are sanitized between patients",
    ],
    challenges: [
      "Infection control and pathogen prevention",
      "OSHA and Joint Commission cleanliness standards",
      "High patient volume creating rapid soil buildup",
    ],
    valueProps: [
      "hospital-grade disinfectants and EPA-approved cleaning agents",
      "staff trained in healthcare infection-control protocols",
      "flexible scheduling to avoid disrupting patient care",
    ],
    closingLine: "A clean facility isn't just good business — it directly affects patient outcomes and your inspection scores.",
  },
  "Technology": {
    label: "Technology",
    painPoints: [
      "keeping open-plan offices clean with high employee density",
      "managing shared kitchen and break room areas",
      "maintaining a professional appearance for client visits",
      "after-hours cleaning without interrupting late-working engineers",
    ],
    challenges: [
      "Open-floor plans collect dust and allergens quickly",
      "Frequent client and investor visits demand a polished look",
      "Dense workstations and equipment require careful cleaning",
    ],
    valueProps: [
      "non-toxic, eco-friendly products safe around electronics",
      "flexible after-hours scheduling around your team's hours",
      "consistent day porter service for high-traffic areas",
    ],
    closingLine: "A spotless office signals the same attention to detail that goes into your product.",
  },
  "Legal": {
    label: "Legal",
    painPoints: [
      "maintaining a professional, client-ready office at all times",
      "keeping conference rooms impeccable for high-stakes meetings",
      "managing confidential document areas with trusted staff",
      "overnight cleaning to avoid disrupting attorney schedules",
    ],
    challenges: [
      "Client-facing spaces must always look flawless",
      "Confidentiality and security during cleaning hours",
      "High standards expected by partners and clients",
    ],
    valueProps: [
      "background-checked, bonded, and insured cleaning staff",
      "locked-door and after-hours cleaning protocols",
      "dedicated account manager for consistent quality",
    ],
    closingLine: "Your clients judge your firm the moment they walk through the door — we make sure that first impression counts.",
  },
  "Finance": {
    label: "Finance",
    painPoints: [
      "maintaining immaculate trading floors and executive suites",
      "managing secure cleaning around sensitive documents",
      "keeping client-facing areas polished for audits and visits",
      "consistent overnight cleaning without security disruptions",
    ],
    challenges: [
      "Regulatory audits require spotless, well-maintained facilities",
      "Security-sensitive areas need vetted cleaning personnel",
      "High-touch surfaces in trading environments need frequent disinfection",
    ],
    valueProps: [
      "bonded staff with background checks for secure environments",
      "documented cleaning logs for compliance and audit trails",
      "HEPA-filtered vacuums to protect air quality on trading floors",
    ],
    closingLine: "In financial services, every detail of your environment reflects your standards — let us protect that image.",
  },
  "Commercial Real Estate": {
    label: "Commercial Real Estate",
    painPoints: [
      "maintaining common areas and lobbies across multi-tenant buildings",
      "coordinating cleaning around tenant move-ins and move-outs",
      "keeping restrooms and elevators clean throughout business hours",
      "balancing janitorial costs across a property portfolio",
    ],
    challenges: [
      "Multi-tenant buildings create unpredictable foot traffic",
      "Common areas directly affect tenant retention and renewals",
      "Move-in/move-out turnovers require rapid deep cleaning",
    ],
    valueProps: [
      "portfolio pricing across multiple properties",
      "day porter services for lobbies and restrooms during peak hours",
      "rapid-response deep cleaning for turnovers and emergencies",
    ],
    closingLine: "Clean common areas keep tenants happy, reduce complaints, and directly support your lease renewal rates.",
  },
  "Logistics & Warehousing": {
    label: "Logistics & Warehousing",
    painPoints: [
      "keeping large warehouse floors and loading docks clean and safe",
      "OSHA compliance for slip-and-fall prevention",
      "managing restrooms and break rooms for large shift workforces",
      "industrial dust and debris buildup around equipment",
    ],
    challenges: [
      "OSHA floor cleanliness and slip-hazard compliance",
      "Large square footage requires efficient, scalable cleaning",
      "Shift-based workforces mean restrooms need frequent service",
    ],
    valueProps: [
      "industrial scrubbers and sweepers for large floor areas",
      "OSHA-compliant floor marking and cleaning documentation",
      "scalable teams that flex with your shift schedule",
    ],
    closingLine: "A clean warehouse is a safe warehouse — and it protects you from costly OSHA citations.",
  },
  "Manufacturing": {
    label: "Manufacturing",
    painPoints: [
      "managing industrial-grade cleaning around production equipment",
      "OSHA and ISO cleanliness standards on the production floor",
      "removing grease, oil, and chemical residue safely",
      "keeping employee break rooms and restrooms sanitary across shifts",
    ],
    challenges: [
      "Production floor debris and oil create slip hazards",
      "ISO and OSHA standards require documented cleaning protocols",
      "Heavy soiling demands industrial-grade equipment and products",
    ],
    valueProps: [
      "industrial degreasers and EPA-approved solvents",
      "cleaning schedules coordinated around production downtime",
      "documented logs for ISO 9001 and OSHA compliance",
    ],
    closingLine: "A clean production environment reduces equipment downtime, improves safety scores, and protects your certifications.",
  },
  "Education": {
    label: "Education",
    painPoints: [
      "keeping classrooms, hallways, and cafeterias sanitized for students",
      "preventing illness spread in high-density school environments",
      "managing restroom cleanliness throughout the school day",
      "meeting district hygiene standards and parent expectations",
    ],
    challenges: [
      "High student density spreads bacteria and viruses quickly",
      "Cafeterias and restrooms require multiple cleanings per day",
      "Budget constraints demand cost-effective, reliable service",
    ],
    valueProps: [
      "child-safe, non-toxic cleaning products",
      "flexible scheduling to clean during off-hours or school breaks",
      "electrostatic disinfecting for rapid whole-room sanitization",
    ],
    closingLine: "A cleaner school means fewer sick days for students and staff — and happier parents.",
  },
};

export const IT_INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  "Healthcare": {
    label: "Healthcare",
    painPoints: [
      "keeping patient data secure and HIPAA-compliant",
      "defending clinics against ransomware and phishing attacks",
      "managing tablets and mobile devices used in patient care",
      "keeping practice-management systems online during appointments",
    ],
    challenges: [
      "HIPAA-compliant cybersecurity and patient data protection",
      "Ransomware increasingly targeting medical practices",
      "Mobile Device Management for clinical tablets and phones",
    ],
    valueProps: [
      "24/7 managed security monitoring and incident response",
      "HIPAA-aligned security assessments and documentation",
      "Mobile Device Management for every device touching patient data",
    ],
    closingLine: "In healthcare, a single breach can cost millions and patient trust — proactive security is far cheaper than recovery.",
  },
  "Technology": {
    label: "Technology",
    painPoints: [
      "managing MS365 licenses and costs across a growing team",
      "meeting SOC2 and enterprise-customer security requirements",
      "securing a distributed, BYOD-heavy workforce",
      "getting fast IT support without a full in-house team",
    ],
    challenges: [
      "MS365 license sprawl and rising software costs",
      "Enterprise customers demanding proof of security posture",
      "Mobile Device Management across remote and hybrid teams",
    ],
    valueProps: [
      "MS365 license optimization that typically cuts costs 15-30%",
      "managed security services that satisfy SOC2 and vendor reviews",
      "MDM covering every laptop and phone your team uses",
    ],
    closingLine: "Your customers judge your security posture before they sign — we make sure it holds up.",
  },
  "Legal": {
    label: "Legal",
    painPoints: [
      "protecting privileged client communications and case files",
      "securing email against phishing and wire-fraud attempts",
      "managing MS365, encryption, and document systems properly",
      "supporting attorneys working from court, home, and office",
    ],
    challenges: [
      "Cybersecurity for privileged and confidential client data",
      "Email compromise and wire-fraud attempts targeting firms",
      "Mobile Device Management for attorneys on the move",
    ],
    valueProps: [
      "24/7 managed security monitoring for confidential data",
      "encrypted email and secure document management on MS365",
      "MDM that secures every device without slowing attorneys down",
    ],
    closingLine: "Client confidentiality is your license to practice — your IT should protect it as fiercely as you do.",
  },
  "Finance": {
    label: "Finance",
    painPoints: [
      "meeting regulatory cybersecurity and audit requirements",
      "protecting client financial data from breaches",
      "keeping MS365 licensing compliant and secure",
      "enforcing encryption on every employee device",
    ],
    challenges: [
      "Regulatory-grade cybersecurity and audit-ready documentation",
      "Continuous security monitoring and incident response",
      "Mobile Device Management enforcing encryption everywhere",
    ],
    valueProps: [
      "audit-ready security documentation and compliance reporting",
      "managed security services with 24/7 monitoring",
      "MS365 and device management built for regulated firms",
    ],
    closingLine: "Regulators and clients both expect airtight security — we help you prove it, not just claim it.",
  },
  "Commercial Real Estate": {
    label: "Commercial Real Estate",
    painPoints: [
      "supporting IT across multiple properties and site offices",
      "preventing wire-transfer fraud in property transactions",
      "keeping distributed property teams connected on MS365",
      "managing devices for agents and managers in the field",
    ],
    challenges: [
      "Managed IT across multiple properties and offices",
      "Wire-transfer fraud targeting real estate transactions",
      "Mobile Device Management for field teams",
    ],
    valueProps: [
      "one IT partner covering every property and site office",
      "email security that stops transaction fraud attempts",
      "MDM keeping field agents secure and productive",
    ],
    closingLine: "One fraudulent wire transfer can erase a year of commissions — the right IT partner is cheap insurance.",
  },
  "Logistics & Warehousing": {
    label: "Logistics & Warehousing",
    painPoints: [
      "managing scanners, tablets, and driver devices at scale",
      "keeping WMS and warehouse systems online around the clock",
      "protecting supply-chain and shipment data",
      "avoiding costly downtime from IT failures or attacks",
    ],
    challenges: [
      "Mobile Device Management for scanners and driver devices",
      "Uptime for warehouse management systems",
      "Cybersecurity protecting supply-chain data",
    ],
    valueProps: [
      "MDM built for rugged devices, scanners, and tablets",
      "proactive monitoring that catches issues before downtime",
      "managed security guarding operations against ransomware",
    ],
    closingLine: "Every hour of system downtime is trucks waiting and shipments missed — proactive IT keeps freight moving.",
  },
  "Manufacturing": {
    label: "Manufacturing",
    painPoints: [
      "protecting production systems from ransomware shutdowns",
      "separating OT and IT networks properly",
      "supporting both plant-floor and office systems",
      "managing shop-floor tablets and field-service devices",
    ],
    challenges: [
      "Ransomware halting production lines",
      "OT/IT network separation and security",
      "Managed IT spanning plant floor and front office",
    ],
    valueProps: [
      "managed security services that keep production running",
      "network segmentation protecting production systems",
      "one partner for plant-floor and office IT alike",
    ],
    closingLine: "A ransomware attack that stops your line costs more per hour than a year of managed security.",
  },
  "Education": {
    label: "Education",
    painPoints: [
      "protecting student data and staying FERPA-compliant",
      "managing classroom laptops and tablet carts",
      "stretching limited technology budgets",
      "administering MS365 education licensing across staff and students",
    ],
    challenges: [
      "Student data privacy (FERPA) and cybersecurity",
      "Mobile Device Management for classroom device fleets",
      "MS365 education licensing across staff and students",
    ],
    valueProps: [
      "MDM purpose-built for classroom laptop and tablet carts",
      "FERPA-aligned security and student data protection",
      "MS365 education licensing management that saves budget",
    ],
    closingLine: "Schools are now a top ransomware target — protecting student data protects your budget and your reputation.",
  },
};

const DEFAULT_PROFILE: IndustryProfile = {
  label: "Commercial",
  painPoints: [
    "maintaining a clean, professional environment for employees and clients",
    "managing restrooms, common areas, and workspaces at scale",
    "finding a reliable, consistent janitorial partner",
  ],
  challenges: [
    "Consistency and reliability from your cleaning provider",
    "Flexible scheduling around your business hours",
    "Cost-effective service without cutting corners",
  ],
  valueProps: [
    "background-checked, bonded, and insured staff",
    "flexible scheduling 7 days a week",
    "dedicated account manager and satisfaction guarantee",
  ],
  closingLine: "A cleaner workplace means happier employees, better client impressions, and a healthier bottom line.",
};

const DEFAULT_IT_PROFILE: IndustryProfile = {
  label: "Commercial",
  painPoints: [
    "keeping systems secure against ransomware and phishing",
    "getting fast, reliable IT support when something breaks",
    "managing MS365 licenses and devices across the team",
  ],
  challenges: [
    "Cybersecurity threats targeting small and mid-size businesses",
    "Slow response times from current IT support",
    "MS365 licensing costs and device management overhead",
  ],
  valueProps: [
    "24/7 managed security monitoring and fast helpdesk response",
    "MS365 license optimization and full Microsoft management",
    "Mobile Device Management for every laptop, phone, and tablet",
  ],
  closingLine: "Reliable, secure IT means fewer disruptions, lower risk, and a team that can focus on the business.",
};

const DEFAULT_FLEET_PROFILE: IndustryProfile = {
  label: "Commercial",
  painPoints: [
    "keeping commercial vehicles consistently branded",
    "making service vehicles recognizable in the local market",
    "coordinating graphics when vehicles are added or replaced",
  ],
  challenges: [
    "Inconsistent branding across vehicles",
    "Worn or outdated fleet graphics",
    "Missed mobile-advertising opportunities",
  ],
  valueProps: [],
  closingLine: "Confirm vehicle ownership, branding goals, and the current process before recommending a solution.",
};

const FLEET_INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  "Home Services": {
    label: "Home Services",
    painPoints: ["using customer-facing vehicles to build local visibility", "making technician arrivals look recognizable and professional", "keeping branding consistent across vehicle types"],
    challenges: ["Local brand visibility", "Professional technician arrival", "Fleet brand consistency"],
    valueProps: [],
    closingLine: "Confirm whether customer-facing vehicles are part of the operation before recommending a solution.",
  },
  HVAC: {
    label: "HVAC",
    painPoints: ["building recognition across a local service area", "presenting a professional technician arrival", "keeping service-vehicle branding consistent"],
    challenges: ["Local visibility", "Professional technician arrival", "Consistent fleet branding"],
    valueProps: [],
    closingLine: "Confirm whether service vehicles and local visibility are priorities before recommending a solution.",
  },
  Plumbing: {
    label: "Plumbing",
    painPoints: ["making service vehicles recognizable at customer properties", "building local visibility between jobs", "maintaining consistent vehicle branding"],
    challenges: ["Customer recognition", "Mobile local advertising", "Fleet brand consistency"],
    valueProps: [],
    closingLine: "Confirm the prospect's vehicle-branding process before recommending a solution.",
  },
  Roofing: {
    label: "Roofing",
    painPoints: ["building neighborhood visibility near active work", "making trucks and trailers recognizable at job sites", "keeping field branding consistent"],
    challenges: ["Neighborhood visibility", "Job-site exposure", "Truck-and-trailer consistency"],
    valueProps: [],
    closingLine: "Confirm vehicle types and job-site branding goals before recommending a solution.",
  },
  Electrical: {
    label: "Electrical",
    painPoints: ["making technician vehicles easy to identify", "presenting a professional field-service brand", "building local awareness"],
    challenges: ["Technician identification", "Professional field presence", "Local awareness"],
    valueProps: [],
    closingLine: "Confirm whether technician vehicles and field recognition matter before recommending a solution.",
  },
  Construction: {
    label: "Construction",
    painPoints: ["reinforcing the company brand across job sites", "coordinating graphics across trucks and trailers", "making field vehicles recognizable"],
    challenges: ["Job-site branding", "Fleet consistency", "Company recognition"],
    valueProps: [],
    closingLine: "Confirm field vehicle types and brand standards before recommending a solution.",
  },
  Landscaping: {
    label: "Landscaping",
    painPoints: ["building recognition along recurring neighborhood routes", "coordinating truck and trailer graphics", "making crews recognizable at customer properties"],
    challenges: ["Neighborhood visibility", "Truck-and-trailer consistency", "Local brand recognition"],
    valueProps: [],
    closingLine: "Confirm route vehicles and local-branding priorities before recommending a solution.",
  },
  "Pest Control": {
    label: "Pest Control",
    painPoints: ["making technician vehicles recognizable", "building awareness along recurring routes", "keeping service-vehicle branding consistent"],
    challenges: ["Technician recognition", "Recurring-route advertising", "Fleet consistency"],
    valueProps: [],
    closingLine: "Confirm recurring routes and technician-vehicle branding before recommending a solution.",
  },
  "Car Dealerships": {
    label: "Car Dealerships",
    painPoints: ["extending the dealership brand beyond the lot", "coordinating courtesy or promotional vehicle graphics", "keeping dealer-group branding consistent"],
    challenges: ["Promotional visibility", "Dealer-group consistency", "Service-vehicle identification"],
    valueProps: [],
    closingLine: "Confirm vehicle programs and dealer-group standards before recommending a solution.",
  },
  "Delivery & Logistics": {
    label: "Logistics / Delivery",
    painPoints: ["keeping multi-vehicle branding consistent", "making operating vehicles recognizable", "reproducing approved graphics when vehicles change"],
    challenges: ["Fleet consistency", "Route visibility", "Replacement vehicle branding"],
    valueProps: [],
    closingLine: "Confirm operating vehicles and replacement-branding needs before recommending a solution.",
  },
  Municipal: {
    label: "Municipalities",
    painPoints: ["making departments and field vehicles clear to the public", "coordinating approved municipal graphics", "reproducing graphics for replacement vehicles"],
    challenges: ["Fleet identification", "Department consistency", "Replacement graphics"],
    valueProps: [],
    closingLine: "Confirm department vehicle requirements and approval standards before recommending a solution.",
  },
  "Higher Education": {
    label: "Higher Education",
    painPoints: ["carrying campus standards across department vehicles", "making service vehicles easy to identify", "coordinating facilities, transportation, or promotional graphics"],
    challenges: ["Campus brand consistency", "Department identification", "Promotional visibility"],
    valueProps: [],
    closingLine: "Confirm campus vehicle use and institutional standards before recommending a solution.",
  },
};

export type ClientVertical = "janitorial" | "it_services" | "fleet_wraps";

export interface SellerFallbackProfile {
  status?: "ready" | "limited";
  websiteAnalysisStatus?: "ready" | "limited";
  sellerCompanyName?: string | null;
  sellerServices?: string[];
  sellerProducts?: string[];
  sellerCapabilities?: string[];
  sellerBusinessOutcomes?: string[];
  sellerValuePropositions?: string[];
  sellerCTAs?: string[];
}

function getSeller(profile?: SellerFallbackProfile | null) {
  const offers = [
    ...(profile?.sellerCapabilities ?? []),
    ...(profile?.sellerServices ?? []),
    ...(profile?.sellerProducts ?? []),
    ...(profile?.sellerValuePropositions ?? []),
  ].map(value => value.trim()).filter(Boolean);
  const ready = profile?.status === "ready" &&
    profile.websiteAnalysisStatus === "ready" &&
    Boolean(profile.sellerCompanyName?.trim()) &&
    offers.length > 0;
  return {
    ready,
    name: profile?.sellerCompanyName?.trim() || "the sender",
    offers,
    outcomes: (profile?.sellerBusinessOutcomes ?? []).map(value => value.trim()).filter(Boolean),
    ctas: (profile?.sellerCTAs ?? []).map(value => value.trim()).filter(Boolean),
  };
}

function getProfile(industry: string, vertical: ClientVertical = "janitorial"): IndustryProfile {
  if (vertical === "it_services") return IT_INDUSTRY_PROFILES[industry] ?? DEFAULT_IT_PROFILE;
  if (vertical === "fleet_wraps") return FLEET_INDUSTRY_PROFILES[industry] ?? DEFAULT_FLEET_PROFILE;
  return INDUSTRY_PROFILES[industry] ?? DEFAULT_PROFILE;
}

const WORDING: Record<ClientVertical, { serviceNoun: string; offer: string; offerAction: string }> = {
  janitorial: {
    serviceNoun: "janitorial services",
    offer: "complimentary walkthrough",
    offerAction: "do a complimentary walkthrough of",
  },
  it_services: {
    serviceNoun: "managed IT services",
    offer: "IT assessment",
    offerAction: "run an IT assessment for",
  },
  fleet_wraps: {
    serviceNoun: "fleet graphics and commercial vehicle wraps",
    offer: "fleet branding consultation",
    offerAction: "review the vehicle branding for",
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function contactFirstName(contactName?: string): string {
  return contactName?.trim().split(/\s+/)[0] ?? "{{contactName}}";
}

export function generateIntroEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
  city?: string;
}, vertical: ClientVertical = "janitorial", sellerProfile?: SellerFallbackProfile | null): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "", vertical);
  const painPoint = pick(p.painPoints);
  const seller = getSeller(sellerProfile);
  const company = prospect.companyName ?? "{{companyName}}";
  const contact = contactFirstName(prospect.contactName);
  const configuredMatch = seller.ready
    ? `${seller.name}'s ${seller.offers[0]} may be relevant if that challenge is confirmed.${seller.outcomes[0] ? ` The potential outcome is ${seller.outcomes[0]}.` : ""}`
    : "Seller-specific capabilities are not available yet, so the right first step is to understand the current approach before recommending a solution.";
  const cta = seller.ready && seller.ctas[0]
    ? seller.ctas[0]
    : `Would a brief conversation about how ${company} handles this today be useful?`;

  if (vertical === "fleet_wraps") {
    const city = prospect.city ?? "{{city}}";
    const openingByIndustry: Record<string, string> = {
      HVAC: `For HVAC operators, service vehicles can do more than move technicians between jobs—they can keep a brand visible throughout ${city}.`,
      Plumbing: `For plumbing operators, each service vehicle can reinforce the brand between customer visits throughout ${city}.`,
      Roofing: `For roofing companies, every truck or trailer at a job site can reinforce the brand in the ${city} neighborhoods where future customers are paying attention.`,
      Construction: `Every construction truck and trailer arriving at a ${city} job site can reinforce the same professional brand.`,
      Landscaping: `Landscaping crews typically travel through the ${city} neighborhoods and commercial properties their brands want to reach.`,
      "Pest Control": `Recurring pest-control service routes can create repeated opportunities to build recognition throughout ${city}.`,
    };
    const fleetOpening = openingByIndustry[prospect.industry ?? ""] ?? `If ${company} operates customer-facing vehicles in ${city}, those vehicles may be an underused brand asset.`;
    return {
      subject: `Making every ${company} vehicle work harder`,
      body: `Hi ${contactFirstName(prospect.contactName)},

${fleetOpening}

For ${p.label.toLowerCase()} organizations, ${painPoint} can affect how the business is recognized in the field. ${configuredMatch}

${cta}`,
    };
  }

  const subjectPrefix = vertical === "it_services"
    ? "Managed IT services"
    : "Janitorial services";
  const subject = `${subjectPrefix} for ${prospect.companyName ?? p.label + " businesses"} — quick question`;

  const body = `Hi ${contact},

${p.label} organizations often have to manage ${painPoint}. For ${company}, that is only an industry-fit hypothesis until it is confirmed.

${configuredMatch}

${cta}`;

  return { subject, body };
}

export function generateFollowUpEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
  city?: string;
}, vertical: ClientVertical = "janitorial", sellerProfile?: SellerFallbackProfile | null): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "", vertical);
  const seller = getSeller(sellerProfile);
  const company = prospect.companyName ?? "{{companyName}}";
  const challenge = pick(p.painPoints);
  const subject = vertical === "fleet_wraps"
    ? `A vehicle-branding question for ${company}`
    : `A quick question for ${company}`;
  const sellerMatch = seller.ready
    ? `${seller.name}'s ${seller.offers[0]} may be relevant if ${challenge} is an active priority.${seller.outcomes[0] ? ` A potential outcome is ${seller.outcomes[0]}.` : ""}`
    : `Before suggesting a solution, it would be useful to learn whether ${challenge} is actually a priority.`;
  const cta = seller.ready && seller.ctas[0]
    ? seller.ctas[0]
    : `Would a brief conversation about ${company}'s current approach be useful?`;
  const body = `Hi ${contactFirstName(prospect.contactName)},

For ${p.label.toLowerCase()} organizations, ${challenge} can be worth reviewing. ${sellerMatch}

${cta}`;

  return { subject, body };
}

export function generateBreakupEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
}, vertical: ClientVertical = "janitorial", sellerProfile?: SellerFallbackProfile | null): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "", vertical);
  const seller = getSeller(sellerProfile);
  const company = prospect.companyName ?? "{{companyName}}";

  const subject = `Last note — ${company}`;
  const body = `Hi ${contactFirstName(prospect.contactName)},

I'll close the loop after this note. ${p.label} organizations sometimes review ${p.painPoints[0]}, but whether that matters for ${company} is still unverified.

${seller.ready ? `If it becomes relevant, ${seller.name}'s ${seller.offers[0]} may be worth discussing.` : "I won't assume a specific solution without first understanding the need."}

If you would like to revisit it later, a reply is all it takes.`;

  return { subject, body };
}

export function generateEmailForStep(
  step: number,
  prospect: { contactName?: string; companyName?: string; industry?: string; city?: string },
  vertical: ClientVertical = "janitorial",
  sellerProfile?: SellerFallbackProfile | null,
): { subject: string; body: string } {
  if (step === 1) return generateIntroEmail(prospect, vertical, sellerProfile);
  if (step >= 7) return generateBreakupEmail(prospect, vertical, sellerProfile);
  return generateFollowUpEmail(prospect, vertical, sellerProfile);
}

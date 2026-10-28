export type Vertical = "janitorial" | "it_services" | "fleet_wraps" | "recruiting_staffing";

export function normalizeVertical(v?: string | null): Vertical {
  if (v === "it_services" || v === "fleet_wraps" || v === "recruiting_staffing") return v;
  return "janitorial";
}

export interface VerticalConfig {
  key: Vertical;
  label: string;
  /** e.g. "commercial cleaning services" — the thing being sold, lowercase noun phrase */
  serviceNoun: string;
  /** "a commercial janitorial company" / "a managed IT services provider" */
  senderDescriptor: string;
  /** Who the copywriter writes for */
  audience: string;
  /** "free walkthrough" / "free IT assessment" */
  offerName: string;
  /** CTA button label on scheduling emails */
  offerCtaLabel: string;
  /** Subject for the interested-reply scheduling email */
  offerSubject: (companyName: string) => string;
  /** Phrase used in the CAN-SPAM footer: "professional commercial cleaning services" */
  footerServicePhrase: string;
  /** Fallback intro-email subject lines */
  stepSubject: (step: number, companyName: string) => string;
  fallbackEmailSubject: (companyName: string) => string;
  /** Rotating service offerings emphasized across sequence steps (IT: the five offerings) */
  offerings: string[];
  /** Per-industry challenges — SAME industry keys for both verticals */
  industryChallenges: Record<string, string[]>;
  /**
   * Optional per-industry example emails used as few-shot style references for the
   * AI generator. Bodies must NOT contain a signature (composeEmail owns it) and must
   * use {{contactName}}/{{companyName}} placeholders instead of real prospect data.
   * Never hardcode a sender/company name — the generator substitutes the client's own.
   */
  exampleEmails?: Record<string, { subject: string; body: string }>;
  fallbackChallenges: string[];
  /** Scheduling questionnaire wording */
  schedule: {
    headline: string;
    intro: (businessName: string, companyName: string) => string;
    providerQuestion: string;
    frequencyQuestion: string;
    sizeLabel: string;
    sizeUnit: string;
    locationQuestion: string;
    uploadLabel: string;
    summaryTitle: (companyName: string) => string;
    summaryIntro: string;
    summarySizeHeading: string;
    notificationSubject: (companyName: string) => string;
  };
}

const JANITORIAL: VerticalConfig = {
  key: "janitorial",
  label: "Janitorial",
  serviceNoun: "commercial cleaning services",
  senderDescriptor: "a commercial janitorial company",
  audience: "facility managers and operations leaders",
  offerName: "free walkthrough",
  offerCtaLabel: "Schedule walkthrough",
  offerSubject: (c) => `Let's schedule a walkthrough — ${c}`,
  footerServicePhrase: "professional commercial cleaning services",
  stepSubject: (step, companyName) => {
    if (step === 1) return `Quick question about ${companyName}'s cleaning needs`;
    if (step === 2) return `Re: Quick question about ${companyName}'s cleaning needs`;
    return `Last follow-up — ${companyName}`;
  },
  fallbackEmailSubject: (c) => `Janitorial services for ${c}`,
  offerings: [
    "nightly and weekly commercial cleaning",
    "floor care and carpet cleaning",
    "restroom sanitation and day porter service",
    "disinfection and deep cleaning",
    "window and common-area cleaning",
  ],
  industryChallenges: {
    "Healthcare": [
      "infection control and HIPAA-compliant cleaning protocols",
      "maintaining sterile exam rooms and waiting areas between patients",
      "high patient volume creating rapid soil buildup",
      "Joint Commission and OSHA cleanliness standards",
    ],
    "Technology": [
      "keeping open-plan offices and dense workstations clean",
      "maintaining a polished appearance for client and investor visits",
      "managing shared kitchens and break rooms for large teams",
      "non-toxic cleaning safe around electronics and equipment",
    ],
    "Legal": [
      "maintaining immaculate conference rooms for high-stakes meetings",
      "confidential document areas requiring trusted, vetted cleaning staff",
      "client-facing spaces that must look flawless at all times",
      "after-hours cleaning to avoid disrupting attorney schedules",
    ],
    "Finance": [
      "regulatory audits requiring spotless, well-documented facilities",
      "security-sensitive areas needing bonded, background-checked staff",
      "trading floor air quality and surface disinfection",
      "maintaining immaculate client-facing spaces",
    ],
    "Commercial Real Estate": [
      "common areas and lobbies across multi-tenant buildings",
      "rapid deep cleaning for move-in/move-out turnovers",
      "tenant retention depending on clean, well-maintained spaces",
      "coordinating cleaning schedules across a full property portfolio",
    ],
    "Logistics & Warehousing": [
      "OSHA floor cleanliness and slip-hazard compliance on warehouse floors",
      "large square footage requiring efficient industrial cleaning equipment",
      "break rooms and restrooms serving large shift workforces",
      "loading dock and equipment area debris buildup",
    ],
    "Manufacturing": [
      "OSHA and ISO cleanliness documentation on production floors",
      "industrial grease, oil, and chemical residue requiring specialized removal",
      "cleaning coordinated around production downtime windows",
      "employee break rooms and restrooms across multiple shifts",
    ],
    "Education": [
      "preventing illness spread in high-density classrooms and cafeterias",
      "restrooms requiring multiple cleanings throughout the school day",
      "child-safe, non-toxic products for student environments",
      "seasonal deep cleans (summer, holidays) for budget planning",
    ],
  },
  fallbackChallenges: [
    "maintaining a clean, professional environment",
    "finding a reliable and consistent janitorial partner",
  ],
  exampleEmails: {
    "Logistics & Warehousing": {
      subject: "Keeping warehouse operations moving without vendor headaches",
      body: `Hi {{contactName}},

Managing an industrial facility today means balancing productivity, safety, labor shortages, and operating costs—all while keeping your operation running without interruption.

One area that often creates unnecessary challenges is facility cleaning. Inconsistent service, poor communication, and vendors that require constant follow-up can consume valuable time that should be spent supporting operations.

We partner with warehouse and distribution operations to provide reliable commercial cleaning programs that help:

- Maintain cleaner, safer work environments
- Support OSHA and safety initiatives
- Improve employee experience in breakrooms, restrooms, and common areas
- Deliver consistent service across one or multiple locations
- Schedule cleaning around production—not during it
- Reduce the time facility teams spend managing vendors

Rather than simply cleaning buildings, our goal is to become an extension of your operations team by providing consistent communication, measurable quality inspections, and responsive support.

Would you be open to a brief 15-minute conversation next week to learn how other warehouse operations are reducing vendor management while maintaining a cleaner, safer facility?`,
    },
  },
  schedule: {
    headline: "Schedule your free walkthrough",
    intro: (b, c) =>
      `${b} would love to learn about ${c}'s cleaning needs. Answer a few quick questions, then pick a time below.`,
    providerQuestion: "Who is your current cleaning provider?",
    frequencyQuestion: "Days per week currently cleaned",
    sizeLabel: "Cleanable square footage per location",
    sizeUnit: "cleanable sq ft",
    locationQuestion: "How many locations need cleaning?",
    uploadLabel: "Floor plans (optional)",
    summaryTitle: (c) => `New walkthrough request from ${c}`,
    summaryIntro: "A prospect completed the qualifying questionnaire and is ready to schedule a walkthrough.",
    summarySizeHeading: "CLEANABLE SQUARE FOOTAGE BY LOCATION",
    notificationSubject: (c) => `Walkthrough request — ${c}`,
  },
};

const IT_OFFERINGS = [
  "Cybersecurity",
  "MS365 Licenses",
  "Managed IT Services",
  "Managed Security Services",
  "Mobile Device Management",
];

const IT_SERVICES: VerticalConfig = {
  key: "it_services",
  label: "IT Services",
  serviceNoun: "managed IT services",
  senderDescriptor:
    "a managed IT services provider (MSP) offering Cybersecurity, MS365 Licenses, Managed IT Services, Managed Security Services, and Mobile Device Management",
  audience: "IT managers, operations leaders, and business owners",
  offerName: "free IT assessment",
  offerCtaLabel: "Schedule IT assessment",
  offerSubject: (c) => `Let's schedule your free IT assessment — ${c}`,
  footerServicePhrase: "professional managed IT services",
  stepSubject: (step, companyName) => {
    if (step === 1) return `Quick question about ${companyName}'s IT and security`;
    if (step === 2) return `Re: Quick question about ${companyName}'s IT and security`;
    return `Last follow-up — ${companyName}`;
  },
  fallbackEmailSubject: (c) => `Managed IT services for ${c}`,
  offerings: IT_OFFERINGS,
  industryChallenges: {
    "Healthcare": [
      "HIPAA-compliant cybersecurity and patient data protection",
      "managed security services to guard against ransomware targeting clinics",
      "mobile device management for tablets and devices used in patient care",
      "reliable managed IT support so systems never go down mid-appointment",
    ],
    "Technology": [
      "MS365 license management and cost optimization across fast-growing teams",
      "cybersecurity posture that satisfies enterprise customers and investors",
      "mobile device management for a distributed, BYOD-heavy workforce",
      "managed security services for SOC2 and compliance requirements",
    ],
    "Legal": [
      "cybersecurity protecting privileged client communications and case files",
      "managed security services with 24/7 monitoring for confidential data",
      "MS365 licensing, email encryption, and document management done right",
      "mobile device management for attorneys working from court and home",
    ],
    "Finance": [
      "regulatory-grade cybersecurity and audit-ready security documentation",
      "managed security services with continuous monitoring and incident response",
      "MS365 license compliance and secure email for client communications",
      "mobile device management enforcing encryption on every device",
    ],
    "Commercial Real Estate": [
      "managed IT services across multiple properties and site offices",
      "cybersecurity for wire-transfer fraud prevention in property transactions",
      "MS365 licensing and collaboration tools for distributed property teams",
      "mobile device management for agents and property managers in the field",
    ],
    "Logistics & Warehousing": [
      "mobile device management for scanners, tablets, and driver devices",
      "cybersecurity protecting supply-chain and shipment data",
      "managed IT services keeping warehouse systems and WMS software online",
      "managed security services guarding against costly operational downtime",
    ],
    "Manufacturing": [
      "cybersecurity for production systems and OT/IT network separation",
      "managed security services to prevent ransomware halting production lines",
      "managed IT services supporting plant-floor and office systems alike",
      "mobile device management for shop-floor tablets and field service teams",
    ],
    "Education": [
      "cybersecurity and student data privacy (FERPA) protection",
      "mobile device management for classroom laptops and tablet carts",
      "MS365 education licensing management across staff and students",
      "managed IT services stretching limited school technology budgets",
    ],
  },
  fallbackChallenges: [
    "keeping systems secure against ransomware and phishing attacks",
    "finding a reliable managed IT partner that responds fast",
  ],
  schedule: {
    headline: "Schedule your free IT assessment",
    intro: (b, c) =>
      `${b} would love to learn about ${c}'s IT environment. Answer a few quick questions, then pick a time below.`,
    providerQuestion: "Who currently manages your IT?",
    frequencyQuestion: "How many employees use computers?",
    sizeLabel: "Workstations and servers per location",
    sizeUnit: "workstations/servers",
    locationQuestion: "How many locations have IT equipment?",
    uploadLabel: "Network diagrams or inventory lists (optional)",
    summaryTitle: (c) => `New IT assessment request from ${c}`,
    summaryIntro: "A prospect completed the qualifying questionnaire and is ready to schedule an IT assessment.",
    summarySizeHeading: "WORKSTATIONS / SERVERS BY LOCATION",
    notificationSubject: (c) => `IT assessment request — ${c}`,
  },
};

const FLEET_WRAPS: VerticalConfig = {
  key: "fleet_wraps",
  label: "Fleet & Commercial Vehicle Wraps",
  serviceNoun: "fleet graphics and commercial vehicle wraps",
  senderDescriptor: "a commercial vehicle wrap and fleet graphics provider",
  audience: "business owners, fleet managers, operations leaders, and marketing leaders",
  offerName: "fleet branding consultation",
  offerCtaLabel: "Schedule fleet consultation",
  offerSubject: (c) => `Let's review ${c}'s fleet branding`,
  footerServicePhrase: "professional fleet graphics and commercial vehicle wraps",
  stepSubject: (step, companyName) => {
    if (step === 1) return `Quick question about ${companyName}'s vehicle branding`;
    if (step === 2) return `Re: ${companyName}'s fleet graphics`;
    return `Last follow-up — ${companyName}`;
  },
  fallbackEmailSubject: (c) => `Fleet graphics for ${c}`,
  offerings: [
    "full and partial vehicle wraps",
    "fleet graphics, die-cut lettering, and vehicle graphics",
    "custom in-house design for consistent fleet branding",
    "professional installation using premium 3M and Avery Dennison materials",
    "replacement-vehicle graphics and fleet programs",
  ],
  industryChallenges: {
    "Home Services": ["keeping service vehicles consistently branded", "turning daily drive time into local advertising"],
    Roofing: ["branding trucks used by field crews", "maintaining consistent graphics as crews expand"],
    HVAC: ["wrapping technician vans", "replacing worn graphics on high-mileage service vehicles"],
    Plumbing: ["making service vehicles recognizable and professional", "consistent branding across vans and trucks"],
    Electrical: ["branding field-service vehicles", "supporting new crews with matching vehicle graphics"],
    Landscaping: ["coordinating truck and trailer graphics", "building visibility across a local service territory"],
    Construction: ["branding trucks and trailers used across job sites", "keeping multi-vehicle graphics consistent"],
    "Pest Control": ["making technician vehicles recognizable", "building local visibility along recurring service routes"],
    "Car Dealerships": ["branding courtesy, loaner, service, or promotional vehicles", "keeping dealer-group vehicle branding consistent"],
    "Delivery & Logistics": ["consistent fleet identification", "coordinating graphics across vehicle types and locations"],
    Municipal: ["clear department and vehicle identification", "replacement graphics for working fleet vehicles"],
    Education: ["consistent campus fleet identification", "graphics for facilities, transportation, and service vehicles"],
    "Higher Education": ["consistent campus fleet identification", "departmental graphics for facilities, transportation, athletics, and service vehicles"],
  },
  fallbackChallenges: [
    "keeping commercial vehicles consistently branded",
    "using fleet vehicles as professional mobile advertising",
  ],
  schedule: {
    headline: "Schedule your fleet branding consultation",
    intro: (b, c) => `${b} would love to learn about ${c}'s vehicle and fleet branding needs. Answer a few quick questions, then pick a time below.`,
    providerQuestion: "Who currently handles your vehicle graphics?",
    frequencyQuestion: "How many vehicles may need graphics?",
    sizeLabel: "Vehicles by location",
    sizeUnit: "vehicles",
    locationQuestion: "How many locations operate vehicles?",
    uploadLabel: "Logos, brand guides, or vehicle photos (optional)",
    summaryTitle: (c) => `New fleet branding request from ${c}`,
    summaryIntro: "A prospect completed the qualifying questionnaire and is ready to discuss fleet graphics.",
    summarySizeHeading: "VEHICLES BY LOCATION",
    notificationSubject: (c) => `Fleet branding request — ${c}`,
  },
};

const RECRUITING: VerticalConfig = {
  key: "recruiting_staffing",
  label: "Recruiting & Staffing",
  serviceNoun: "recruiting and staffing services",
  senderDescriptor: "a recruiting and staffing provider; offer only services verified in the seller profile",
  audience: "employer owners, HR and talent acquisition leaders, hiring managers, operations and procurement stakeholders",
  offerName: "hiring-needs discovery call",
  offerCtaLabel: "Schedule hiring consultation",
  offerSubject: c => `Discuss ${c}'s hiring needs`,
  footerServicePhrase: "professional recruiting and staffing services",
  stepSubject: (step, c) => step === 1 ? `A question about ${c}'s hiring plans` : step === 2 ? `Re: ${c}'s hiring plans` : `Following up — ${c}`,
  fallbackEmailSubject: c => `Hiring-needs discussion — ${c}`,
  // Do not synthesize a generic catalog: this seller may offer only one placement type.
  offerings: [],
  industryChallenges: {
    Healthcare: ["credential requirements and coverage across clinical and support roles"],
    "Oil & Gas": ["specialized technical skills, safety requirements and project-based hiring"],
    Technology: ["specialized technical roles and changing skill requirements"],
    "Financial Services": ["specialist skills, regulatory responsibilities and candidate vetting"],
    Engineering: ["discipline-specific qualifications and project staffing timelines"],
    Manufacturing: ["shift coverage, skilled trades and production hiring coordination"],
    "Logistics & Warehousing": ["shift patterns, hiring locations and operational staffing timelines"],
  },
  fallbackChallenges: ["understanding specific role requirements and hiring timelines"],
  schedule: {
    headline: "Schedule a hiring-needs discovery call",
    intro: (b, c) => `${b} would like to understand ${c}'s hiring needs. Share only what you know, then select a time.`,
    providerQuestion: "Current recruiting approach or agency relationships",
    frequencyQuestion: "Number of hires needed",
    sizeLabel: "Roles and hiring needs by location",
    sizeUnit: "hires (if disclosed)",
    locationQuestion: "How many locations are hiring?",
    uploadLabel: "Job descriptions or hiring requirements (optional)",
    summaryTitle: c => `Hiring consultation request — ${c}`,
    summaryIntro: "Employer-disclosed hiring qualification; unknown information remains open for discovery.",
    summarySizeHeading: "HIRING LOCATIONS",
    notificationSubject: c => `Hiring-needs discovery call — ${c}`,
  },
};

const CONFIGS: Record<Vertical, VerticalConfig> = {
  janitorial: JANITORIAL,
  it_services: IT_SERVICES,
  fleet_wraps: FLEET_WRAPS,
  recruiting_staffing: RECRUITING,
};

export function getVerticalConfig(v?: string | null): VerticalConfig {
  return CONFIGS[normalizeVertical(v)];
}

/** The offering to emphasize for a given sequence step (rotates through the list). */
export function offeringForStep(config: VerticalConfig, step: number): string {
  if (!config.offerings.length) return "only a matching service from the approved seller profile";
  const idx = Math.max(0, step - 1) % config.offerings.length;
  return config.offerings[idx];
}

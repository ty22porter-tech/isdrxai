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

function getProfile(industry: string): IndustryProfile {
  return INDUSTRY_PROFILES[industry] ?? DEFAULT_PROFILE;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateIntroEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
  city?: string;
}): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "");
  const painPoint = pick(p.painPoints);
  const challenge = pick(p.challenges);
  const valueProp1 = p.valueProps[0];
  const valueProp2 = p.valueProps[1];

  const subject = `Janitorial services for ${prospect.companyName ?? p.label + " businesses"} — quick question`;

  const body = `Hi ${prospect.contactName ?? "there"},

I work with ${p.label.toLowerCase()} businesses like ${prospect.companyName ?? "yours"} in ${prospect.city ?? "your area"}, and one challenge I keep hearing is ${painPoint}.

We help solve this by offering ${valueProp1} and ${valueProp2}.

A few business challenges we specifically address for ${p.label.toLowerCase()} companies:
• ${p.challenges[0]}
• ${p.challenges[1]}
• ${p.challenges[2] ?? p.challenges[0]}

${p.closingLine}

Would you be open to a 15-minute call this week? I'd love to do a complimentary walkthrough of ${prospect.companyName ?? "your facility"} and put together a custom quote.

Best,
Your SDR Team`;

  return { subject, body };
}

export function generateFollowUpEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
  city?: string;
}): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "");
  const valueProp = pick(p.valueProps);

  const subject = `Following up — ${prospect.companyName ?? p.label}`;
  const body = `Hi ${prospect.contactName ?? "there"},

I wanted to follow up on my previous note about janitorial services for ${prospect.companyName ?? "your facility"}.

Given that ${pick(p.challenges).toLowerCase()} is a real concern for ${p.label.toLowerCase()} operations, I thought it was worth reaching out again.

We offer ${valueProp} — and we work with several ${p.label.toLowerCase()} businesses in ${prospect.city ?? "your area"} who've seen immediate results.

Would a quick 10-minute call work this week? I can also send over a sample proposal if that's easier.

Best,
Your SDR Team`;

  return { subject, body };
}

export function generateBreakupEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
}): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "");

  const subject = `Last note — ${prospect.companyName ?? p.label}`;
  const body = `Hi ${prospect.contactName ?? "there"},

I've reached out a couple of times about janitorial services for ${prospect.companyName ?? "your facility"}, and I don't want to keep filling your inbox if the timing isn't right.

If ${p.challenges[0].toLowerCase()} ever becomes a priority, we'd love to help — ${p.valueProps[0]} is something we do really well for ${p.label.toLowerCase()} businesses.

I'll leave the door open. If you'd like to revisit this down the road, feel free to reply to this email.

Wishing you a great rest of the year!

Best,
Your SDR Team`;

  return { subject, body };
}

export function generateEmailForStep(
  step: 1 | 2 | 3,
  prospect: { contactName?: string; companyName?: string; industry?: string; city?: string }
): { subject: string; body: string } {
  if (step === 1) return generateIntroEmail(prospect);
  if (step === 2) return generateFollowUpEmail(prospect);
  return generateBreakupEmail(prospect);
}

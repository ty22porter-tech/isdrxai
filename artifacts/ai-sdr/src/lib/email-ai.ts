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

export type ClientVertical = "janitorial" | "it_services";

function getProfile(industry: string, vertical: ClientVertical = "janitorial"): IndustryProfile {
  if (vertical === "it_services") return IT_INDUSTRY_PROFILES[industry] ?? DEFAULT_IT_PROFILE;
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
    offer: "free IT assessment",
    offerAction: "run a free IT assessment for",
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateIntroEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
  city?: string;
}, vertical: ClientVertical = "janitorial"): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "", vertical);
  const w = WORDING[vertical];
  const painPoint = pick(p.painPoints);
  const challenge = pick(p.challenges);
  const valueProp1 = p.valueProps[0];
  const valueProp2 = p.valueProps[1];

  const subject = `${vertical === "it_services" ? "Managed IT services" : "Janitorial services"} for ${prospect.companyName ?? p.label + " businesses"} — quick question`;

  const body = `Hi ${prospect.contactName ?? "there"},

I work with ${p.label.toLowerCase()} businesses like ${prospect.companyName ?? "yours"} in ${prospect.city ?? "your area"}, and one challenge I keep hearing is ${painPoint}.

We help solve this by offering ${valueProp1} and ${valueProp2}.

A few business challenges we specifically address for ${p.label.toLowerCase()} companies:
• ${p.challenges[0]}
• ${p.challenges[1]}
• ${p.challenges[2] ?? p.challenges[0]}

${p.closingLine}

Would you be open to a 15-minute call this week? I'd love to ${w.offerAction} ${prospect.companyName ?? (vertical === "it_services" ? "your business" : "your facility")} and put together a custom quote.

Best,
Your SDR Team`;

  return { subject, body };
}

export function generateFollowUpEmail(prospect: {
  contactName?: string;
  companyName?: string;
  industry?: string;
  city?: string;
}, vertical: ClientVertical = "janitorial"): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "", vertical);
  const w = WORDING[vertical];
  const valueProp = pick(p.valueProps);

  const subject = `Following up — ${prospect.companyName ?? p.label}`;
  const body = `Hi ${prospect.contactName ?? "there"},

I wanted to follow up on my previous note about ${w.serviceNoun} for ${prospect.companyName ?? (vertical === "it_services" ? "your business" : "your facility")}.

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
}, vertical: ClientVertical = "janitorial"): { subject: string; body: string } {
  const p = getProfile(prospect.industry ?? "", vertical);
  const w = WORDING[vertical];

  const subject = `Last note — ${prospect.companyName ?? p.label}`;
  const body = `Hi ${prospect.contactName ?? "there"},

I've reached out a couple of times about ${w.serviceNoun} for ${prospect.companyName ?? (vertical === "it_services" ? "your business" : "your facility")}, and I don't want to keep filling your inbox if the timing isn't right.

If ${p.challenges[0].toLowerCase()} ever becomes a priority, we'd love to help — ${p.valueProps[0]} is something we do really well for ${p.label.toLowerCase()} businesses.

I'll leave the door open. If you'd like to revisit this down the road, feel free to reply to this email.

Wishing you a great rest of the year!

Best,
Your SDR Team`;

  return { subject, body };
}

export function generateEmailForStep(
  step: number,
  prospect: { contactName?: string; companyName?: string; industry?: string; city?: string },
  vertical: ClientVertical = "janitorial"
): { subject: string; body: string } {
  if (step === 1) return generateIntroEmail(prospect, vertical);
  if (step >= 7) return generateBreakupEmail(prospect, vertical);
  return generateFollowUpEmail(prospect, vertical);
}

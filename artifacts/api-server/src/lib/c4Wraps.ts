export interface C4IndustryProfile {
  label: string;
  fitScore: number;
  businessModel: string;
  industryFit: string;
  relevantCapabilities: string[];
  potentialNeeds: string[];
  outreachAngle: (companyName: string, city: string) => string;
  emailOpening: (companyName: string, city: string) => string;
}

export const C4_VERIFIED_SELLER_CONTEXT = [
  "C4 Wraps provides full and partial commercial vehicle wraps, fleet wraps, and die-cut lettering and graphics.",
  "C4 Wraps offers custom in-house design and professional installation for consistent branding across vehicles.",
  "C4 Wraps uses premium 3M and Avery Dennison materials and offers certified, warranty-backed work.",
  "C4 Wraps positions wrapped commercial vehicles as long-term mobile advertising that can increase local visibility without another recurring advertising channel.",
  "C4 Wraps may offer quick-turnaround scheduling, fleet pricing, and Wrap Now, Pay Later financing when applicable; never promise availability or terms without confirmation.",
].join(" ");

const PROFILES: Record<string, C4IndustryProfile> = {
  home_services: {
    label: "Home Services",
    fitScore: 24,
    businessModel: "Home-service companies typically send technicians to customer properties throughout a defined service territory.",
    industryFit: "Customer-facing service vehicles can support local visibility, technician recognition, and a consistent arrival experience.",
    relevantCapabilities: ["commercial fleet graphics", "custom in-house design", "consistent branding across multiple vehicle types"],
    potentialNeeds: [
      "Local brand visibility → C4 commercial vehicle wraps can turn service vans and trucks into mobile advertising throughout the service territory.",
      "Professional technician arrival → C4 fleet graphics can make customer-facing vehicles recognizable and reinforce credibility at homes and businesses.",
      "Fleet brand consistency → C4's in-house design can carry approved branding consistently across different vehicle types.",
    ],
    outreachAngle: (company, city) => `Lead with C4's ability to turn ${company}'s customer-facing vehicles into consistent mobile advertising throughout ${city}. Position C4's in-house design and commercial fleet capabilities around local recognition, professional technician arrival, and repeatable branding as vehicles change.`,
    emailOpening: (_company, city) => `For a home-service business, each customer-facing vehicle it operates can help keep the brand visible throughout ${city}.`,
  },
  hvac_plumbing: {
    label: "HVAC / Plumbing",
    fitScore: 26,
    businessModel: "HVAC and plumbing are field-service businesses where technicians typically travel to customer properties across a local service area.",
    industryFit: "Service vans and trucks can function as both technician transportation and customer-facing brand assets.",
    relevantCapabilities: ["commercial service-vehicle wraps", "consistent fleet graphics", "custom in-house design"],
    potentialNeeds: [
      "Local brand visibility → C4 commercial vehicle wraps can turn service vans and trucks into mobile advertising throughout the company's service territory.",
      "Professional technician arrival → C4 fleet graphics can reinforce company identity and credibility when technicians arrive at customer properties.",
      "Fleet brand consistency → C4's custom design and fleet-wrap capabilities can reproduce a consistent look across vans, trucks, and future replacement vehicles.",
    ],
    outreachAngle: (company, city) => `Lead with C4's ability to turn ${company}'s service vehicles into consistent mobile advertising throughout ${city}. Position C4's in-house design and commercial fleet capabilities around brand consistency, professional technician arrival, and additional local visibility from vehicles already on the road.`,
    emailOpening: (_company, city) => `For HVAC and plumbing operators, service vehicles can do more than move technicians between jobs—they can keep a brand visible throughout ${city}.`,
  },
  roofing: {
    label: "Roofing",
    fitScore: 25,
    businessModel: "Roofing companies commonly operate field crews that travel to residential and commercial job sites.",
    industryFit: "Work trucks and trailers can create neighborhood and job-site visibility in the same markets where future customers may need a contractor.",
    relevantCapabilities: ["truck wraps", "trailer graphics", "repeatable fleet branding"],
    potentialNeeds: [
      "Neighborhood visibility → C4 truck wraps can keep the roofing brand visible near active jobs and throughout target service areas.",
      "Job-site exposure → C4 trailer and work-truck graphics can make field crews and equipment easier to identify on location.",
      "Brand consistency → C4's in-house design can create a repeatable graphics system for different trucks and trailers.",
    ],
    outreachAngle: (company, city) => `Lead with the visibility ${company}'s trucks and trailers can create around job sites and neighborhoods in ${city}. Match that opportunity to C4's custom truck, trailer, and fleet graphics rather than assuming a particular fleet size or growth plan.`,
    emailOpening: (_company, city) => `For roofing companies, every truck or trailer at a job site can reinforce the brand in the ${city} neighborhoods where future customers are paying attention.`,
  },
  electrical: {
    label: "Electrical",
    fitScore: 24,
    businessModel: "Electrical contractors are field-service businesses whose technicians travel to residential, commercial, or construction sites.",
    industryFit: "Recognizable service vehicles can support technician identification, professional branding, and local awareness.",
    relevantCapabilities: ["service-vehicle wraps", "die-cut lettering and graphics", "consistent fleet branding"],
    potentialNeeds: [
      "Technician identification → C4 vehicle lettering and graphics can make electrical service vehicles easier for customers and job-site teams to recognize.",
      "Professional field presence → C4 commercial wraps can present a consistent, credible brand when technicians arrive.",
      "Local awareness → C4 fleet graphics can create ongoing visibility throughout the contractor's service territory.",
    ],
    outreachAngle: (company, city) => `Lead with recognizable, professional field-service vehicles for ${company}. Connect C4's commercial wraps and lettering to technician identification, consistent branding, and local awareness throughout ${city}.`,
    emailOpening: (_company, city) => `A clearly branded electrical service vehicle can build recognition before a technician even steps onto a job site in ${city}.`,
  },
  construction: {
    label: "Construction",
    fitScore: 22,
    businessModel: "Construction companies coordinate field crews, trucks, and equipment across changing project locations.",
    industryFit: "Trucks and trailers can reinforce company recognition across job sites while consistent graphics help unify different vehicle types.",
    relevantCapabilities: ["truck and trailer graphics", "fleet-wide design consistency", "durable commercial wraps"],
    potentialNeeds: [
      "Job-site branding → C4 truck and trailer graphics can reinforce the company identity wherever crews and equipment are working.",
      "Fleet consistency → C4's in-house design can keep branding aligned across pickups, vans, trailers, and other commercial vehicles.",
      "Company recognition → C4 commercial graphics can make field vehicles easier to associate with the contractor across multiple projects.",
    ],
    outreachAngle: (company, city) => `Lead with consistent job-site recognition for ${company}'s field presence in ${city}. Position C4's truck, trailer, and multi-vehicle graphics as a way to carry one professional brand across varied commercial vehicles.`,
    emailOpening: (_company, city) => `Every construction truck and trailer arriving at a ${city} job site can reinforce the same professional brand.`,
  },
  landscaping: {
    label: "Landscaping",
    fitScore: 25,
    businessModel: "Landscaping crews typically travel recurring neighborhood and commercial-property routes with visible trucks and trailers.",
    industryFit: "Those routes can create repeated local exposure while coordinated truck and trailer graphics improve recognition.",
    relevantCapabilities: ["truck graphics", "trailer graphics", "coordinated fleet branding"],
    potentialNeeds: [
      "Neighborhood visibility → C4 truck wraps can create repeated brand exposure along the routes landscaping crews already travel.",
      "Truck-and-trailer consistency → C4's in-house design can coordinate graphics across towing vehicles and trailers.",
      "Local brand recognition → C4 commercial fleet graphics can make crews easier to recognize at residential and commercial properties.",
    ],
    outreachAngle: (company, city) => `Lead with the repeated visibility ${company}'s field routes can create across ${city}. Connect C4's coordinated truck-and-trailer graphics to local recognition and a consistent crew presence.`,
    emailOpening: (_company, city) => `Landscaping crews typically travel through the ${city} neighborhoods and commercial properties their brands want to reach.`,
  },
  pest_control: {
    label: "Pest Control",
    fitScore: 25,
    businessModel: "Pest-control technicians typically travel recurring neighborhood and commercial service routes.",
    industryFit: "Recognizable technician vehicles can support customer confidence and repeated local advertising.",
    relevantCapabilities: ["service-vehicle wraps", "fleet graphics", "die-cut lettering"],
    potentialNeeds: [
      "Recognizable technician vehicles → C4 fleet graphics can make pest-control vehicles easier for customers to identify on arrival.",
      "Recurring-route advertising → C4 commercial wraps can create repeated local exposure along established service routes.",
      "Brand consistency → C4's in-house design can keep graphics consistent across different technician vehicles.",
    ],
    outreachAngle: (company, city) => `Lead with recognizable technician vehicles and repeated neighborhood visibility for ${company}. Match C4's fleet graphics to customer confidence and the recurring routes common to pest-control service in ${city}.`,
    emailOpening: (_company, city) => `Every recurring pest-control service route is an opportunity to build recognition throughout ${city}.`,
  },
  dealership: {
    label: "Car Dealerships",
    fitScore: 18,
    businessModel: "Automotive dealerships may operate courtesy, loaner, service, promotional, or dealer-group vehicles.",
    industryFit: "When those vehicles are present, coordinated graphics can support dealership identification and promotional visibility.",
    relevantCapabilities: ["promotional vehicle wraps", "vehicle lettering", "dealer-group brand consistency"],
    potentialNeeds: [
      "Promotional visibility → C4 commercial wraps can turn eligible dealership vehicles into branded promotional assets.",
      "Dealer-group consistency → C4's in-house design can carry approved branding across different locations and vehicle types.",
      "Service-vehicle identification → C4 lettering and graphics can make dealership-operated service vehicles easier to recognize.",
    ],
    outreachAngle: (company, city) => `Lead with a discovery question about courtesy, loaner, service, or promotional vehicles at ${company}. If those vehicles exist, position C4's custom design and commercial graphics around dealer-group consistency and visibility in ${city}.`,
    emailOpening: (company, city) => `If ${company} operates courtesy, service, or promotional vehicles, those vehicles can extend the showroom brand beyond the lot and across ${city}.`,
  },
  logistics: {
    label: "Logistics / Delivery",
    fitScore: 26,
    businessModel: "Logistics and delivery companies are operationally associated with vehicles moving goods between customers, facilities, and service areas.",
    industryFit: "Multi-vehicle graphics can support fleet identification, consistent branding, and visibility across routes.",
    relevantCapabilities: ["multi-vehicle fleet graphics", "replacement vehicle graphics", "multi-location brand consistency"],
    potentialNeeds: [
      "Fleet brand consistency → C4 can apply a repeatable graphics system across different commercial vehicle types.",
      "Replacement vehicle branding → C4 can reproduce approved fleet graphics when vehicles are replaced or added, when that need is confirmed.",
      "Route visibility → C4 commercial wraps can create brand exposure while vehicles perform normal delivery or logistics work.",
    ],
    outreachAngle: (company, city) => `Lead with a discovery conversation about how ${company} manages consistent graphics across operating vehicles and replacements. Position C4's repeatable fleet program around route visibility and brand consistency in ${city}, without assuming fleet size.`,
    emailOpening: (_company, city) => `Logistics and delivery vehicles moving through ${city} routes can carry one consistent brand at every stop.`,
  },
  municipal: {
    label: "Municipalities",
    fitScore: 23,
    businessModel: "Municipal operations commonly use department-specific vehicles for public works, facilities, parks, utilities, and community services.",
    industryFit: "Clear vehicle identification and consistent department graphics can support public recognition and fleet continuity.",
    relevantCapabilities: ["department-specific graphics", "vehicle lettering", "replacement vehicle graphics"],
    potentialNeeds: [
      "Fleet identification → C4 lettering and graphics can make municipal vehicles and departments clear to the public.",
      "Department consistency → C4's in-house design can coordinate approved visual standards across multiple municipal functions.",
      "Replacement graphics → C4 can reproduce approved graphics for replacement vehicles when that need is confirmed.",
    ],
    outreachAngle: (company, city) => `Lead with a fleet-identification review for ${company}, focused on clear department graphics and repeatable branding. Position C4's design and replacement-graphics capabilities around consistency rather than promotional claims.`,
    emailOpening: (company) => `If ${company} operates department and field-service vehicles, clear graphics can help residents recognize them at a glance.`,
  },
  education: {
    label: "Higher Education",
    fitScore: 18,
    businessModel: "Colleges and universities may operate facilities, maintenance, campus transportation, athletics, and promotional vehicles.",
    industryFit: "When those vehicles are present, department-specific graphics can support campus identification and brand consistency.",
    relevantCapabilities: ["campus fleet graphics", "departmental branding", "promotional vehicle wraps"],
    potentialNeeds: [
      "Campus brand consistency → C4's in-house design can carry institutional standards across facilities, maintenance, and transportation vehicles.",
      "Department identification → C4 lettering and graphics can make campus service vehicles easier to recognize.",
      "Athletic or promotional visibility → C4 commercial wraps can create branded promotional vehicles when relevant.",
    ],
    outreachAngle: (company, city) => `Lead with a discovery question about facilities, maintenance, transportation, or promotional vehicles at ${company}. If relevant, position C4's in-house design around campus brand standards and department-specific consistency.`,
    emailOpening: (company) => `If ${company} operates facilities, maintenance, transportation, or promotional vehicles, those vehicles can extend its campus identity beyond buildings and signage.`,
  },
  commercial: {
    label: "Commercial",
    fitScore: 14,
    businessModel: "The available business listing confirms a commercial operation, but its reliance on customer-facing or fleet vehicles is not yet known.",
    industryFit: "If the company operates commercial vehicles, professional graphics could support recognition, consistent branding, and mobile visibility.",
    relevantCapabilities: ["full or partial commercial wraps", "die-cut lettering and graphics", "custom in-house design"],
    potentialNeeds: [
      "Commercial vehicle visibility → If the company operates vehicles, C4 full or partial wraps can turn them into professional mobile brand assets.",
      "Brand consistency → C4's in-house design can translate approved branding into repeatable commercial vehicle graphics.",
      "Lower-entry branding option → C4 die-cut lettering or partial graphics may fit vehicles that do not require a full wrap.",
    ],
    outreachAngle: (company, city) => `Open with discovery: ask whether ${company} operates customer-facing commercial vehicles in ${city} and how those vehicles are currently branded. If there is a fit, match C4's full wraps, partial wraps, or lettering to the confirmed need.`,
    emailOpening: (company, city) => `If ${company} operates customer-facing vehicles in ${city}, those vehicles may be an underused brand asset.`,
  },
};

export function getC4IndustryProfile(industry?: string | null): C4IndustryProfile {
  const value = (industry ?? "").trim().toLowerCase();
  if (/hvac|heating|air condition|plumb/.test(value)) return PROFILES.hvac_plumbing;
  if (/roof/.test(value)) return PROFILES.roofing;
  if (/electric/.test(value)) return PROFILES.electrical;
  if (/construct|contractor/.test(value)) return PROFILES.construction;
  if (/landscap|lawn|tree service/.test(value)) return PROFILES.landscaping;
  if (/pest|extermin/.test(value)) return PROFILES.pest_control;
  if (/dealer|automotive retail|auto sales/.test(value)) return PROFILES.dealership;
  if (/logistic|deliver|courier|transport|trucking/.test(value)) return PROFILES.logistics;
  if (/municip|government|public works|city service/.test(value)) return PROFILES.municipal;
  if (/education|university|college|campus|school/.test(value)) return PROFILES.education;
  if (/home service|field service|garage door|appliance|restoration|pool service/.test(value)) return PROFILES.home_services;
  return PROFILES.commercial;
}

export function buildC4EmailContext(industry?: string | null): string {
  const profile = getC4IndustryProfile(industry);
  return [
    `C4 WRAPS SELLER CONTEXT: ${C4_VERIFIED_SELLER_CONTEXT}`,
    `PROSPECT INDUSTRY MATCH (${profile.label}): ${profile.businessModel} ${profile.industryFit}`,
    `RELEVANT C4 CAPABILITIES: ${profile.relevantCapabilities.join("; ")}.`,
    `BUSINESS-NEED TO C4-SOLUTION OPTIONS: ${profile.potentialNeeds.join(" | ")}`,
    "ACCURACY: Never claim fleet size, vehicle count, purchases, hiring, expansion, rebranding, location count, marketing problems, sales declines, ad spend, current wrap provider, or results unless supplied as verified evidence. Treat industry traits as inferred fit, not facts about the individual prospect.",
  ].join("\n");
}
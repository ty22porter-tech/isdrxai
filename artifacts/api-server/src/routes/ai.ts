import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GenerateEmailBody, GenerateCallScriptBody, ProspectSearchBody } from "@workspace/api-zod";
import { requireAuth, requireEntitlement } from "../lib/requireAuth";
import { getVerticalConfig } from "../lib/verticals";

const router = Router();
router.use(requireAuth);

function generatePersonalizedEmail(prospect: typeof prospectsTable.$inferSelect, client: typeof usersTable.$inferSelect | undefined, tone: string = "professional") {
  const { companyName, contactName, industry, city, state, squareFootage, employeeCount } = prospect;
  const firstName = contactName.split(" ")[0];
  const senderName = client?.senderName?.trim() || client?.businessName?.trim() || "our team";
  const businessName = client?.businessName?.trim() || "our company";
  const sq = squareFootage ? `${squareFootage.toLocaleString()} sq ft` : null;
  const emp = employeeCount ? `${employeeCount}-person` : null;
  const vertical = getVerticalConfig(client?.vertical).key;

  const subjects = vertical === "it_services"
    ? [
        `Managed IT proposal for ${companyName}`,
        `Keeping ${companyName} secure and supported — can we chat?`,
        `IT services tailored for ${industry} businesses in ${city}`,
        `Quick question about ${companyName}'s IT and security`,
      ]
    : [
        `Commercial cleaning proposal for ${companyName}`,
        `Keeping ${companyName} spotless — can we chat?`,
        `Janitorial services tailored for ${industry} facilities in ${city}`,
        `Quick question about ${companyName}'s facility maintenance`,
      ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const openings = tone === "casual"
    ? [`Hey ${firstName},`, `Hi ${firstName},`]
    : [`Dear ${firstName},`, `Hello ${firstName},`];
  const opening = openings[Math.floor(Math.random() * openings.length)];

  const facilityDetail = sq ? `your ${sq} facility` : `your ${city} location`;
  const facilityMention = sq ? `a ${sq} facility in ${city}` : `a facility in ${city}`;
  const companyDetail = emp ? `your ${emp} team` : `your team`;

  if (vertical === "it_services") {
    const teamMention = emp ? `a ${emp} team in ${city}` : `a team in ${city}`;
    const body = `${opening}

I hope this message finds you well. My name is ${senderName}, and I represent ${businessName} — a managed IT services provider working with ${industry} businesses across ${state}.

I noticed ${companyName} operates ${teamMention}, and I wanted to reach out about how we can keep your technology secure, compliant, and running smoothly so ${companyDetail} can stay focused on what you do best.

Here's what we bring to ${industry} companies like yours:
• Cybersecurity — protection against ransomware, phishing, and data breaches
• MS365 Licenses — right-sized licensing and full Microsoft 365 management
• Managed IT Services — proactive support, monitoring, and fast helpdesk response
• Managed Security Services — 24/7 threat monitoring and incident response
• Mobile Device Management — secure every laptop, phone, and tablet your team uses

We currently support several ${industry} businesses in ${city} and consistently receive 5-star reviews for responsiveness and reliability.

I'd love to schedule a free IT assessment for ${companyName} so we can put together a no-obligation recommendation tailored to your environment.

Would you have 15 minutes this week for a quick call?`;
    return { subject, body };
  }

  const body = `${opening}

I hope this message finds you well. My name is ${senderName}, and I represent ${businessName} — a commercial cleaning company specializing in ${industry} facilities across ${state}.

I noticed ${companyName} operates ${facilityMention}, and I wanted to reach out about how we can help keep your workspace in top condition so ${companyDetail} can stay focused on what you do best.

Here's what we bring to ${industry} companies like yours:
• Customized cleaning schedules (nightly, weekly, or as-needed)
• Fully bonded and insured crew with background checks
• Green cleaning products available upon request
• Dedicated account manager and 24/7 emergency response

We currently service several ${industry} businesses in ${city} and consistently receive 5-star reviews for reliability and attention to detail.

I'd love to schedule a free walkthrough of ${facilityDetail} so we can put together a no-obligation quote tailored to your specific needs.

Would you have 15 minutes this week for a quick call or site visit?`;

  return { subject, body };
}

function generateCallScript(prospect: typeof prospectsTable.$inferSelect, client: typeof usersTable.$inferSelect | undefined, objective: string = "set appointment") {
  const { companyName, contactName, industry, city, squareFootage } = prospect;
  const firstName = contactName.split(" ")[0];
  const senderName = client?.senderName?.trim() || client?.businessName?.trim() || "our team";
  const businessName = client?.businessName?.trim() || "our company";
  const sq = squareFootage ? `your ${squareFootage.toLocaleString()} sq ft space` : `your facility`;
  const vertical = getVerticalConfig(client?.vertical).key;

  if (vertical === "it_services") {
    const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is ${senderName} calling from ${businessName}. I'm reaching out to ${industry} businesses in ${city} — I'll keep this brief, I promise. Do you have about 60 seconds?"

PITCH (0:30 – 1:30)
"We're a managed IT services provider working with ${industry} companies, and I noticed ${companyName} is in ${city}. A lot of our clients had the same situation — slow support from their current IT provider, growing security worries, or Microsoft 365 licensing costs creeping up.

We cover everything under one roof: Cybersecurity, MS365 Licenses, Managed IT Services, Managed Security Services, and Mobile Device Management — so every laptop, phone, and server your team touches is secure and supported.

The reason I'm calling is to see if it'd make sense to do a free IT assessment for ${companyName}. It's free, takes about 30 minutes, and you'll walk away with a clear picture of your security gaps and where you might be overspending."

CLOSE (1:30 – 2:00)
"${objective.includes("appointment") ? `Would you be available for a quick assessment call this week — say Tuesday or Thursday afternoon?` : `Can I send you some information about what we do for ${industry} businesses in ${city}?`}"`;

    const keyPoints = [
      `Mention ${industry}-specific experience and local ${city} presence upfront`,
      `Lead with security risk and IT cost savings — most common pain points`,
      `Name the five offerings: Cybersecurity, MS365 Licenses, Managed IT, Managed Security, MDM`,
      `Keep the ask small: a free 30-minute IT assessment, not a commitment`,
      `Always confirm a specific day/time, not an open-ended "sometime this week"`,
    ];

    const objectionHandlers = [
      {
        objection: "We already have an IT provider",
        response: `"That's great to hear — most of our best clients did too before they switched. Can I ask, are you fully satisfied with response times and how proactive they are on security? We often do a complimentary side-by-side assessment — no pressure, just good info to have."`,
      },
      {
        objection: "We're not interested / not looking right now",
        response: `"I completely understand, ${firstName}. Timing is everything. Would it be okay if I followed up in a couple months? And if anything changes — or if a security incident ever comes up — I'll make sure you have my direct number."`,
      },
      {
        objection: "Send me information by email",
        response: `"Absolutely, I'll send that right over. What's the best email for you? And just so the info is relevant — roughly how many workstations and servers does ${companyName} run? That helps me tailor what I send."`,
      },
      {
        objection: "We're under contract",
        response: `"Totally fair — contracts are there for a reason. When does that come up for renewal? I'd love to be on your radar so we can put together a proposal when the time is right. Would you be open to a free assessment just to have options?"`,
      },
      {
        objection: "Too busy right now",
        response: `"Understood — I'll be quick. The assessment only takes 30 minutes and we do most of it remotely. Would early morning or end of day work better so it doesn't cut into your schedule?"`,
      },
    ];

    return { script, keyPoints, objectionHandlers };
  }

  const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is ${senderName} calling from ${businessName}. I'm reaching out to ${industry} businesses in ${city} — I'll keep this brief, I promise. Do you have about 60 seconds?"

PITCH (0:30 – 1:30)
"We specialize in commercial cleaning for ${industry} companies, and I noticed ${companyName} is in ${city}. A lot of our clients had the same situation — their current cleaning wasn't consistent, or they were overpaying for a generic service.

We've helped similar businesses in the area cut their cleaning costs by 20-30% while getting more reliable results. We do everything — nightly cleaning, floor care, restroom sanitation, window cleaning — and every crew member is bonded and background-checked.

The reason I'm calling is to see if it'd make sense to do a quick walkthrough of ${sq}. It's free, takes about 20 minutes, and I can give you a firm quote on the spot."

CLOSE (1:30 – 2:00)
"${objective.includes("appointment") ? `Would you be available for a site visit this week — say Tuesday or Thursday afternoon?` : `Can I send you some information about what we do for ${industry} businesses in ${city}?`}"`;

  const keyPoints = [
    `Mention ${industry}-specific experience and local ${city} presence upfront`,
    `Lead with cost savings (20-30%) and reliability — most common pain points`,
    `Keep the ask small: a 20-minute walkthrough, not a commitment`,
    `Reference that the quote is free and on-the-spot to reduce friction`,
    `Always confirm a specific day/time, not an open-ended "sometime this week"`,
  ];

  const objectionHandlers = [
    {
      objection: "We already have a cleaning company",
      response: `"That's great to hear — most of our best clients did too before they switched. Can I ask, are you fully satisfied with the consistency and communication? We often do a complimentary side-by-side quote — no pressure, just good info to have."`,
    },
    {
      objection: "We're not interested / not looking right now",
      response: `"I completely understand, ${firstName}. Timing is everything. Would it be okay if I followed up in a couple months? And if anything changes before then, I'll make sure you have my direct number."`,
    },
    {
      objection: "Send me information by email",
      response: `"Absolutely, I'll send that right over. What's the best email for you? And just so the info is relevant — roughly how large is ${sq}? That helps me tailor what I send."`,
    },
    {
      objection: "We're under contract",
      response: `"Totally fair — contracts are there for a reason. When does that come up for renewal? I'd love to be on your radar so we can put together a proposal when the time is right. Would you be open to a 10-minute walkthrough just to have options?"`,
    },
    {
      objection: "Too busy right now",
      response: `"Understood — I'll be quick. The walkthrough only takes 20 minutes and I come to you. Would early morning or end of day work better so it doesn't cut into your schedule?"`,
    },
  ];

  return { script, keyPoints, objectionHandlers };
}

router.post("/generate-email", requireEntitlement, async (req, res) => {
  const body = GenerateEmailBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const result = generatePersonalizedEmail(prospect, client, body.tone);
  res.json(result);
});

router.post("/generate-call-script", requireEntitlement, async (req, res) => {
  const body = GenerateCallScriptBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, body.prospectId), eq(prospectsTable.clientId, req.clientId)));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const result = generateCallScript(prospect, client, body.objective);
  res.json(result);
});

// Company name pools per industry
const COMPANY_NAMES: Record<string, string[][]> = {
  Healthcare: [["Summit","Apex","Riverside","Crestview","Meridian","Northside","Lakeside","Pinecrest","Clearwater","Sunrise"],["Medical","Health","Dental","Clinic","Care","Wellness","Therapy","Surgical","Imaging","Rehab"],["Center","Group","Associates","Partners","Institute","Practice","Services","Network","Specialists","Solutions"]],
  Technology: [["Apex","Nexus","Vertex","Coda","Orbit","Flux","Cipher","Helix","Pulse","Vector"],["Tech","Software","Digital","Data","Cloud","AI","Systems","Labs","Solutions","Ventures"],["Inc","Group","Co","Hub","Works","Studio","Corp","Collective","Partners","Platform"]],
  Legal: [["Morrison","Harper","Blake","Sutton","Langford","Ashford","Caldwell","Drummond","Prescott","Whitfield"],["Law","Legal","Attorneys","Counsel","Advisory","Partners","Litigation","Associates","Defense","Injury"],["Group","LLP","LLC","PLLC","PC","Firm","Office","Practice","Services","Network"]],
  Finance: [["Metro","Pinnacle","Summit","Lakewood","Clearview","Prestige","Horizon","Capital","Alliance","Sterling"],["Financial","Capital","Investment","Wealth","Advisory","Asset","Equity","Fund","Banking","Consulting"],["Partners","Group","Services","Associates","Advisors","Management","Holdings","Solutions","Corp","Inc"]],
  "Commercial Real Estate": [["Greenfield","Harborview","Summit","Riverfront","Midtown","Lakewood","Westgate","Eastbrook","Centennial","Parkview"],["Property","Realty","Real Estate","Commercial","Office","Development","Management","Holdings","Investments","Ventures"],["Group","Partners","LLC","Corp","Associates","Services","Solutions","Network","Inc","Properties"]],
  "Logistics & Warehousing": [["Swift","Atlas","Titan","Apex","Horizon","Vanguard","Nexus","Crest","Patriot","Liberty"],["Logistics","Freight","Transport","Distribution","Supply Chain","Warehousing","Cargo","Shipping","Fulfillment","Delivery"],["Inc","Group","Solutions","Services","Corp","Partners","LLC","Co","Network","Systems"]],
  Manufacturing: [["Precision","Apex","Allied","Keystone","Ironside","Pinnacle","Superior","National","Heritage","Clearview"],["Manufacturing","Industrial","Fabrication","Production","Assembly","Components","Engineering","Materials","Metalworks","Plastics"],["Inc","Corp","Co","Group","LLC","Solutions","Systems","Industries","Works","Partners"]],
  Education: [["Horizon","Academy","Summit","Brightfield","Westwood","Northgate","Eastside","Lakewood","Ridgeline","Clearwater"],["Academy","Learning","Education","School","Institute","College","Training","Skills","Studies","Center"],["Group","Inc","LLC","Corp","Partners","Associates","Network","Services","Solutions","Foundation"]],
};

const CONTACT_FIRST = ["Michael","Sarah","David","Jennifer","Robert","Emily","James","Angela","Kevin","Rachel","Thomas","Diana","Marcus","Sandra","Brian","Lisa","Daniel","Patricia","Steven","Karen"];
const CONTACT_LAST = ["Johnson","Williams","Brown","Davis","Miller","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Garcia","Martinez","Robinson","Clark","Rodriguez"];
const TITLES = ["Facilities Manager","Office Manager","Operations Director","COO","General Manager","Property Manager","Building Manager","VP Operations","Executive Director","CEO"];

const INDUSTRY_EMAILS: Record<string, string> = {
  Healthcare: "medcenter.com,healthgroup.org,clinicpartners.com,carehealth.net,wellnessassoc.com",
  Technology: "techcorp.io,devhub.co,cloudworks.io,nexustech.com,softwarelab.io",
  Legal: "lawgroup.com,legalpartners.net,attorneyassoc.com,lawfirm.net,legalcounsel.com",
  Finance: "capitalgroup.com,financialpartners.net,investadvisors.com,wealthmgmt.com,capitalassoc.com",
  "Commercial Real Estate": "propertygroup.com,realtypartners.net,commercialprop.com,officerealty.com,propmanagement.com",
  "Logistics & Warehousing": "logisticsco.com,freightgroup.net,transportinc.com,supplychain.co,warehousesol.com",
  Manufacturing: "mfgcorp.com,industrialgroup.net,fabricationinc.com,productionco.com,mfgpartners.com",
  Education: "academygroup.com,edupartners.net,learninginc.com,schoolassoc.com,trainingcorp.com",
};

function seedRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return Math.abs(s) / 0x7fffffff; };
}

function generateProspects(city: string, state: string, industry: string, count: number) {
  const rng = seedRandom(city.length * 31 + state.length * 17 + industry.length * 7 + count);
  const pool = COMPANY_NAMES[industry] ?? COMPANY_NAMES["Technology"];
  const domains = (INDUSTRY_EMAILS[industry] ?? "businessgroup.com,corpinc.net,solutions.com,partners.org,associates.com").split(",");

  const EMP_RANGES: Record<string, [number,number]> = {
    Healthcare:[20,120], Technology:[30,200], Legal:[10,60], Finance:[15,80],
    "Commercial Real Estate":[5,25], "Logistics & Warehousing":[40,250],
    Manufacturing:[50,300], Education:[15,100],
  };
  const SQ_RANGES: Record<string, [number,number]> = {
    Healthcare:[4000,50000], Technology:[8000,40000], Legal:[3000,15000], Finance:[5000,20000],
    "Commercial Real Estate":[15000,80000], "Logistics & Warehousing":[30000,150000],
    Manufacturing:[20000,100000], Education:[10000,60000],
  };
  const [empMin, empMax] = EMP_RANGES[industry] ?? [20,100];
  const [sqMin, sqMax] = SQ_RANGES[industry] ?? [5000,30000];

  const WHY: Record<string, string[]> = {
    Healthcare:["Strict sanitization standards required for patient safety","Multi-floor facility with high foot traffic and HIPAA compliance needs","Daily cleaning of exam rooms and waiting areas is non-negotiable"],
    Technology:["Open-plan office with daily kitchen and common-area cleaning needs","Fast-growing headcount means cleaning load is increasing monthly","Tech offices often under-prioritize cleaning — opportunity to stand out"],
    Legal:["High-end clients visit frequently — appearance matters","Evening-only cleaning required for client confidentiality","Multiple conference rooms need daily turnaround"],
    Finance:["Professional appearance critical for client-facing floors","Strong need for discreet, background-checked cleaning staff","Consistent overnight service required 5 nights a week"],
    "Commercial Real Estate":["Multi-tenant building — one vendor for all tenants is preferred","Property manager makes decisions for entire portfolio","Strong ROI on clean common areas for tenant retention"],
    "Logistics & Warehousing":["Large warehouse floor + office wing needs separate cleaning protocols","Month-to-month contracts common — easy to switch","Dock areas and break rooms require industrial-grade cleaning"],
    Manufacturing:["Heavy production floor requires specialized cleaning protocols","OSHA compliance creates recurring deep-clean requirements","Office/plant mix is a strong fit for our bundled services"],
    Education:["High-traffic classrooms and restrooms need nightly service","Seasonal deep-cleans (summer, holidays) are a reliable revenue stream","Facilities manager often has budget authority for janitorial"],
  };

  const results = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const r = rng;
    let companyName = "";
    let attempts = 0;
    while (attempts < 20) {
      const w1 = pool[0][Math.floor(rng() * pool[0].length)];
      const w2 = pool[1][Math.floor(rng() * pool[1].length)];
      const w3 = pool[2][Math.floor(rng() * pool[2].length)];
      companyName = `${w1} ${w2} ${w3}`;
      if (!usedNames.has(companyName)) { usedNames.add(companyName); break; }
      attempts++;
    }

    const firstName = CONTACT_FIRST[Math.floor(rng() * CONTACT_FIRST.length)];
    const lastName = CONTACT_LAST[Math.floor(rng() * CONTACT_LAST.length)];
    const title = TITLES[Math.floor(rng() * TITLES.length)];
    const domain = domains[Math.floor(rng() * domains.length)];
    const emailUser = `${firstName.toLowerCase()[0]}${lastName.toLowerCase()}`;
    const email = `${emailUser}@${companyName.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,12)}${domain.split(".").pop() ? `.${domain.split(".").pop()}` : ".com"}`;
    const areaCode = 200 + Math.floor(rng() * 800);
    const phone = `(${areaCode}) ${Math.floor(100 + rng() * 900)}-${Math.floor(1000 + rng() * 9000)}`;
    const emp = Math.floor(empMin + rng() * (empMax - empMin));
    const sq = Math.floor(sqMin + rng() * (sqMax - sqMin));
    sq; // suppress
    const reasons = WHY[industry] ?? ["Strong fit for commercial janitorial services","High foot traffic facility with regular cleaning needs","Decision-maker is typically accessible and budget-holding"];
    const why = reasons[Math.floor(rng() * reasons.length)];
    const confRoll = rng();
    const confidence = confRoll > 0.6 ? "high" : confRoll > 0.3 ? "medium" : "low";
    const shortName = companyName.toLowerCase().replace(/\s+/g,"").slice(0,14);
    const tld = ["com","net","org","io"][Math.floor(rng() * 4)];
    const website = `${shortName}.${tld}`;

    results.push({
      companyName,
      contactName: `${firstName} ${lastName}`,
      contactTitle: title,
      email: `${emailUser}@${shortName}.${tld}`,
      phone,
      industry,
      city,
      state,
      website,
      estimatedEmployees: emp,
      estimatedSquareFootage: Math.floor(sqMin + rng() * (sqMax - sqMin)),
      whyTarget: why,
      confidence,
    });
  }
  return results;
}

// ─── IT Services prospect generation (isolated from janitorial pools above) ───

const IT_INDUSTRIES = [
  "Commercial","Healthcare","Retail","Financial Services","Legal","Insurance",
  "Manufacturing","Construction","Logistics","Professional Services","Nonprofit",
  "Hospitality","Real Estate",
] as const;

const IT_COMPANY_NAMES: Record<string, string[][]> = {
  Commercial: [["Summit","Apex","Cornerstone","Beacon","Pinnacle","Frontier","Heritage","Keystone","Sterling","Vanguard"],["Business","Commercial","Enterprise","Trade","Service","Operations","Ventures","Commerce","Industries","Solutions"],["Group","Inc","Co","Partners","LLC","Corp","Associates","Services","Holdings","Network"]],
  Healthcare: [["Summit","Riverside","Crestview","Meridian","Northside","Lakeside","Pinecrest","Clearwater","Sunrise","Harborview"],["Medical","Health","Dental","Clinic","Care","Wellness","Surgical","Imaging","Rehab","Behavioral Health"],["Center","Group","Associates","Partners","Practice","Network","Specialists","Institute","Services","Solutions"]],
  Retail: [["Metro","Urban","Hometown","Signature","Prime","Central","Coastal","Evergreen","Liberty","Grandview"],["Retail","Market","Goods","Furnishings","Auto","Grocery","Outfitters","Supply","Merchants","Home"],["Group","Stores","Co","Inc","LLC","Brands","Company","Collective","Partners","Outlets"]],
  "Financial Services": [["Metro","Pinnacle","Summit","Lakewood","Clearview","Prestige","Horizon","Capital","Alliance","Sterling"],["Financial","Capital","Investment","Wealth","Advisory","Asset","Equity","Accounting","Banking","Tax"],["Partners","Group","Services","Associates","Advisors","Management","Holdings","Solutions","Corp","Inc"]],
  Legal: [["Morrison","Harper","Blake","Sutton","Langford","Ashford","Caldwell","Drummond","Prescott","Whitfield"],["Law","Legal","Attorneys","Counsel","Advisory","Partners","Litigation","Associates","Defense","Injury"],["Group","LLP","LLC","PLLC","PC","Firm","Office","Practice","Services","Network"]],
  Insurance: [["Shield","Anchor","Guardian","Beacon","Cornerstone","Heritage","Reliant","Assurant","Homestead","Foundation"],["Insurance","Risk","Assurance","Benefits","Coverage","Underwriting","Brokerage","Indemnity","Protection","Casualty"],["Agency","Group","Partners","Associates","Services","LLC","Inc","Advisors","Brokers","Co"]],
  Manufacturing: [["Precision","Apex","Allied","Keystone","Ironside","Pinnacle","Superior","National","Heritage","Clearview"],["Manufacturing","Industrial","Fabrication","Production","Assembly","Components","Engineering","Materials","Metalworks","Plastics"],["Inc","Corp","Co","Group","LLC","Solutions","Systems","Industries","Works","Partners"]],
  Construction: [["Granite","Ridgeline","Bluestone","Ironwood","Summit","Foundation","Trueline","Bedrock","Northstar","Crossland"],["Construction","Builders","Contracting","Development","Engineering","Concrete","Structures","Framing","Excavation","Design-Build"],["Inc","Group","Co","LLC","Corp","Partners","Services","Companies","Associates","Enterprises"]],
  Logistics: [["Swift","Atlas","Titan","Apex","Horizon","Vanguard","Nexus","Crest","Patriot","Liberty"],["Logistics","Freight","Transport","Distribution","Supply Chain","Warehousing","Cargo","Shipping","Fulfillment","Delivery"],["Inc","Group","Solutions","Services","Corp","Partners","LLC","Co","Network","Systems"]],
  "Professional Services": [["Bright","Cornerstone","Meridian","Compass","Clearpath","Vantage","Elevate","Insight","Catalyst","Northgate"],["Consulting","Engineering","Architecture","Marketing","Staffing","Design","Advisory","Research","Strategy","Communications"],["Group","Partners","LLC","Inc","Associates","Firm","Studio","Collective","Services","Co"]],
  Nonprofit: [["Community","Hope","Bridge","Unity","Harvest","Beacon","Cornerstone","Horizon","Foundations","Neighbor"],["Outreach","Foundation","Alliance","Services","Coalition","Charities","Ministries","Network","Initiative","Fund"],["Inc","Center","Association","Organization","Group","Society","Partners","Council","Trust","Project"]],
  Hospitality: [["Grandview","Harbor","Lakeside","Summit","Magnolia","Cypress","Beacon","Heritage","Crestwood","Solstice"],["Hospitality","Hotels","Resorts","Dining","Restaurants","Lodging","Events","Catering","Suites","Venues"],["Group","Inc","LLC","Co","Partners","Collection","Management","Brands","Properties","Company"]],
  "Real Estate": [["Greenfield","Harborview","Summit","Riverfront","Midtown","Lakewood","Westgate","Eastbrook","Centennial","Parkview"],["Property","Realty","Real Estate","Commercial","Office","Development","Management","Holdings","Investments","Ventures"],["Group","Partners","LLC","Corp","Associates","Services","Solutions","Network","Inc","Properties"]],
};

// [min,max] typical employee counts inside the 5–2000 target range
const IT_EMP_RANGES: Record<string, [number, number]> = {
  Commercial:[10,300], Healthcare:[15,400], Retail:[20,600], "Financial Services":[8,150],
  Legal:[5,120], Insurance:[5,100], Manufacturing:[40,800], Construction:[15,350],
  Logistics:[30,700], "Professional Services":[8,200], Nonprofit:[10,250],
  Hospitality:[25,900], "Real Estate":[5,150],
};

const COMPLIANCE_SENSITIVE = new Set(["Healthcare","Financial Services","Legal","Insurance","Retail","Manufacturing","Construction","Nonprofit"]);

const IT_COMPLIANCE: Record<string, string> = {
  Healthcare: "Likely HIPAA and HITECH-related security requirements",
  "Financial Services": "Likely GLBA and FTC Safeguards Rule obligations; potential SOC 2 expectations",
  Legal: "Likely client-confidentiality and data privacy requirements; potential SOC 2 expectations",
  Insurance: "Likely FTC Safeguards Rule and state data privacy requirements",
  Retail: "Likely PCI DSS payment security requirements",
  Hospitality: "Likely PCI DSS payment security and guest data privacy requirements",
  Manufacturing: "Potential NIST 800-171 / CMMC requirements if serving government supply chains",
  Construction: "Potential NIST 800-171 / CMMC requirements for government contract work",
  Logistics: "Potential supply-chain security and cyber-insurance requirements",
  "Professional Services": "Potential SOC 2 and client vendor-security assessment requirements",
  Nonprofit: "Likely donor data privacy and cyber-insurance security requirements",
  Commercial: "Potential state privacy and cyber-insurance security requirements",
  "Real Estate": "Likely wire-fraud prevention and state privacy requirements",
};

const IT_NEEDS: Record<string, string[]> = {
  Healthcare: ["Managed IT","Cybersecurity assessment","HIPAA compliance support","Backup and disaster recovery","Microsoft 365 management"],
  "Financial Services": ["Cybersecurity","Compliance consulting","Managed IT","Email security and Microsoft 365","Backup and disaster recovery"],
  Legal: ["Cybersecurity","Document management and Microsoft 365","Managed IT","Email encryption","Backup and disaster recovery"],
  Insurance: ["Cybersecurity","Compliance support","Managed IT","Microsoft 365 licensing","VoIP and unified communications"],
  Retail: ["Network management","Cybersecurity and PCI support","Managed IT","Help-desk support","VoIP"],
  Hospitality: ["Guest Wi-Fi and network management","Cybersecurity","Managed IT","VoIP","Help-desk support"],
  Manufacturing: ["Managed IT","OT/IT network security","Cybersecurity assessment","Backup and disaster recovery","Compliance consulting"],
  Construction: ["Mobile device management","Managed IT","Cybersecurity","Cloud services","Microsoft 365"],
  Logistics: ["Network management","Mobile device management","Cybersecurity","Managed IT","Backup and disaster recovery"],
  "Professional Services": ["Managed IT","Microsoft 365 optimization","Cybersecurity","Cloud services","Help-desk support"],
  Nonprofit: ["Managed IT","Microsoft 365 nonprofit licensing","Cybersecurity awareness training","Cloud services","Backup and disaster recovery"],
  Commercial: ["Managed IT","Cybersecurity","Microsoft 365","Help-desk support","Network management"],
  "Real Estate": ["Managed IT","Cybersecurity and wire-fraud prevention","Microsoft 365","Cloud services","Mobile device management"],
};

const IT_WHY: Record<string, string[]> = {
  Healthcare: ["Compliance-sensitive practice — likely needs security and HIPAA support beyond in-house capacity","Patient systems demand uptime; likely candidate for proactive managed IT","Multiple providers and devices suggest mobile device management needs"],
  "Financial Services": ["Handles sensitive financial data — likely cybersecurity and compliance need","Regulatory expectations make managed security services a strong fit","Client trust depends on secure email and document handling"],
  Legal: ["Privileged client data makes security a likely priority","Attorneys working remotely suggest device and email security needs","Small internal IT footprint typical — strong managed IT candidate"],
  Insurance: ["Client PII handling suggests likely compliance and security needs","Agency size typically lacks internal IT leadership","Cyber-insurance carriers increasingly require security controls"],
  Retail: ["Payment processing implies likely PCI security needs","Multi-location retail benefits from centralized network management","Seasonal staffing makes help-desk outsourcing attractive"],
  Hospitality: ["Guest Wi-Fi and payment systems create likely security needs","Multi-property operations benefit from managed network services","High staff turnover suggests security awareness training need"],
  Manufacturing: ["Production downtime risk makes managed security a likely fit","Potential government supply-chain compliance requirements","Plant-floor and office systems typically under-supported"],
  Construction: ["Field teams on mobile devices suggest MDM needs","Project data in the cloud implies backup and security needs","Growing firms rarely have internal IT leadership"],
  Logistics: ["Warehouse systems and scanners imply device management needs","Shipment data security increasingly required by partners","Operational downtime is costly — proactive IT is a likely fit"],
  "Professional Services": ["Client vendor-security questionnaires drive likely SOC 2 interest","Knowledge workers rely on Microsoft 365 — optimization opportunity","Growth-stage firms typically outgrow break/fix IT support"],
  Nonprofit: ["Limited budgets favor outsourced IT over internal hires","Donor data privacy creates likely security needs","Eligible for nonprofit licensing — cost-savings angle"],
  Commercial: ["Mid-sized operations typically lack dedicated IT staff","Likely candidates for bundled managed IT and security","Growing businesses face increasing cyber-insurance requirements"],
  "Real Estate": ["Wire-transfer fraud risk makes email security a likely priority","Distributed agents suggest device and identity management needs","Transaction data privacy expectations are rising"],
};

const IT_OUTREACH: Record<string, string> = {
  Healthcare: "Offer a cybersecurity and compliance readiness assessment tailored to medical operations",
  "Financial Services": "Offer a compliance readiness review covering GLBA / FTC Safeguards controls",
  Legal: "Offer a confidential technology assessment focused on client-data security",
  Insurance: "Offer a cyber-insurance readiness review and security gap assessment",
  Retail: "Offer a network and payment-security assessment across locations",
  Hospitality: "Offer a guest network and payment-security technology assessment",
  Manufacturing: "Offer a discovery call on OT/IT security and supply-chain compliance readiness",
  Construction: "Offer a technology assessment covering field devices and project-data protection",
  Logistics: "Offer a network assessment covering warehouse systems and device management",
  "Professional Services": "Offer a discovery call on SOC 2 readiness and Microsoft 365 optimization",
  Nonprofit: "Offer an IT consultation highlighting nonprofit licensing savings and security basics",
  Commercial: "Offer a free technology assessment to benchmark IT support and security posture",
  "Real Estate": "Offer a cybersecurity assessment focused on wire-fraud prevention",
};

const IT_TITLES_SMALL = ["Owner","President","Operations Manager","Office Manager","Practice Administrator"];
const IT_TITLES_LARGE = ["CIO","CTO","CISO","IT Director","IT Manager","Compliance Officer","Director of Operations"];
const IT_RELEVANT_TITLES = new Set(["CIO","CTO","CISO","IT Director","IT Manager","Compliance Officer"]);

const COMPLIANCE_PRIORITY_INDUSTRIES: Record<string, string[]> = {
  "High Compliance Need": ["Healthcare","Financial Services","Legal","Insurance"],
  "Healthcare Compliance": ["Healthcare"],
  "Financial Compliance": ["Financial Services","Insurance"],
  "Government Contractor Compliance": ["Manufacturing","Construction","Logistics"],
  "Retail and Payment Security": ["Retail","Hospitality"],
  "Data Privacy Requirements": ["Legal","Professional Services","Real Estate","Nonprofit"],
};

function parseEmployeeRange(range?: string): [number, number] | null {
  if (!range) return null;
  const m = range.replace(/,/g, "").match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const min = Math.max(5, parseInt(m[1], 10));
  const max = Math.min(2000, parseInt(m[2], 10));
  return min <= max ? [min, max] : null;
}

function generateItProspects(city: string, state: string, industry: string, count: number, employeeRange?: string, compliancePriority?: string) {
  const rng = seedRandom(city.length * 37 + state.length * 13 + industry.length * 11 + count + (employeeRange?.length ?? 0) * 5 + (compliancePriority?.length ?? 0) * 3);

  // Resolve which industries to draw from
  let industryPool: string[];
  if (industry && industry !== "All Industries") {
    industryPool = [industry];
  } else if (compliancePriority && compliancePriority !== "All Prospects" && COMPLIANCE_PRIORITY_INDUSTRIES[compliancePriority]) {
    industryPool = COMPLIANCE_PRIORITY_INDUSTRIES[compliancePriority];
  } else {
    industryPool = [...IT_INDUSTRIES];
  }

  const empFilter = parseEmployeeRange(employeeRange);
  const results = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const ind = industryPool[Math.floor(rng() * industryPool.length)];
    const pool = IT_COMPANY_NAMES[ind] ?? IT_COMPANY_NAMES["Commercial"];

    let companyName = "";
    let attempts = 0;
    while (attempts < 20) {
      const w1 = pool[0][Math.floor(rng() * pool[0].length)];
      const w2 = pool[1][Math.floor(rng() * pool[1].length)];
      const w3 = pool[2][Math.floor(rng() * pool[2].length)];
      companyName = `${w1} ${w2} ${w3}`;
      if (!usedNames.has(companyName)) { usedNames.add(companyName); break; }
      attempts++;
    }

    // Employee count: 5–2000, respecting an explicit range filter
    const [defMin, defMax] = IT_EMP_RANGES[ind] ?? [10, 300];
    const [empMin, empMax] = empFilter ?? [defMin, defMax];
    const emp = Math.floor(empMin + rng() * (empMax - empMin + 1));

    const titles = emp > 100 ? IT_TITLES_LARGE : IT_TITLES_SMALL;
    const title = titles[Math.floor(rng() * titles.length)];
    const firstName = CONTACT_FIRST[Math.floor(rng() * CONTACT_FIRST.length)];
    const lastName = CONTACT_LAST[Math.floor(rng() * CONTACT_LAST.length)];

    const shortName = companyName.toLowerCase().replace(/\s+/g, "").slice(0, 14);
    const tld = ["com", "net", "org", "io"][Math.floor(rng() * 4)];
    const website = `${shortName}.${tld}`;
    const emailUser = `${firstName.toLowerCase()[0]}${lastName.toLowerCase()}`;
    const areaCode = 200 + Math.floor(rng() * 800);
    const phone = `(${areaCode}) ${Math.floor(100 + rng() * 900)}-${Math.floor(1000 + rng() * 9000)}`;

    const locations = rng() > 0.65 ? 2 + Math.floor(rng() * 5) : 1;

    // ── IT Opportunity Score (0–100) per scoring factors ──
    const inSweetSpot = emp >= 25 && emp <= 500;
    const empScore = inSweetSpot ? 15 : 10;                                       // max 15
    const isCompliance = COMPLIANCE_SENSITIVE.has(ind);
    const complianceScore = isCompliance ? 20 : 6 + Math.floor(rng() * 6);        // max 20
    const multiLocScore = locations > 1 ? 10 : 0;                                 // max 10
    const managedItScore = 8 + Math.floor(rng() * 8);                             // max 15
    const cyberScore = isCompliance ? 14 + Math.floor(rng() * 7) : 8 + Math.floor(rng() * 9); // max 20
    const dmScore = IT_RELEVANT_TITLES.has(title) ? 10 : 6;                       // max 10
    const growthScore = Math.floor(rng() * 11);                                   // max 10
    const opportunityScore = Math.min(100, empScore + complianceScore + multiLocScore + managedItScore + cyberScore + dmScore + growthScore);
    const scoreLabel = opportunityScore >= 80 ? "High Priority" : opportunityScore >= 60 ? "Strong Fit" : opportunityScore >= 40 ? "Possible Fit" : "Low Priority";

    const complianceConsideration = IT_COMPLIANCE[ind] ?? "Potential state privacy and cyber-insurance security requirements";
    const explanationParts = [
      `${ind} organization with an estimated ${emp} employees`,
      locations > 1 ? `${locations} locations (inferred)` : "single location (inferred)",
      isCompliance ? "compliance-sensitive industry" : "likely managed IT and security needs",
      `${title} identified as likely decision-maker`,
    ];
    const scoreExplanation = `${explanationParts.join(", ")}. Details are inferred estimates, not confirmed facts.`;

    const needsPool = IT_NEEDS[ind] ?? IT_NEEDS["Commercial"];
    const needStart = Math.floor(rng() * needsPool.length);
    const potentialNeeds = [0, 1, 2].map((o) => needsPool[(needStart + o) % needsPool.length]);

    const whyPool = IT_WHY[ind] ?? IT_WHY["Commercial"];
    const whyTarget = whyPool[Math.floor(rng() * whyPool.length)];

    const confRoll = rng();
    const confidence = confRoll > 0.6 ? "high" : confRoll > 0.3 ? "medium" : "low";

    results.push({
      companyName,
      contactName: `${firstName} ${lastName}`,
      contactTitle: title,
      email: `${emailUser}@${shortName}.${tld}`,
      phone,
      industry: ind,
      city,
      state,
      website,
      estimatedEmployees: emp,
      whyTarget,
      confidence,
      vertical: "it_services",
      opportunityScore,
      scoreLabel,
      scoreExplanation,
      estimatedLocations: locations,
      potentialNeeds,
      complianceConsideration,
      recommendedOutreach: IT_OUTREACH[ind] ?? IT_OUTREACH["Commercial"],
    });
  }
  return results;
}

router.post("/prospect-search", requireEntitlement, async (req, res) => {
  const body = ProspectSearchBody.parse(req.body);
  const count = Math.min(body.count, 20);
  const [client] = await db.select().from(usersTable).where(eq(usersTable.id, req.clientId));
  const vertical = getVerticalConfig(client?.vertical).key;
  const leads = vertical === "it_services"
    ? generateItProspects(body.city, body.state, body.industry, count, body.employeeRange ?? undefined, body.compliancePriority ?? undefined)
    : generateProspects(body.city, body.state, body.industry, count).map((l) => ({ ...l, vertical: "janitorial" }));
  res.json(leads);
});

export default router;

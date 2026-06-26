import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GenerateEmailBody, GenerateCallScriptBody, ProspectSearchBody } from "@workspace/api-zod";

const router = Router();

function generatePersonalizedEmail(prospect: typeof prospectsTable.$inferSelect, tone: string = "professional") {
  const { companyName, contactName, industry, city, state, squareFootage, employeeCount } = prospect;
  const firstName = contactName.split(" ")[0];
  const sq = squareFootage ? `${squareFootage.toLocaleString()} sq ft` : null;
  const emp = employeeCount ? `${employeeCount}-person` : null;

  const subjects = [
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
  const companyDetail = emp ? `${emp} team` : `your team`;

  const body = `${opening}

I hope this message finds you well. My name is Alex Carter, and I represent CleanPro Janitorial Services — a commercial cleaning company specializing in ${industry} facilities across ${state}.

I noticed ${companyName} operates ${facilityDetail}, and I wanted to reach out about how we can help keep your workspace in top condition so ${companyDetail} can stay focused on what you do best.

Here's what we bring to ${industry} companies like yours:
• Customized cleaning schedules (nightly, weekly, or as-needed)
• Fully bonded and insured crew with background checks
• Green cleaning products available upon request
• Dedicated account manager and 24/7 emergency response

We currently service several ${industry} businesses in ${city} and consistently receive 5-star reviews for reliability and attention to detail.

I'd love to schedule a free walkthrough of ${facilityDetail} so we can put together a no-obligation quote tailored to your specific needs.

Would you have 15 minutes this week for a quick call or site visit?

Best regards,
Alex Carter
Business Development | CleanPro Janitorial Services
(555) 248-1100 | alex@cleanpro.com`;

  return { subject, body };
}

function generateCallScript(prospect: typeof prospectsTable.$inferSelect, objective: string = "set appointment") {
  const { companyName, contactName, industry, city, squareFootage } = prospect;
  const firstName = contactName.split(" ")[0];
  const sq = squareFootage ? `your ${squareFootage.toLocaleString()} sq ft space` : `your facility`;

  const script = `OPENING (0:00 – 0:30)
"Good [morning/afternoon], may I speak with ${firstName}? … Hi ${firstName}, this is Alex Carter calling from CleanPro Janitorial Services. I'm reaching out to ${industry} businesses in ${city} — I'll keep this brief, I promise. Do you have about 60 seconds?"

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

router.post("/generate-email", async (req, res) => {
  const body = GenerateEmailBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, body.prospectId));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const result = generatePersonalizedEmail(prospect, body.tone);
  res.json(result);
});

router.post("/generate-call-script", async (req, res) => {
  const body = GenerateCallScriptBody.parse(req.body);
  const [prospect] = await db.select().from(prospectsTable).where(eq(prospectsTable.id, body.prospectId));
  if (!prospect) return res.status(404).json({ error: "Prospect not found" });
  const result = generateCallScript(prospect, body.objective);
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

const INDUSTRY_EMAILS: Record<string, string[]> = {
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

router.post("/prospect-search", async (req, res) => {
  const body = ProspectSearchBody.parse(req.body);
  const count = Math.min(body.count, 20);
  const leads = generateProspects(body.city, body.state, body.industry, count);
  res.json(leads);
});

export default router;

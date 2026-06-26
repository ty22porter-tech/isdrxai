import { Router } from "express";
import { db } from "@workspace/db";
import { prospectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GenerateEmailBody, GenerateCallScriptBody } from "@workspace/api-zod";

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

export default router;

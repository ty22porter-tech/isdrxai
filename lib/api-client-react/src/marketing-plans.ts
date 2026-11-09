/** Shared public plan copy. Founding20 is a discount on Standard, not a separate feature tier. */
export const STARTER_INTRO_OFFER = "Founding20: $249/month instead of $499 — first 20 successful redeemers";
export const FOUNDING_TERMS = "Enter Founding20 in the app before checkout. Eligible new subscribers receive the full 1,000-email, 1-user iSDRX AI plan for $249/month for as long as they keep that qualifying subscription, with the $995 onboarding fee waived. Limited to 20 successful redemptions. Without an accepted code, standard pricing and onboarding apply. Not valid for Growth, Enterprise, or AI+.";
export const STANDARD_PLAN = {
  name: "iSDRX AI", price: "$499", priceNote: "/month",
  tagline: "Turn prospect research and buying signals into consistent, multi-step outreach and qualified pipeline.",
  emails: "Up to 1,000 personalized AI emails / month", users: "Includes 1 user",
  features: ["Up to 1,000 personalized AI emails per month", "1 User license", "1 Sending Domain", "CSV Upload", "Prospect Search", "AI Email Generation", "AI Follow-Up", "Basic CRM", "Appointment Booking", "Dashboard", "Advanced AI Personalization", "Multi-Step AI Campaigns", "Team Dashboard", "Pipeline Reporting", "Priority Support"],
};
export const GROWTH_PLAN = {
  name: "iSDRX AI Growth", price: "$749", priceNote: "/month",
  tagline: "Expand personalized prospecting, team visibility, and pipeline generation across a growing sales organization.",
  emails: "Up to 3,000 personalized AI emails / month", users: "Includes up to 3 users",
  features: ["Up to 3,000 personalized AI emails per month", "Up to 3 User licenses", "1 Sending Domain", "Everything in iSDRX AI", "CRM Integration", "API Access", "Enhanced Implementation Support"],
};
export const ENTERPRISE_PLAN = {
  name: "Enterprise", price: "Contact Sales", priceNote: "",
  tagline: "Custom capacity, integrations, and support at scale.",
  emails: "Custom personalized AI email capacity", users: "5 or more users",
  features: [
    "Custom personalized AI email capacity", "5 or more User licenses", "Unlimited Sending Domains",
    "Custom Integrations", "Dedicated Customer Success Manager", "Custom AI Training",
    "Single Sign-On (SSO)", "SLA Support",
  ],
};

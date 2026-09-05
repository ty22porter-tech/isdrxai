import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  Rocket,
  Mail,
  BadgeCheck,
  Building2,
  PhoneCall,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { trackConversionClick, trackEvent } from "@/lib/analytics";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

const SALES_EMAIL = "sales@isdrxai.com";

type Tier = {
  key: string;
  productName: string | null;
  name: string;
  price: string;
  priceNote: string;
  emails: string;
  users: string;
  tagline: string;
  features: string[];
  popular?: boolean;
  cta: string;
  contactHref?: string;
};

const TIERS: Tier[] = [
  {
    key: "starter",
    productName: "iSDRX AI Starter",
    name: "iSDRX AI Starter",
    price: "$249",
    priceNote: "/month",
    emails: "Up to 500 personalized AI emails / month",
    users: "Includes 1 user",
    tagline: "Find high-fit prospects, personalize outreach, and guide interested buyers toward a meeting.",
    features: [
      "Up to 500 personalized AI emails per month",
      "1 User license",
      "1 Sending Domain",
      "CSV Upload",
      "Prospect Search",
      "AI Email Generation",
      "AI Follow-Up",
      "Basic CRM",
      "Appointment Booking",
      "Dashboard",
      "Email Support",
    ],
    cta: "Start 14-Day Free Trial",
  },
  {
    key: "growth",
    productName: "iSDRX AI",
    name: "iSDRX AI",
    price: "$499",
    priceNote: "/month",
    emails: "Up to 1,000 personalized AI emails / month",
    users: "Includes 1 user",
    tagline: "Turn prospect research and buying signals into consistent, multi-step outreach and qualified pipeline.",
    features: [
      "Up to 1,000 personalized AI emails per month",
      "1 User license",
      "1 Sending Domain",
      "Everything in iSDRX AI Starter",
      "Advanced AI Personalization",
      "Multi-Step AI Campaigns",
      "Team Dashboard",
      "Pipeline Reporting",
      "Priority Support",
    ],
    popular: true,
    cta: "Start 14-Day Free Trial",
  },
  {
    key: "professional",
    productName: "iSDRX AI Growth",
    name: "iSDRX AI Growth",
    price: "$799",
    priceNote: "/month",
    emails: "Up to 2,500 personalized AI emails / month",
    users: "Includes 3 users",
    tagline: "Expand personalized prospecting, team visibility, and pipeline generation across a growing sales organization.",
    features: [
      "Up to 2,500 personalized AI emails per month",
      "3 User licenses",
      "1 Sending Domain",
      "Everything in iSDRX AI",
      "CRM Integration",
      "API Access",
      "Enhanced Implementation Support",
    ],
    cta: "Start 14-Day Free Trial",
  },
  {
    key: "ai-plus",
    productName: null,
    name: "iSDRX AI+",
    price: "Contact Us",
    priceNote: "",
    emails: "Adds managed calling to your selected plan",
    users: "Works with any iSDRX AI package",
    tagline: "Add AI-Triggered Human Calling to follow through with engaged prospects and help them book.",
    features: [
      "Calls to interested and highly engaged prospects",
      "Initial qualification and conversation management",
      "Live transfers to designated team members",
      "Appointment or walkthrough scheduling",
      "Call outcomes and conversation notes",
      "Complete activity tracking within the dashboard",
    ],
    cta: "Contact Us",
    contactHref: "/contact-us",
  },
  {
    key: "enterprise",
    productName: null,
    name: "Enterprise",
    price: "Contact Sales",
    priceNote: "",
    emails: "Custom personalized AI email capacity",
    users: "5 or more users",
    tagline: "Custom capacity, integrations, and support at scale.",
    features: [
      "Custom personalized AI email capacity",
      "5 or more User licenses",
      "Unlimited Sending Domains",
      "Custom Integrations",
      "Dedicated Customer Success Manager",
      "Custom AI Training",
      "Single Sign-On (SSO)",
      "SLA Support",
    ],
    cta: "Contact Sales",
  },
];

const LAUNCH_PACKAGE_ITEMS = [
  "Account Configuration",
  "Domain Configuration",
  "DNS Authentication (SPF, DKIM, DMARC)",
  "Email Platform Configuration",
  "Calendar Integration",
  "ICP Development",
  "AI Prompt Customization",
  "Sales Workflow Configuration",
  "Initial Campaign Setup",
  "CRM Configuration",
  "Live Implementation Session",
  "Customer Training",
];

const COMPARISON_ROWS: Array<{ label: string; values: [string, string, string, string, string] }> = [
  { label: "Personalized AI email capacity / month", values: ["Up to 500", "Up to 1,000", "Up to 2,500", "Selected base plan", "Custom"] },
  { label: "User licenses", values: ["1", "1", "3", "Selected base plan", "5 or more"] },
  { label: "Sending domains", values: ["1", "1", "1", "Selected base plan", "Unlimited"] },
  { label: "AI email generation & follow-up", values: ["✓", "✓", "✓", "✓", "✓"] },
  { label: "Prospect search & CSV upload", values: ["✓", "✓", "✓", "✓", "✓"] },
  { label: "Appointment booking", values: ["✓", "✓", "✓", "✓", "✓"] },
  { label: "Advanced AI personalization", values: ["—", "✓", "✓", "By base plan", "✓"] },
  { label: "Multi-step AI campaigns", values: ["—", "✓", "✓", "By base plan", "✓"] },
  { label: "Team dashboard & pipeline reporting", values: ["—", "✓", "✓", "By base plan", "✓"] },
  { label: "CRM integration & API access", values: ["—", "—", "✓", "By base plan", "✓"] },
  { label: "AI-Triggered Human Calling", values: ["—", "—", "—", "✓", "Custom"] },
  { label: "Engaged-prospect phone follow-up", values: ["—", "—", "—", "✓", "Custom"] },
  { label: "Interest confirmation & qualification", values: ["—", "—", "—", "✓", "Custom"] },
  { label: "Live transfers & assisted scheduling", values: ["—", "—", "—", "✓", "Custom"] },
  { label: "Call outcomes, notes & bookings tracked", values: ["—", "—", "—", "✓", "Custom"] },
  { label: "Custom AI training & SSO", values: ["—", "—", "—", "By base plan", "✓"] },
  { label: "Support", values: ["Email", "Priority", "Enhanced implementation", "Managed calling service", "Dedicated CSM + SLA"] },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How is iSDRX AI priced?",
    a: "iSDRX AI is licensed per user — not per domain. iSDRX AI Starter and iSDRX AI each include 1 user, iSDRX AI Growth includes 3 users, and Enterprise covers 5 or more users. Each plan also includes monthly capacity for personalized AI emails sent through the platform. Need more capacity or users? Upgrade your plan anytime.",
  },
  {
    q: "How does the 14-day free trial work?",
    a: "iSDRX AI Starter, iSDRX AI, and iSDRX AI Growth include a 14-day free trial with full access to the selected subscription plan. We collect a card at sign-up, and your paid subscription begins automatically when the trial ends unless you cancel first. AI+ and Enterprise are sales-assisted services—contact us to discuss those options.",
  },
  {
    q: "What is the AI Sales Launch Package and why is it required?",
    a: "The AI Sales Launch Package ($995 one-time) is our hands-on implementation service: we configure your account, authenticate your sending domain (SPF, DKIM, DMARC), customize your AI prompts, build your ideal customer profile, set up your first campaign, and train your team. It's required for every subscription because proper setup is what makes AI outreach land in inboxes instead of spam folders.",
  },
  {
    q: "What happens if I use all my monthly email sends?",
    a: "We'll notify you in the app and by email as you approach your limit. Once you reach it, sending pauses until your next billing cycle — or you can upgrade to the next tier at any time to keep going without interruption.",
  },
  {
    q: "Can I upgrade or downgrade my plan?",
    a: "Yes. You can upgrade, downgrade, or cancel anytime from the secure billing portal. Upgrades take effect immediately so you get more sending capacity right away.",
  },
  {
    q: "Do you offer discounts or promo codes?",
    a: "Yes — if you have a coupon or promotional code, you can enter it during checkout and the discount is applied automatically.",
  },
  {
    q: "Is my payment information secure?",
    a: "All payments are processed by Stripe, a PCI Level 1 certified payment provider. Your card details never touch our servers.",
  },
];

export default function Pricing() {
  const { toast } = useToast();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch("/stripe/products"),
  });

  const products: any[] = productsData?.products ?? [];

  const priceIdFor = (productName: string | null): string | null => {
    if (!productName) return null;
    const product = products.find((p) => p.name === productName);
    const monthly = product?.prices?.find((pr: any) => pr.recurring?.interval === "month");
    return monthly?.id ?? null;
  };

  const handleCheckout = async (tier: Tier, location = `pricing_${tier.key}`) => {
    trackConversionClick(tier.productName ? "start_trial" : "get_started", location);
    if (!tier.productName) {
      if (tier.contactHref) {
        window.location.href = tier.contactHref;
      } else {
        window.location.href = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`iSDRX AI ${tier.name} Inquiry`)}`;
      }
      return;
    }
    const priceId = priceIdFor(tier.productName);
    if (!priceId) {
      toast({
        title: "Plan unavailable",
        description: "This plan isn't ready for checkout yet. Please try again shortly.",
        variant: "destructive",
      });
      return;
    }
    setLoadingTier(tier.key);
    try {
      const data = await apiFetch("/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      if (data.url) {
        trackEvent("trial_checkout_started", { plan: tier.key, location });
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({
        title: "Couldn't start checkout",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-14 pb-16">
        {/* Hero */}
        <div className="text-center space-y-4 pt-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary font-medium">
            <Mail className="w-4 h-4" />
            Licensed per user — not per domain
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Simple pricing that scales with your outreach
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Each plan is licensed per user. Pick the monthly AI email capacity you need —
            upgrade anytime as your pipeline grows.
          </p>
        </div>

        {/* Trial banner */}
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <Sparkles className="w-6 h-6 text-sky-400 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-sky-300">14-Day Free Trial on every self-service plan</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Starter, iSDRX AI, and Growth include full access during the trial. Card collected at sign-up; billing
              starts automatically after the trial unless you cancel. We'll email you reminders at 7,
              3, and 1 day before it ends. AI+ and Enterprise are available by contacting us.
            </div>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-5">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`relative rounded-xl border bg-card p-6 flex flex-col ${
                tier.popular ? "border-primary shadow-lg shadow-primary/10" : ""
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground whitespace-nowrap">
                  Most Popular
                </div>
              )}
              <div className="flex items-center gap-2">
                {tier.key === "enterprise" ? (
                  <Building2 className="w-5 h-5 text-primary" />
                ) : tier.key === "ai-plus" ? (
                  <PhoneCall className="w-5 h-5 text-primary" />
                ) : (
                  <Rocket className="w-5 h-5 text-primary" />
                )}
                <h3 className="font-bold text-lg">{tier.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground mt-2 min-h-[2.5rem]">{tier.tagline}</p>
              <div className="mt-4">
                <span className={!tier.productName ? "text-2xl font-bold" : "text-3xl font-bold"}>
                  {tier.price}
                </span>
                {tier.priceNote && (
                  <span className="text-muted-foreground text-sm">{tier.priceNote}</span>
                )}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                <Mail className="w-4 h-4" />
                {tier.emails}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Users className="w-4 h-4 text-primary" />
                {tier.users}
              </div>
              <ul className="mt-5 space-y-2.5 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={tier.popular ? "default" : "outline"}
                onClick={() => handleCheckout(tier)}
                disabled={loadingTier !== null}
              >
                {loadingTier === tier.key ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  tier.cta
                )}
              </Button>
            </div>
          ))}
        </div>

        {/* Launch package */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="rounded-lg bg-amber-500/15 p-3 w-fit">
              <BadgeCheck className="w-7 h-7 text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold">AI Sales Launch Package</h2>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-0.5 text-xs font-semibold text-amber-300">
                  Required for every subscription
                </span>
              </div>
              <p className="text-muted-foreground text-sm mt-2 max-w-3xl">
                A one-time <span className="font-semibold text-foreground">$995</span> implementation
                fee, added automatically at checkout. Our team sets up everything so your first
                campaign lands in inboxes — not spam folders.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5 mt-5">
                {LAUNCH_PACKAGE_ITEMS.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Comparison table */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-center">Compare plans and see what AI+ adds</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left font-semibold p-4">Feature</th>
                  <th className="text-center font-semibold p-4">iSDRX AI Starter</th>
                  <th className="text-center font-semibold p-4 text-primary">iSDRX AI</th>
                  <th className="text-center font-semibold p-4">iSDRX AI Growth</th>
                  <th className="text-center font-semibold p-4 text-primary">iSDRX AI+ add-on</th>
                  <th className="text-center font-semibold p-4">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr key={row.label} className={i % 2 === 1 ? "bg-muted/20" : ""}>
                    <td className="p-4 font-medium">{row.label}</td>
                    {row.values.map((v, j) => (
                      <td
                        key={j}
                        className={`p-4 text-center ${
                          v === "✓" ? "text-emerald-500" : v === "—" ? "text-muted-foreground/50" : ""
                        }`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            AI+ is a sales-assisted managed calling service added to your selected iSDRX AI package.
          </p>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto w-full space-y-4">
          <h2 className="text-xl font-bold text-center">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Bottom CTA */}
        <div className="rounded-xl border bg-card p-8 text-center space-y-3">
          <h2 className="text-2xl font-bold">Ready to put AI on your sales team?</h2>
          <p className="text-muted-foreground">
            Start with an iSDRX AI plan, or contact us to add AI-Triggered Human Calling with AI+.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => handleCheckout(TIERS[1], "pricing_bottom_cta")}
              disabled={loadingTier !== null}
            >
              {loadingTier === "growth" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Start Free Trial with iSDRX AI"
              )}
            </Button>
            <Button asChild size="lg" variant="outline">
              <a
                href="/contact-us"
                onClick={() => trackConversionClick("get_started", "pricing_bottom_ai_plus")}
              >
                Contact Us About AI+
              </a>
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

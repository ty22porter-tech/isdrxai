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
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { trackConversionClick, trackEvent } from "@/lib/analytics";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `API error ${res.status}`);
  }
  return res.json();
}

const SALES_EMAIL = "sales@isdrxai.com";

type PendingCheckout = {
  tier: Tier;
  location: string;
  checkoutIntent: "buy_now" | "free_trial";
};

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
    cta: "Buy Now",
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
    cta: "Buy Now",
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
    cta: "Buy Now",
  },
  {
    key: "ai-plus",
    productName: null,
    name: "iSDRX AI+",
    price: "Contact Sales",
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
    cta: "Contact Sales",
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
    a: "iSDRX AI Starter, iSDRX AI, and iSDRX AI Growth offer an optional 14-day free trial when you select Start Free Trial. We collect a card at sign-up, and your paid subscription begins automatically when the trial ends unless you cancel first. If you select Buy Now, billing begins immediately. AI+ and Enterprise are sales-assisted services—contact us to discuss those options.",
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
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch("/stripe/products"),
  });

  const products: any[] = productsData?.products ?? [];

  const priceIdFor = (productName: string | null): string | null => {
    if (!productName) return null;
    const product = products.find((p) => p.name === productName);
    return product?.monthlyPriceId ?? null;
  };

  const handleCheckout = async (
    tier: Tier,
    location = `pricing_${tier.key}`,
    checkoutIntent: "buy_now" | "free_trial" = "buy_now",
  ) => {
    trackConversionClick(
      tier.productName ? (checkoutIntent === "free_trial" ? "start_trial" : "buy_now") : "get_started",
      location,
    );
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
    setHasReadTerms(false);
    setHasAcceptedTerms(false);
    setPendingCheckout({ tier, location, checkoutIntent });
  };

  const continueToCheckout = async () => {
    if (!pendingCheckout || !hasReadTerms || !hasAcceptedTerms) return;
    const { tier, location, checkoutIntent } = pendingCheckout;
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
        body: JSON.stringify({ priceId, acceptTerms: true, checkoutIntent }),
      });
      if (data.url) {
        trackEvent(
          checkoutIntent === "free_trial" ? "trial_checkout_started" : "purchase_checkout_started",
          { plan: tier.key, location },
        );
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
            <div className="font-semibold text-sky-300">Optional 14-Day Free Trial on every self-service plan</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Choose Start Free Trial for full access during the trial. Card collected at sign-up; billing
              starts automatically after the trial unless you cancel. Choose Buy Now to begin billing
              immediately. AI+ and Enterprise are available by contacting us.
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
              {tier.productName ? (
                <div className="mt-6 space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => handleCheckout(tier, `pricing_${tier.key}_buy_now`, "buy_now")}
                    disabled={loadingTier !== null}
                  >
                    {loadingTier === tier.key ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buy Now"}
                  </Button>
                  <Button
                    className="w-full"
                    variant="ghost"
                    onClick={() => handleCheckout(tier, `pricing_${tier.key}_trial`, "free_trial")}
                    disabled={loadingTier !== null}
                  >
                    Start Free Trial
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-6 w-full"
                  onClick={() => handleCheckout(tier)}
                  disabled={loadingTier !== null}
                >
                  {tier.cta}
                </Button>
              )}
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
            Start with an iSDRX AI plan, or contact sales to add AI-Triggered Human Calling with AI+.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => handleCheckout(TIERS[1], "pricing_bottom_cta", "buy_now")}
              disabled={loadingTier !== null}
            >
              {loadingTier === "growth" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Buy iSDRX AI Now"
              )}
            </Button>
            <Button asChild size="lg">
              <a
                href="/contact-us"
                onClick={() => trackConversionClick("get_started", "pricing_bottom_ai_plus")}
              >
                Contact Sales About AI+
              </a>
            </Button>
          </div>
        </div>

        <Dialog
          open={pendingCheckout !== null}
          onOpenChange={(open) => {
            if (!open && loadingTier === null) {
              setPendingCheckout(null);
              setHasReadTerms(false);
              setHasAcceptedTerms(false);
            }
          }}
        >
          <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto]">
            <DialogHeader>
              <DialogTitle>Review and accept the terms</DialogTitle>
              <DialogDescription>
                {pendingCheckout?.checkoutIntent === "free_trial"
                  ? "You selected the 14-day free trial. Scroll through the terms below to continue."
                  : "You selected Buy Now. Billing begins when checkout is completed. Scroll through the terms below to continue."}
              </DialogDescription>
            </DialogHeader>

            <div
              className="min-h-0 overflow-y-auto rounded-lg border bg-background/50 p-4 text-sm leading-relaxed text-muted-foreground"
              onScroll={(event) => {
                const element = event.currentTarget;
                if (element.scrollHeight - element.scrollTop - element.clientHeight <= 12) {
                  setHasReadTerms(true);
                }
              }}
            >
              <TermsReview />
              <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4 text-foreground">
                <p className="font-semibold">You have reached the end of the terms.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You may now select the acceptance box below.
                </p>
              </div>
            </div>

            <div className="space-y-4 border-t pt-4">
              {!hasReadTerms && (
                <div className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
                  <ArrowDown className="h-4 w-4" />
                  Scroll to the bottom to continue
                </div>
              )}
              <label
                className={`flex items-start gap-3 rounded-lg border p-3 ${
                  hasReadTerms ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                }`}
              >
                <Checkbox
                  checked={hasAcceptedTerms}
                  onCheckedChange={(checked) => setHasAcceptedTerms(checked === true)}
                  disabled={!hasReadTerms || loadingTier !== null}
                  aria-label="Accept the Terms of Service, Privacy Policy, and Acceptable Use Policy"
                  className="mt-0.5"
                />
                <span className="text-sm leading-relaxed">
                  I have reviewed and agree to the{" "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">
                    Terms of Service
                  </a>
                  ,{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
                    Privacy Policy
                  </a>
                  , and{" "}
                  <a href="/acceptable-use" target="_blank" rel="noreferrer" className="text-primary underline">
                    Acceptable Use Policy
                  </a>
                  .
                </span>
              </label>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPendingCheckout(null)}
                  disabled={loadingTier !== null}
                >
                  Cancel
                </Button>
                <Button
                  onClick={continueToCheckout}
                  disabled={!hasReadTerms || !hasAcceptedTerms || loadingTier !== null}
                >
                  {loadingTier !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept and continue to checkout
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

function TermsReview() {
  return (
    <div className="space-y-5">
      <div>
        <p className="font-semibold text-foreground">iSDRX AI Terms of Service</p>
        <p className="mt-1 text-xs">Effective September 5, 2026</p>
      </div>

      <p>
        These Terms form a binding agreement between you or the organization you represent and
        iSDRX AI Inc. By accepting, you also agree to the Privacy Policy and Acceptable Use Policy.
      </p>

      <section>
        <h3 className="font-semibold text-foreground">1. Services and account</h3>
        <p className="mt-1">
          You must be at least 18 and authorized to bind the Customer. You are responsible for
          account security, authorized users, and all activity through your account. Services may
          include prospecting, AI-assisted content, campaign management, engagement tracking,
          appointment booking, reporting, and sales support.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">2. AI-generated content</h3>
        <p className="mt-1">
          AI output may be incomplete or inaccurate. You are responsible for reviewing targeting,
          factual claims, representations, and outbound content before use. iSDRX AI does not
          guarantee leads, replies, appointments, conversions, sales, or revenue.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">3. Fees, trial, and one-time services</h3>
        <p className="mt-1">
          Subscription fees are billed in advance. A 14-day trial is available only when you
          explicitly select Start Free Trial. Paid billing begins automatically when the trial ends
          unless canceled first. If you select Buy Now, billing begins when checkout is completed.
          The required $995 AI Sales Launch Package and any applicable $1,000 AI+ onboarding fee
          are nonrefundable once work begins, except where required by law or expressly stated in a
          signed order form.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">4. Renewal and cancellation</h3>
        <p className="mt-1">
          Standard subscriptions renew monthly until canceled. Cancellation through the billing
          portal stops future renewals and takes effect at the end of the current paid period.
          Fees already paid are nonrefundable and are not prorated, except where required by law.
          AI+ options are month-to-month and require 30 days’ written notice to cancel. Canceling
          AI+ does not automatically cancel the underlying iSDRX AI subscription.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">5. Outreach compliance</h3>
        <p className="mt-1">
          You represent that you have the rights, notices, permissions, and consents needed to use
          Customer Data and contact each recipient. You are responsible for compliance with
          CAN-SPAM, applicable privacy laws, the Telephone Consumer Protection Act where
          applicable, the Telemarketing Sales Rule, Do-Not-Call rules, call-recording consent laws,
          and local calling-hour restrictions. You must use accurate identification and promptly
          honor opt-outs and suppression requests.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">6. Acceptable use</h3>
        <p className="mt-1">
          You may not use unlawfully obtained data or use the Services for spam, harassment,
          deception, impersonation, spoofing, unlawful discrimination, fraud, malware, phishing,
          rights infringement, or other illegal or harmful activity. You may not bypass platform
          limits, disrupt systems, access another customer’s data, or direct AI or professional
          callers to make unlawful or unsupported claims.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">7. Customer Data and third parties</h3>
        <p className="mt-1">
          You retain rights in Customer Data and grant iSDRX AI a limited right to process it to
          provide, secure, support, and improve the Services. The Services may depend on third-party
          providers for payments, authentication, email, calendars, prospect data, AI processing,
          and related functions. Their services may be governed by separate terms.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">8. Ownership and confidentiality</h3>
        <p className="mt-1">
          iSDRX AI and its licensors retain all rights in the Services and related technology.
          Your paid right to use the Services is limited, nonexclusive, nontransferable, and for
          internal business use. Each party will reasonably protect the other’s nonpublic
          confidential information.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">9. Suspension and termination</h3>
        <p className="mt-1">
          iSDRX AI may suspend or terminate access for nonpayment, unlawful conduct, security
          threats, policy violations, or material risk to recipients or providers. Either party may
          terminate an affected service for a material breach not cured within 30 days after written
          notice. We may act immediately to prevent fraud, abuse, unlawful outreach, or harm.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">10. Disclaimers and liability</h3>
        <p className="mt-1">
          To the maximum extent permitted by law, the Services are provided “as is” and “as
          available,” without implied warranties. Neither party is liable for indirect,
          consequential, exemplary, or punitive damages or lost profits, revenue, data, or
          opportunities. Total liability will not exceed amounts paid or payable for the affected
          Services during the 12 months before the claim, except where liability cannot legally be
          limited.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">11. Indemnification</h3>
        <p className="mt-1">
          You will defend and indemnify iSDRX AI against third-party claims arising from Customer
          Data, campaign or calling instructions, unlawful recipient contact, your violation of
          law, or your breach of the Terms.
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-foreground">12. General terms</h3>
        <p className="mt-1">
          Texas law governs these Terms. Material updates may require renewed acceptance. If one
          provision is unenforceable, the rest remain effective. Questions, legal notices, and AI+
          cancellation notices may be sent to info@isdrxai.com.
        </p>
      </section>

      <p className="border-t pt-5 text-xs">
        Read the complete{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">
          Terms of Service
        </a>
        ,{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
          Privacy Policy
        </a>
        , and{" "}
        <a href="/acceptable-use" target="_blank" rel="noreferrer" className="text-primary underline">
          Acceptable Use Policy
        </a>
        .
      </p>
    </div>
  );
}

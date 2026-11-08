import { STARTER_PLAN, ENTERPRISE_PLAN, STARTER_INTRO_OFFER } from "@workspace/api-client-react/marketing-plans";
import { Check, ArrowRight, Building2, Sparkles } from "lucide-react";
import { trackConversionClick } from "@/lib/analytics";

export function IntroductoryPlans() {
  return <div className="mx-auto mb-10 grid max-w-5xl gap-8 md:grid-cols-2">
    {[STARTER_PLAN, ENTERPRISE_PLAN].map((plan, index) => <article key={plan.name} className={`flex min-w-0 flex-col rounded-2xl border bg-card p-6 sm:p-8 ${index === 0 ? "border-primary/60" : "border-white/10"}`}>
      {index === 0 && <p className="mb-5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-accent">{STARTER_INTRO_OFFER}</p>}
      <div className="flex items-center gap-3 text-white">{index === 0 ? <Sparkles className="h-6 w-6 shrink-0 text-accent" /> : <Building2 className="h-6 w-6 shrink-0 text-accent" />}<h3 className="text-2xl font-bold">{plan.name}</h3></div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>
      <p className="mt-5 text-4xl font-bold text-white">{plan.price}<span className="text-base font-normal text-muted-foreground">{plan.priceNote}</span></p>
      <p className="mt-4 text-sm font-semibold text-accent">{plan.emails}</p>
      <p className="mt-2 text-sm text-white">{plan.users}</p>
      <ul className="my-6 flex-1 space-y-3">{plan.features.map(feature => <li key={feature} className="flex gap-2 text-sm text-gray-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span>{feature}</span></li>)}</ul>
      {index === 0 && <p className="mb-5 text-xs leading-relaxed text-muted-foreground">The required one-time $995 AI Sales Launch Package also applies. Review payment and optional trial terms when selecting your plan.</p>}
      <a href={index === 0 ? "/app/pricing" : "/contact-us"} onClick={() => trackConversionClick(index === 0 ? "get_started" : "book_demo", index === 0 ? "introductory_starter" : "enterprise_plan")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-center font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">{index === 0 ? "View Starter Offer" : "Contact Sales"}<ArrowRight className="h-4 w-4" /></a>
    </article>)}
  </div>;
}

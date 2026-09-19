import { useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { usePreviewProspectGiftSuggestions, type ProspectGiftSuggestions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GiftShoppingLinks } from "@/components/gift-shopping-links";

export type GiftPreviewIdentity = {
  contactName: string;
  companyName: string;
  industry: string;
  title?: string | null;
  city?: string | null;
  state?: string | null;
};

export function ProspectGiftSuggestionPreview({ identity }: { identity: GiftPreviewIdentity }) {
  const [budget, setBudget] = useState("25");
  const [result, setResult] = useState<ProspectGiftSuggestions | null>(null);
  const generate = usePreviewProspectGiftSuggestions({
    mutation: { onSuccess: data => { setResult(data); setBudget(String(data.budgetUsd)); } },
  });
  const budgetNumber = Number(budget);
  const budgetValid = Number.isInteger(budgetNumber) && budgetNumber >= 10 && budgetNumber <= 100;
  const run = () => generate.mutate({ data: { ...identity, budgetUsd: budgetNumber } });
  return (
    <section className="space-y-4">
      <div className="rounded-md border bg-amber-50/60 p-3 text-sm text-amber-900">
        <strong>Unsaved preview.</strong> Researching ideas does not add this prospect to the pipeline, create a gift record, enroll outreach, send a message, or purchase anything.
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">Public, identity-matched research for {identity.contactName} at {identity.companyName}.</p>
        <div className="flex items-end gap-2">
          <label className="text-xs font-medium">Budget (USD)
            <Input className="mt-1 w-24" type="number" min={10} max={100} step={1} value={budget} onChange={event => setBudget(event.target.value)} aria-invalid={!budgetValid} />
          </label>
          <Button onClick={run} disabled={!budgetValid || generate.isPending}>
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : result ? <RefreshCw className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {generate.isPending ? "Researching prospect…" : result ? "Regenerate ideas" : "Generate ideas"}
          </Button>
        </div>
      </div>
      {!budgetValid && <p role="alert" className="text-sm text-red-500">Enter a whole-dollar budget from $10 to $100.</p>}
      {generate.error && <div className="flex items-center gap-2"><p role="alert" className="text-sm text-red-500">{generate.error.message}</p><Button size="sm" variant="outline" disabled={!budgetValid || generate.isPending} onClick={run}>Retry</Button></div>}
      {!result && !generate.isPending && !generate.error && <p className="text-sm text-muted-foreground">Generate gift ideas without saving this prospect. These preview ideas are not saved when you close this window.</p>}
      {result && <>
        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-sm"><strong>Research:</strong> {result.researchMessage}</p>
          <p className="text-xs text-muted-foreground">
            {result.researchProvider === "google_search_grounding"
              ? "Public sources checked with Gemini Google Search grounding."
              : result.researchProvider === "openai_web_search_legacy"
                ? "Google grounding was unavailable; public sources were checked with alternate OpenAI web search."
                : "Public research was unavailable; these ideas use supplied business identity only."}
          </p>
          <ul className="space-y-2">
            {result.researchFacts.map(fact => <li key={fact.id} className="text-sm">
              <span className="font-medium">{fact.summary}</span>{" "}
              <a href={fact.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Source <ExternalLink className="inline h-3 w-3" /></a>
              <p className="text-xs text-muted-foreground">{fact.evidence}</p>
            </li>)}
          </ul>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {result.ideas.map(idea => <article key={idea.name} className="rounded-md border p-4 space-y-2">
            <div className="flex justify-between gap-2"><h4 className="font-medium">{idea.name}</h4><span className="text-xs text-muted-foreground">Estimated ${idea.estimatedPriceMinUsd}–${idea.estimatedPriceMaxUsd}</span></div>
            <p className="text-xs text-muted-foreground">{idea.personalization === "verified_fact" ? "Personalized from verified public evidence" : "Generic fallback — no verified personal fact used"}</p>
            <p className="text-sm">{idea.description}</p>
            <p className="text-sm text-muted-foreground"><strong>Why it may fit:</strong> {idea.whyFit}</p>
            <GiftShoppingLinks giftName={idea.name} />
          </article>)}
        </div>
        <p className="text-xs text-muted-foreground">Preview prices are estimates, not live quotes. Retailer links are searches only; confirm policy, availability, shipping, and rights for any customization.</p>
      </>}
    </section>
  );
}
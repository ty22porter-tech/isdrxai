import {
  Activity,
  Archive,
  BarChart,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  History,
  Info,
  Lightbulb,
  Minus,
  Target,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { OpportunityIntelligence, OpportunitySignal } from "@workspace/api-client-react";

interface OpportunityIntelligenceViewProps {
  intelligence: OpportunityIntelligence;
  className?: string;
  isDialog?: boolean;
  compact?: boolean;
}

const NO_BUYING_SIGNAL = "No meaningful company-specific buying signal found yet.";

const SCORE_COLORS: Record<string, string> = {
  "High Priority": "bg-primary/10 text-primary border-primary/20",
  "Strong Opportunity": "bg-primary/10 text-primary border-primary/20",
  "Moderate Opportunity": "bg-primary/10 text-primary border-primary/20",
  "Strong Fit": "bg-primary/10 text-primary border-primary/20",
  "Possible Fit": "bg-accent text-accent-foreground border-primary/10",
  "Low Priority": "bg-muted text-muted-foreground border-border",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-700 dark:text-green-400",
  medium: "text-primary",
  low: "text-muted-foreground",
};

const COMPANY_INFORMATION_TYPES = new Set([
  "business_listing",
  "company_listing",
  "company_verification",
  "operating_address",
  "address",
  "company_website",
  "website",
  "published_phone",
  "phone",
  "industry_category",
  "business_category",
  "company_operational",
  "operational_status",
]);

/** Keeps legacy listing records out of the buying-signal group. */
export function isVerifiedCompanyInformation(signal: OpportunitySignal): boolean {
  const type = (signal.signalType || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (COMPANY_INFORMATION_TYPES.has(type)) return true;
  const text = `${signal.signalTitle || ""} ${signal.signalDescription || ""}`;
  return /(?:google|business|company)(?:\s+places)?\s+(?:listing|profile|verification)|(?:public|published)\s+(?:operating\s+)?(?:address|website|phone)|operating\s+(?:address|location)/i.test(text);
}

export function sanitizeOpportunityLanguage(value?: string): string {
  return (value || "")
    .replace(/\bconfirmed needs?\b/gi, (match) =>
      match.toLowerCase().endsWith("s") ? "potential opportunities" : "potential opportunity",
    )
    .trim();
}

const NON_RESULT_LANGUAGE =
  /\b(?:no meaningful|no (?:verified|relevant|company-specific)|not found|none found|unverified|unknown|insufficient|unable to|could not|no evidence)\b/i;

function compactPositiveText(value?: string, maxLength = 210, omitNonResults = true): string {
  const sentences = sanitizeOpportunityLanguage(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && (!omitNonResults || !NON_RESULT_LANGUAGE.test(sentence)));
  const text = sentences.slice(0, omitNonResults ? 2 : 3).join(" ");
  if (!text || text.length <= maxLength) return text;
  const shortened = text.slice(0, maxLength + 1).replace(/\s+\S*$/, "").replace(/[,:;.\s]+$/, "");
  return `${shortened || text.slice(0, maxLength)}…`;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function getFreshnessIcon(freshness?: string) {
  switch (freshness) {
    case "recent":
      return <Zap className="h-3 w-3 text-primary" />;
    case "active":
      return <Activity className="h-3 w-3 text-primary" />;
    case "older":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "stale":
      return <Archive className="h-3 w-3 text-muted-foreground" />;
    default:
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

function EvidenceDetails({ signal, id }: { signal: OpportunitySignal; id: string }) {
  const sourceDate = formatDate(signal.sourceDate);
  const verifiedDate = formatDate(signal.dateVerified || signal.dateDiscovered);
  const evidence = sanitizeOpportunityLanguage(signal.supportingEvidence || signal.signalDescription);

  return (
    <details className="group mt-3 rounded-md border border-border/70 bg-muted/20">
      <summary
        className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`button-evidence-${id}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          View evidence details
        </span>
      </summary>
      <dl className="grid grid-cols-1 gap-x-5 gap-y-2 border-t px-3 py-3 text-xs sm:grid-cols-2">
        <div><dt className="font-semibold text-foreground">Source</dt><dd className="break-words text-muted-foreground">{sanitizeOpportunityLanguage(signal.sourceName) || "Not provided"}</dd></div>
        <div><dt className="font-semibold text-foreground">Source date</dt><dd className="text-muted-foreground">{sourceDate || "Not provided"}</dd></div>
        <div><dt className="font-semibold text-foreground">Date verified</dt><dd className="text-muted-foreground">{verifiedDate || "Not provided"}</dd></div>
        <div><dt className="font-semibold text-foreground">Confidence</dt><dd className="capitalize text-muted-foreground">{signal.confidenceLevel || "Not provided"}</dd></div>
        <div><dt className="font-semibold text-foreground">Freshness</dt><dd className="capitalize text-muted-foreground">{signal.freshness || "Unknown"}</dd></div>
        {signal.signalId && <div><dt className="font-semibold text-foreground">Signal ID</dt><dd className="font-mono text-muted-foreground">{signal.signalId}</dd></div>}
        {signal.pointReason && <div className="sm:col-span-2"><dt className="font-semibold text-foreground">Point rule</dt><dd className="break-words text-muted-foreground">{signal.pointReason}</dd></div>}
        <div className="sm:col-span-2"><dt className="font-semibold text-foreground">Evidence</dt><dd className="break-words text-muted-foreground">{evidence || "Not provided"}</dd></div>
        {signal.sourceURL && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-foreground">Source link</dt>
            <dd>
              <a
                href={signal.sourceURL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 break-all text-primary underline-offset-2 hover:underline"
                data-testid={`link-evidence-source-${id}`}
              >
                {sanitizeOpportunityLanguage(signal.sourceName) || "Open source"} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            </dd>
          </div>
        )}
        {Array.isArray(signal.corroboratingSources) && signal.corroboratingSources.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-foreground">Corroborating sources</dt>
            <dd className="space-y-1 text-muted-foreground">
              {signal.corroboratingSources.map((source, index) => (
                <a key={`${source.sourceURL}-${index}`} href={source.sourceURL} target="_blank" rel="noreferrer" className="block break-all text-primary hover:underline">
                  {source.sourceName || source.sourceURL}
                </a>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}

type SignalSectionProps = {
  title: string;
  signals: OpportunitySignal[];
  kind: "company" | "model" | "verified" | "implication" | "unconfirmed";
  emptyMessage?: string;
};

function SignalSection({ title, signals, kind, emptyMessage }: SignalSectionProps) {
  const icon =
    kind === "company" ? <Building2 className="h-4 w-4 text-primary" /> :
    kind === "model" ? <BriefcaseBusiness className="h-4 w-4 text-primary" /> :
    kind === "verified" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
    kind === "implication" ? <Lightbulb className="h-4 w-4 text-primary" /> :
    <HelpCircle className="h-4 w-4 text-muted-foreground" />;

  return (
    <section className="space-y-2" aria-labelledby={`signal-heading-${kind}`}>
      <h4 id={`signal-heading-${kind}`} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
        {icon} {title}
      </h4>
      {signals.length === 0 ? (
        emptyMessage && (
          <p className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground" data-testid={`status-empty-${kind}`}>
            {emptyMessage}
          </p>
        )
      ) : (
        <div className="space-y-2">
          {signals.map((signal, index) => {
            const id = `${kind}-${index}`;
            return (
              <article
                key={`${signal.signalType}-${signal.signalTitle}-${index}`}
                className={`rounded-lg border p-3 ${kind === "verified" ? "border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/10" : "bg-card"}`}
                data-testid={`card-signal-${id}`}
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h5 className="break-words text-sm font-semibold">{sanitizeOpportunityLanguage(signal.signalTitle) || "Signal"}</h5>
                    {signal.signalDescription && <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{sanitizeOpportunityLanguage(signal.signalDescription)}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 capitalize">{getFreshnessIcon(signal.freshness)}{signal.freshness || "unknown"}</span>
                    {(kind === "company" || kind === "model" || kind === "verified") && (
                      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Verified</Badge>
                    )}
                    {kind === "verified" && signal.points > 0 && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">+{signal.points} pts</Badge>}
                    {kind === "implication" && <Badge variant="outline" className="text-muted-foreground">Implication</Badge>}
                    {kind === "unconfirmed" && <Badge variant="outline" className="text-muted-foreground">Unconfirmed</Badge>}
                  </div>
                </div>
                <EvidenceDetails signal={signal} id={id} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HiringSignal({ signal, index }: { signal: OpportunitySignal; index: number }) {
  const combined = `${signal.signalTitle || ""} ${signal.signalDescription || ""} ${signal.supportingEvidence || ""}`;
  const count = combined.match(/\b(\d+)\s+(?:relevant\s+)?(?:openings?|roles?|positions?|jobs?)\b/i)?.[0];
  const location = combined.match(
    /\b(?:in|across|locations?:)\s+([A-Z][A-Za-z.' -]*?(?:,\s*[A-Z]{2}|(?:\s+and\s+[A-Z][A-Za-z.' -]*)?))(?=[.;]|\s+(?:for|including|with|on)\b|$)/,
  )?.[1]?.trim();
  const date = formatDate(signal.sourceDate);

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none" data-testid={`card-hiring-signal-${index}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BriefcaseBusiness className="h-4 w-4 text-primary" /> Hiring Signal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        <p><span className="font-semibold">Role / activity: </span>{sanitizeOpportunityLanguage(signal.signalTitle) || "Hiring activity"}</p>
        {count && <p><span className="font-semibold">Openings: </span>{count}</p>}
        {location && <p><span className="font-semibold">Location: </span>{location}</p>}
        {signal.signalDescription && <p className="text-muted-foreground"><span className="font-semibold text-foreground">Details: </span>{sanitizeOpportunityLanguage(signal.signalDescription)}</p>}
        {date && <p><span className="font-semibold">Signal date: </span>{date}</p>}
      </CardContent>
    </Card>
  );
}

export function OpportunityIntelligenceView({
  intelligence,
  className = "",
  compact = false,
}: OpportunityIntelligenceViewProps) {
  const signals = Array.isArray(intelligence?.signals) ? intelligence.signals.filter(Boolean) : [];
  const companyInformation = signals.filter(
    (signal) => signal.signalClassification === "verified" && isVerifiedCompanyInformation(signal),
  );
  const verifiedBusinessModel = signals.filter(
    (signal) =>
      signal.signalClassification === "verified"
      && (signal.signalType === "business_model_evidence" || signal.signalType === "fleet_vehicle_evidence"),
  );
  const verifiedBuyingSignals = signals.filter(
    (signal) =>
      signal.signalClassification === "verified"
      && !isVerifiedCompanyInformation(signal)
      && !verifiedBusinessModel.includes(signal)
      && signal.points > 0,
  ).sort((a, b) => {
    const current = (signal: OpportunitySignal) =>
      signal.signalType === "hiring_listing" || signal.freshness === "recent" || signal.freshness === "active";
    const freshness = (signal: OpportunitySignal) =>
      signal.freshness === "recent" ? 4
        : signal.freshness === "active" ? 3
          : signal.freshness === "older" ? 2
            : signal.freshness === "unknown" ? 1
              : 0;
    const confidence = (signal: OpportunitySignal) =>
      signal.confidenceLevel === "high" ? 2 : signal.confidenceLevel === "medium" ? 1 : 0;
    return Number(current(b)) - Number(current(a))
      || b.points - a.points
      || freshness(b) - freshness(a)
      || confidence(b) - confidence(a);
  });
  const verifiedHistoricalSignals = signals.filter(
    (signal) =>
      signal.signalClassification === "verified"
      && !isVerifiedCompanyInformation(signal)
      && !verifiedBusinessModel.includes(signal)
      && signal.points === 0
      && Boolean(signal.sourceURL),
  );
  const implications = signals.filter((signal) => signal.signalClassification === "implication");
  const unconfirmed = signals.filter((signal) => signal.signalClassification === "unconfirmed");
  const hiringSignals = signals.filter((signal) =>
    signal.signalClassification === "verified"
    && signal.points > 0
    && /hir(?:e|ing)|job(?:_|-|\s)?posting|recruit/i.test(signal.signalType || ""),
  );
  const potentialOpportunities = Array.isArray(intelligence?.potentialNeeds) ? intelligence.potentialNeeds.filter(Boolean) : [];
  const breakdown = Array.isArray(intelligence?.breakdown) ? intelligence.breakdown.filter(Boolean) : [];
  const breakdownTotal = breakdown.reduce((sum, category) => sum + category.points, 0);
  const categoryMaxTotal = breakdown.reduce((sum, category) => sum + category.maxPoints, 0);
  const expectedCategoryMaxima: Record<string, number> = {
    company_industry_fit: 20,
    verified_buying_signals: 30,
    seller_prospect_match: 20,
    decision_maker_match: 10,
    signal_freshness: 10,
    business_need_potential: 10,
  };
  const categoryKeys = breakdown.map(category => category.key);
  const hasExactCategoryContract = breakdown.length === Object.keys(expectedCategoryMaxima).length
    && new Set(categoryKeys).size === Object.keys(expectedCategoryMaxima).length
    && breakdown.every(category => expectedCategoryMaxima[category.key] === category.maxPoints);
  const integrityPasses = intelligence?.version !== 3
    || (intelligence.integrity?.status === "passed"
      && intelligence.integrity.calculatedTotal === intelligence.score
      && intelligence.integrity.categoryMaxTotal === 100
      && intelligence.integrity.checks.every(check => check.passed));
  const scoreReconciles = hasExactCategoryContract
    && categoryMaxTotal === 100
    && breakdownTotal === intelligence?.score
    && integrityPasses;
  const generatedAt = formatDate(intelligence?.generatedAt);
  const scoreLabelColor = SCORE_COLORS[intelligence?.label] || "bg-muted text-muted-foreground border-border";

  if (compact) {
    // Why Target must retain an explicit "no current signal" caveat rather
    // than hiding weak evidence behind generic company verification.
    const whyTarget = compactPositiveText(intelligence?.whyTarget, 300, false);
    const positiveOpportunities = potentialOpportunities
      .map((opportunity) => compactPositiveText(opportunity, 105))
      .filter(Boolean)
      .slice(0, 2);
    const strongestSignal = verifiedBuyingSignals[0];
    const verifiedSignal = strongestSignal
      ? compactPositiveText(
          [strongestSignal.signalTitle, strongestSignal.signalDescription].filter(Boolean).join(": "),
          180,
        )
      : "";
    const recommendedOutreach = compactPositiveText(intelligence?.recommendedOutreach);
    const rows = [
      { label: "Why target", value: whyTarget, className: "line-clamp-3" },
      { label: "Potential needs", value: positiveOpportunities.join("; ") },
      { label: "Verified signal", value: verifiedSignal },
      { label: "Recommended outreach", value: recommendedOutreach },
    ].filter((row) => row.value);

    if (rows.length === 0) return null;

    return (
      <div className={`space-y-1.5 ${className}`} data-testid="section-opportunity-intelligence-compact">
        {rows.map((row) => (
          <p key={row.label} className={`${row.className || "line-clamp-2"} text-xs leading-relaxed text-muted-foreground`}>
            <span className="font-medium text-foreground">{row.label}: </span>
            {row.value}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-5 ${className}`} data-testid="section-opportunity-intelligence">
      {!compact && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-bold" data-testid="text-opportunity-score">Opportunity Score: {scoreReconciles ? intelligence?.score : "Unavailable"}</h3>
                {scoreReconciles && intelligence?.label && <Badge variant="outline" className={`font-semibold ${scoreLabelColor}`}>{intelligence.label}</Badge>}
              </div>
              <p className="flex items-start gap-1 text-sm text-muted-foreground">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span><span className="font-medium text-foreground">Score measures seller fit.</span> It is not purchase probability or recent engagement.</span>
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {intelligence?.scoreConfidence && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <BarChart className="h-3.5 w-3.5" /> Confidence:
                    <span className={`font-medium capitalize ${CONFIDENCE_COLORS[intelligence.scoreConfidence] || ""}`}>{intelligence.scoreConfidence}</span>
                  </span>
                )}
                {generatedAt && <span className="flex items-center gap-1.5 text-muted-foreground"><History className="h-3.5 w-3.5" /> Generated: {generatedAt}</span>}
                {intelligence?.version && <span className="text-muted-foreground">Model v{intelligence.version}</span>}
              </div>
              {intelligence?.scoreConfidenceReason && (
                <p className="text-xs leading-relaxed text-muted-foreground" data-testid="text-score-confidence-reason">
                  {intelligence.scoreConfidenceReason}
                </p>
              )}
            </div>
          </div>

          {!scoreReconciles && (
            <Card className="border-destructive/40 bg-destructive/5 shadow-none" data-testid="alert-score-integrity">
              <CardContent className="pt-4 text-sm text-destructive">
                This score is hidden because its category totals do not reconcile to a complete 100-point model.
              </CardContent>
            </Card>
          )}

          {intelligence?.whyTarget && (
            <Card className="border-primary/15 bg-primary/5 shadow-none">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4 text-primary" /> Why Target</CardTitle></CardHeader>
              <CardContent><p className="text-sm leading-relaxed text-foreground/90">{sanitizeOpportunityLanguage(intelligence.whyTarget)}</p></CardContent>
            </Card>
          )}

          {breakdown.length > 0 && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Score Breakdown</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {breakdown.map((category, index) => (
                  <div key={`${category.key}-${index}`} className="space-y-3 rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-semibold">{sanitizeOpportunityLanguage(category.label)}</h5>
                      <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium">{category.points} / {category.maxPoints} pts</span>
                    </div>
                    <Progress value={category.maxPoints > 0 ? (category.points / category.maxPoints) * 100 : 0} className="h-1.5" />
                    <p className="text-xs leading-relaxed text-muted-foreground">{sanitizeOpportunityLanguage(category.explanation)}</p>
                     {Array.isArray(category.evidence) && category.evidence.length > 0 && (
                       <ul className="space-y-1 text-xs text-muted-foreground">
                         {category.evidence.map((item, evidenceIndex) => (
                           <li key={evidenceIndex} className="flex gap-1.5">
                             <span className="text-primary">•</span>
                             <span>{sanitizeOpportunityLanguage(item)}</span>
                           </li>
                         ))}
                       </ul>
                     )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm font-semibold" data-testid="text-score-reconciliation">
                <span>Category total</span>
                <span className="font-mono">{breakdownTotal} / {categoryMaxTotal} pts{scoreReconciles ? " — matches headline" : " — mismatch"}</span>
              </div>
            </section>
          )}
        </>
      )}

      {hiringSignals.length > 0 && (
        <section className="space-y-2">
          {hiringSignals.map((signal, index) => <HiringSignal key={`${signal.signalTitle}-${index}`} signal={signal} index={index} />)}
        </section>
      )}

      <div className="grid grid-cols-1 gap-5">
        <SignalSection title="Verified Company Information" signals={companyInformation} kind="company" />
        <SignalSection title="Verified Business Model" signals={verifiedBusinessModel} kind="model" />
        <SignalSection title="Verified Buying Signals" signals={verifiedBuyingSignals} kind="verified" emptyMessage={NO_BUYING_SIGNAL} />
        <SignalSection title="Verified Historical / Non-scoring Evidence" signals={verifiedHistoricalSignals} kind="verified" />
        <SignalSection title="Potential Implications" signals={implications} kind="implication" />
        <SignalSection title="Unconfirmed" signals={unconfirmed} kind="unconfirmed" />
      </div>

      {import.meta.env.DEV && import.meta.env.MODE !== "test" && (
        <details className="rounded-lg border border-dashed bg-muted/15" data-testid="section-opportunity-score-audit">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Development score audit</summary>
          <div className="space-y-4 border-t px-4 py-4 text-xs">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div><dt className="font-semibold">Model</dt><dd>v{intelligence.version}</dd></div>
              <div><dt className="font-semibold">Recalculated total</dt><dd>{breakdownTotal} / {categoryMaxTotal}</dd></div>
              <div><dt className="font-semibold">Integrity gate</dt><dd>{intelligence.integrity?.status || (scoreReconciles ? "legacy record reconciles" : "failed")}</dd></div>
              {intelligence.scoringInputs && (
                <>
                  <div><dt className="font-semibold">Vertical</dt><dd>{intelligence.scoringInputs.vertical}</dd></div>
                  <div><dt className="font-semibold">Industry input</dt><dd>{intelligence.scoringInputs.industry}</dd></div>
                  <div><dt className="font-semibold">Contact title input</dt><dd>{intelligence.scoringInputs.contactTitle || "Not verified"}</dd></div>
                  <div><dt className="font-semibold">Business-model basis</dt><dd>{intelligence.scoringInputs.businessModelBasis}</dd></div>
                  <div><dt className="font-semibold">Seller Intelligence</dt><dd>{intelligence.scoringInputs.sellerProfileStatus}</dd></div>
                  <div><dt className="font-semibold">Seller priority</dt><dd>{intelligence.scoringInputs.sellerPriorityConsidered || "None"}</dd></div>
                </>
              )}
              {intelligence.hiringResearch && (
                <>
                  <div><dt className="font-semibold">Hiring research</dt><dd>{intelligence.hiringResearch.status}</dd></div>
                  <div><dt className="font-semibold">Hiring count</dt><dd>{intelligence.hiringResearch.count ?? "Unknown"}</dd></div>
                  <div><dt className="font-semibold">Hiring confidence</dt><dd>{intelligence.hiringResearch.confidence}</dd></div>
                </>
              )}
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead><tr className="border-b"><th className="py-2 pr-3">Signal ID</th><th className="pr-3">Classification</th><th className="pr-3">Signal</th><th className="pr-3">Source date</th><th className="pr-3">Freshness</th><th>Points</th></tr></thead>
                <tbody>
                  {signals.map((signal, index) => (
                    <tr key={signal.signalId || index} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 font-mono">{signal.signalId || "legacy"}</td>
                      <td className="pr-3 capitalize">{signal.signalClassification}</td>
                      <td className="max-w-sm pr-3">{signal.signalTitle}<span className="mt-1 block text-muted-foreground">{signal.pointReason}</span></td>
                      <td className="pr-3">{formatDate(signal.sourceDate) || "Not dated"}</td>
                      <td className="pr-3 capitalize">{signal.freshness}</td>
                      <td className="font-mono">{signal.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {potentialOpportunities.length > 0 && (
        <Card className="border-primary/20 bg-primary/5 shadow-none">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-primary" /> Potential Opportunities</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-foreground/90">
              {potentialOpportunities.map((opportunity, index) => <li key={index} className="flex gap-2"><span className="text-primary">→</span><span>{sanitizeOpportunityLanguage(opportunity)}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Unconfirmed — validate during discovery before presenting these as prospect requirements.</p>
          </CardContent>
        </Card>
      )}

      {intelligence?.recommendedOutreach && (
        <Card className="border-primary/20 bg-primary/5 shadow-none">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4 text-primary" /> Recommended Outreach</CardTitle></CardHeader>
          <CardContent><p className="text-sm leading-relaxed text-foreground/90">{sanitizeOpportunityLanguage(intelligence.recommendedOutreach)}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
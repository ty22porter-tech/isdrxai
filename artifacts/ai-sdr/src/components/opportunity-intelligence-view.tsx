import {
  Activity,
  AlertTriangle,
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
  RefreshCw,
  Target,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { OpportunityIntelligence, OpportunitySignal } from "@workspace/api-client-react";
import { ITResearchView } from "./it-research-view";

interface OpportunityIntelligenceViewProps {
  intelligence: OpportunityIntelligence;
  className?: string;
  isDialog?: boolean;
  compact?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  vertical?: string;
}

const NO_BUYING_SIGNAL = "No meaningful company-specific buying signal found yet.";
const SELLER_SOURCES_REFRESH_GUIDANCE = "Refresh Intelligence to verify seller sources";

const SCORE_COLORS: Record<string, string> = {
  "High Priority": "bg-primary/10 text-primary border-primary/20",
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
  "company_operating_profile",
]);

/** Keeps legacy listing records out of the buying-signal group. */
export function isVerifiedCompanyInformation(signal: OpportunitySignal): boolean {
  const type = (signal.signalType || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (COMPANY_INFORMATION_TYPES.has(type)) return true;
  return /(?:google|business|company).*(?:listing|profile|verification)|(?:public|operating).*(?:address|website|phone)/i.test(
    `${signal.signalTitle || ""} ${signal.signalDescription || ""}`,
  );
}

export function sanitizeOpportunityLanguage(value?: string): string {
  return (value || "")
    .replace(/\bApollo company operating evidence\b/gi, "Company operating profile")
    .replace(/\bApollo company enrichment\b/gi, "Company research")
    .replace(/\bconfirmed needs?\b/gi, (match) =>
      match.toLowerCase().endsWith("s") ? "potential opportunities" : "potential opportunity",
    )
    .trim();
}

const NON_RESULT_LANGUAGE =
  /\b(?:no meaningful|no (?:verified|relevant|company-specific)|not found|none found|unverified|unknown|insufficient|unable to|could not|no evidence)\b/i;

const LEGACY_DEMOGRAPHIC_FALLBACK =
  /\b(?:sourced company-size profile as|sourced profile indicates|verified profile as) a \d+-employee organization\b/i;

function compactPositiveText(value?: string): string {
  return sanitizeOpportunityLanguage(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !NON_RESULT_LANGUAGE.test(sentence))
    .slice(0, 5)
    .join(" ");
}

function conciseOutreachText(value?: string): string {
  const text = compactPositiveText(value);
  const legacyMatch = text.match(
    /^For (.+?), tailor the approach to its verified profile as a (\d+)-employee organization\b/i,
  );
  if (!legacyMatch) return text;
  return `For ${legacyMatch[1]}, ask how its ${legacyMatch[2]}-person team handles onboarding, support, identity access, endpoint management, and security.`;
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
      </dl>
    </details>
  );
}

type SignalSectionProps = {
  title: string;
  signals: OpportunitySignal[];
  kind: "company" | "verified" | "implication" | "unconfirmed";
  emptyMessage?: string;
};

function SignalSection({ title, signals, kind, emptyMessage }: SignalSectionProps) {
  const icon =
    kind === "company" ? <Building2 className="h-4 w-4 text-primary" /> :
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
                    {kind === "verified" && signal.points > 0 && <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">+{signal.points} pts</Badge>}
                    {kind !== "verified" && <Badge variant="outline" className="text-muted-foreground">Unconfirmed</Badge>}
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
  onRefresh,
  isRefreshing = false,
  vertical,
}: OpportunityIntelligenceViewProps) {
  const isIT = vertical === "it_services";
  // The structured report is still stored under the legacy `itResearch`
  // property for API compatibility, but now applies to every seller vertical.
  const hasStructuredResearch = !!intelligence?.itResearch;
  const isLegacyReport = !hasStructuredResearch;

  const signals = Array.isArray(intelligence?.signals) ? intelligence.signals.filter(Boolean) : [];
  const companyInformation = signals.filter(
    (signal) => signal.signalClassification === "verified" && isVerifiedCompanyInformation(signal),
  );
  const verifiedBuyingSignals = signals.filter(
    (signal) => signal.signalClassification === "verified" && !isVerifiedCompanyInformation(signal) && signal.points > 0,
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
  const generatedAt = formatDate(intelligence?.generatedAt);
  const scoreLabelColor = SCORE_COLORS[intelligence?.label] || "bg-muted text-muted-foreground border-border";
  const displayWhyTarget = LEGACY_DEMOGRAPHIC_FALLBACK.test(intelligence?.whyTarget || "")
    ? ""
    : compactPositiveText(intelligence?.whyTarget);
  const displayPotentialOpportunities = potentialOpportunities
    .filter(opportunity => !LEGACY_DEMOGRAPHIC_FALLBACK.test(opportunity))
    .map(opportunity => compactPositiveText(opportunity))
    .filter(Boolean)
    .slice(0, 5);
  const displayRecommendedOutreach = conciseOutreachText(intelligence?.recommendedOutreach);

  const extIntel = intelligence as OpportunityIntelligence & { researchError?: string };

  if (extIntel.researchError) {
    return (
      <Card className={`border-destructive/20 bg-destructive/5 shadow-none ${className}`} data-testid="error-research">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-destructive">Research Failed</h4>
            <p className="text-sm text-destructive/80 max-w-md mx-auto">
              {extIntel.researchError}
            </p>
          </div>
          {onRefresh && (
            <Button onClick={onRefresh} disabled={isRefreshing} variant="destructive" className="mt-2 shadow-none">
              {isRefreshing ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Retrying...</> : <><RefreshCw className="mr-2 h-4 w-4" /> Retry Intelligence</>}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    if (hasStructuredResearch && intelligence.itResearch) {
      return <ITResearchView research={intelligence.itResearch} sellerVertical={vertical} compact />;
    }
    const positiveOpportunities = compactPositiveText(
      displayPotentialOpportunities
        .map(opportunity => /[.!?]$/.test(opportunity.trim()) ? opportunity.trim() : `${opportunity.trim()}.`)
        .join(" "),
    );
    const rows = [
      { label: "Why target", value: displayWhyTarget },
      { label: "Potential needs", value: positiveOpportunities },
      // Older reports only contain messaging-oriented outreach text. Do not
      // present that copy as a seller solution; direct users to refresh so
      // the structured report can verify offerings and sources.
      { label: "Outreach", value: displayRecommendedOutreach ? SELLER_SOURCES_REFRESH_GUIDANCE : "" },
    ].filter((row) => row.value);

    if (rows.length === 0) return null;

    return (
      <div className={`space-y-1.5 ${className}`} data-testid="section-opportunity-intelligence-compact">
        {rows.map((row) => (
          <p key={row.label} className="text-xs leading-relaxed text-muted-foreground">
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
                <h3 className="text-xl font-bold" data-testid="text-opportunity-score">Opportunity Score: {intelligence?.score ?? "—"}</h3>
                {intelligence?.label && <Badge variant="outline" className={`font-semibold ${scoreLabelColor}`}>{intelligence.label}</Badge>}
                {intelligence?.score >= 30 && <Badge variant="outline" className="border-primary/20 bg-primary/10 font-semibold text-primary">Fit to Call</Badge>}
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
              </div>
            </div>
            {onRefresh && !isLegacyReport && (
              <div className="shrink-0 mt-3 sm:mt-0">
                <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Refreshing..." : "Refresh Intelligence"}
                </Button>
              </div>
            )}
          </div>

          {displayWhyTarget && !hasStructuredResearch && !isLegacyReport && (
            <Card className="border-primary/15 bg-primary/5 shadow-none">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Target className="h-4 w-4 text-primary" /> Why Target</CardTitle></CardHeader>
              <CardContent><p className="text-sm leading-relaxed text-foreground/90">{displayWhyTarget}</p></CardContent>
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
                    {category.evidence?.length > 0 && (
                      <ul className="space-y-1 border-t pt-2 text-xs leading-relaxed text-foreground/80">
                        {category.evidence.map((item, evidenceIndex) => (
                          <li key={`${category.key}-evidence-${evidenceIndex}`} className="flex gap-2">
                            <span aria-hidden="true" className="text-primary">•</span>
                            <span>{sanitizeOpportunityLanguage(item)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {isLegacyReport && (
        <Card className="border-amber-200 bg-amber-50/50 shadow-none dark:border-amber-900/50 dark:bg-amber-900/10">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/40">
              <RefreshCw className="h-6 w-6 text-amber-600 dark:text-amber-500" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-amber-800 dark:text-amber-400">Research Update Available</h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 max-w-md mx-auto">
                {isIT
                  ? "This prospect was evaluated using an older intelligence model. Refresh to generate specific IT challenges, concerns, and recommended solutions based on current research."
                  : "This prospect was evaluated using an older intelligence model. Refresh to generate current industry challenges, prospect concerns, and recommended solutions based on current seller research."}
              </p>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300" data-testid="legacy-seller-sources-guidance">
                {SELLER_SOURCES_REFRESH_GUIDANCE}
              </p>
            </div>
            {onRefresh && (
              <Button onClick={onRefresh} disabled={isRefreshing} className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-none mt-2">
                {isRefreshing ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Researching...</> : <><Zap className="mr-2 h-4 w-4" /> Refresh Intelligence</>}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {hasStructuredResearch && intelligence.itResearch ? (
        <ITResearchView research={intelligence.itResearch} sellerVertical={vertical} />
      ) : (
        <>
          {hiringSignals.length > 0 && (
            <section className="space-y-2">
              {hiringSignals.map((signal, index) => <HiringSignal key={`${signal.signalTitle}-${index}`} signal={signal} index={index} />)}
            </section>
          )}

          <div className="grid grid-cols-1 gap-5">
            <SignalSection title="Verified Company Information" signals={companyInformation} kind="company" />
            <SignalSection title="Verified Buying Signals" signals={verifiedBuyingSignals} kind="verified" emptyMessage={NO_BUYING_SIGNAL} />
            <SignalSection title="Potential Implications" signals={implications} kind="implication" />
            <SignalSection title="Unconfirmed" signals={unconfirmed} kind="unconfirmed" />
          </div>

          {displayPotentialOpportunities.length > 0 && (
            <Card className="border-primary/20 bg-primary/5 shadow-none">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-primary" /> Potential Opportunities</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-foreground/90">
                  {displayPotentialOpportunities.map((opportunity, index) => <li key={index} className="flex gap-2"><span className="text-primary">→</span><span>{opportunity}</span></li>)}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Unconfirmed — validate during discovery before presenting these as prospect requirements.</p>
              </CardContent>
            </Card>
          )}

          {displayRecommendedOutreach && (
            <Card className="border-primary/20 bg-primary/5 shadow-none">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Lightbulb className="h-4 w-4 text-primary" /> Outreach</CardTitle></CardHeader>
              <CardContent><p className="text-sm leading-relaxed text-foreground/90">{SELLER_SOURCES_REFRESH_GUIDANCE}</p></CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
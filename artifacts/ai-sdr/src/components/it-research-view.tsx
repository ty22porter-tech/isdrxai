import { ExternalLink, Target, AlertTriangle, Lightbulb, Briefcase, Zap, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItResearch, ResearchSource, ItIndustryChallenge, ItProspectConcern, ItResearchRecommendation } from "@workspace/api-client-react";

export function SourcesList({ sources }: { sources: ResearchSource[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 border-t pt-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
      <ul className="space-y-1">
        {sources.map((source, idx) => (
          <li key={idx} className="text-xs">
            <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline" data-testid={`link-source-${idx}`}>
              {source.title} <ExternalLink className="h-3 w-3" />
            </a>
            {source.publishedDate && <span className="ml-2 text-muted-foreground">({new Date(source.publishedDate).toLocaleDateString()})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ITResearchView({
  research,
  compact,
  sellerVertical,
}: {
  research: ItResearch;
  compact?: boolean;
  /** Legacy reports can exist under itResearch for non-IT seller verticals. */
  sellerVertical?: string;
}) {
  const isITSeller = sellerVertical === "it_services";
  const industryChallengesHeading = isITSeller ? "Industry IT Challenges" : "Industry Challenges";
  const prospectConcernsHeading = isITSeller ? "Prospect IT Concerns" : "Prospect Concerns";

  if (compact) {
    return (
      <div className="space-y-2" data-testid="section-it-research-compact">
        {research.industryRelationship !== "match" && (
          <p className="text-xs text-amber-600 dark:text-amber-500 font-medium">Industry note: {research.industryExplanation}</p>
        )}
        {research.industryChallenges?.[0] && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Industry Challenge: </span>
            {research.industryChallenges[0].title} — {research.industryChallenges[0].businessImpact}
          </p>
        )}
        {research.prospectConcerns?.[0] && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Prospect Concern: </span>
            {research.prospectConcerns[0].title} ({research.prospectConcerns[0].classification})
          </p>
        )}
        {research.recommendations?.[0] && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Outreach: </span>
            {research.recommendations[0].outreachAngle}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="section-it-research-full">
      {research.warnings && research.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-900/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-500" />
            <div className="space-y-1">
              <h5 className="text-sm font-medium text-amber-800 dark:text-amber-400">Research Warnings</h5>
              <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-300">
                {research.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {research.industryRelationship && research.industryRelationship !== "match" && (
        <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-900/10">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-blue-600 dark:text-blue-500" />
            <div className="space-y-1">
              <h5 className="text-sm font-medium text-blue-800 dark:text-blue-400">
                Industry Mismatch: {research.actualIndustry || "Unknown"}
              </h5>
              <p className="text-xs text-blue-700 dark:text-blue-300">{research.industryExplanation}</p>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Briefcase className="h-4 w-4" /> {industryChallengesHeading}
        </h4>
        {research.industryChallenges && research.industryChallenges.length > 0 ? (
          <div className="grid gap-3">
            {research.industryChallenges.map((challenge, i) => (
              <Card key={i} className="shadow-none">
                <CardContent className="p-4 space-y-2">
                  <h5 className="font-semibold text-sm">{challenge.title}</h5>
                  <p className="text-sm text-foreground/80">{challenge.explanation}</p>
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Impact:</strong> {challenge.businessImpact}
                  </div>
                  <SourcesList sources={challenge.sources} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
            No industry challenges identified in this report.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Target className="h-4 w-4" /> {prospectConcernsHeading}
        </h4>
        {research.prospectConcerns && research.prospectConcerns.length > 0 ? (
          <div className="grid gap-3">
            {research.prospectConcerns.map((concern) => (
              <Card key={concern.id} className="shadow-none">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-semibold text-sm">{concern.title}</h5>
                    <div className="flex gap-2">
                      <Badge variant="outline" className={
                        concern.classification === "Verified" ? "bg-green-50 text-green-700 border-green-200" :
                        concern.classification === "Strong Indicator" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        "bg-muted text-muted-foreground"
                      }>{concern.classification}</Badge>
                      {concern.confidence && (
                        <Badge variant="outline" className="capitalize text-muted-foreground">
                          {concern.confidence} confidence
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80">{concern.explanation}</p>
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Evidence:</strong> {concern.evidence}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Impact:</strong> {concern.businessImpact}
                  </div>
                  <SourcesList sources={concern.sources} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
            No prospect concerns identified in this report.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Lightbulb className="h-4 w-4" /> Recommended Solutions and Outreach
        </h4>
        {research.recommendations && research.recommendations.length > 0 ? (
          <div className="grid gap-3">
            {research.recommendations.map((rec, i) => (
              <Card key={i} className="border-primary/20 bg-primary/5 shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h5 className="font-semibold text-sm text-primary mb-1">Solution: {rec.offering}</h5>
                    <p className="text-sm text-foreground/90">{rec.howItHelps}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs border-t border-primary/10 pt-3">
                    <div>
                      <strong className="block text-foreground mb-0.5">Business Value</strong>
                      <span className="text-muted-foreground">{rec.businessValue}</span>
                    </div>
                    <div>
                      <strong className="block text-foreground mb-0.5">Addresses Concern</strong>
                      <span className="text-muted-foreground">{rec.prospectConcern}</span>
                    </div>
                    <div className="md:col-span-2">
                      <strong className="block text-foreground mb-0.5">Outreach Angle</strong>
                      <span className="text-muted-foreground">{rec.outreachAngle}</span>
                    </div>
                    <div className="md:col-span-2 bg-background/50 p-2 rounded border border-primary/10">
                      <strong className="block text-primary mb-0.5">Discovery Question</strong>
                      <span className="text-foreground/90 italic">"{rec.discoveryQuestion}"</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground" data-testid="empty-recommended-solutions">
            No supported matching offering found in this report. Refresh seller research or review the seller research profile for current offerings.
          </p>
        )}
      </section>
      
      {research.lastResearched && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3 w-3" /> Last researched: {new Date(research.lastResearched).toLocaleString()}
        </p>
      )}
    </div>
  );
}

import React from "react";
import { 
  CheckCircle2, 
  Lightbulb, 
  HelpCircle,
  Zap,
  Activity,
  Clock,
  Archive,
  Minus,
  Info,
  ExternalLink,
  Target,
  BarChart,
  History,
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { 
  OpportunityIntelligence, 
  OpportunityScoreCategory, 
  OpportunitySignal 
} from "@workspace/api-client-react";

interface OpportunityIntelligenceViewProps {
  intelligence: OpportunityIntelligence;
  className?: string;
  isDialog?: boolean;
}

const SCORE_COLORS: Record<string, string> = {
  "High Priority": "bg-green-100 text-green-800 border-green-200",
  "Strong Fit": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Possible Fit": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Low Priority": "bg-gray-100 text-gray-600 border-gray-200",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-700",
  medium: "text-yellow-700",
  low: "text-gray-600",
};

function getClassificationIcon(classification: string) {
  switch (classification) {
    case "verified":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "implication":
      return <Lightbulb className="h-4 w-4 text-amber-600" />;
    case "unconfirmed":
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <Info className="h-4 w-4 text-gray-400" />;
  }
}

function getFreshnessIcon(freshness: string) {
  switch (freshness) {
    case "recent":
      return <Zap className="h-3 w-3 text-blue-500" />;
    case "active":
      return <Activity className="h-3 w-3 text-emerald-500" />;
    case "older":
      return <Clock className="h-3 w-3 text-amber-500" />;
    case "stale":
      return <Archive className="h-3 w-3 text-gray-400" />;
    default:
      return <Minus className="h-3 w-3 text-gray-300" />;
  }
}

export function OpportunityIntelligenceView({ intelligence, className = "", isDialog = false }: OpportunityIntelligenceViewProps) {
  const scoreLabelColor = SCORE_COLORS[intelligence.label] || "bg-gray-100 text-gray-800 border-gray-200";

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Summary */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold">Opportunity Score: {intelligence.score}</h3>
            <Badge variant="outline" className={`font-semibold ${scoreLabelColor}`}>
              {intelligence.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Target className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-medium text-foreground">Score measures seller fit.</span> It represents our operational match and their potential need, not purchase probability or recent engagement.
          </p>
          <div className="flex items-center gap-4 text-xs mt-1">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <BarChart className="h-3.5 w-3.5" />
              Confidence: <span className={`font-medium capitalize ${CONFIDENCE_COLORS[intelligence.scoreConfidence] || ""}`}>{intelligence.scoreConfidence}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Generated: {new Date(intelligence.generatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* AI Synthesis */}
      {(intelligence.whyTarget || intelligence.recommendedOutreach) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {intelligence.whyTarget && (
            <Card className="bg-primary/5 border-primary/10 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Why Target
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/90 leading-relaxed">{intelligence.whyTarget}</p>
              </CardContent>
            </Card>
          )}
          {intelligence.recommendedOutreach && (
            <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-emerald-600 dark:text-emerald-500" /> Outreach Strategy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/90 leading-relaxed">{intelligence.recommendedOutreach}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Breakdown Categories */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Score Breakdown</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {intelligence.breakdown.map((cat, idx) => (
            <div key={idx} className="p-4 rounded-lg border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <h5 className="font-semibold text-sm">{cat.label}</h5>
                <span className="text-xs font-mono font-medium bg-muted px-2 py-0.5 rounded">
                  {cat.points} / {cat.maxPoints} pts
                </span>
              </div>
              <Progress value={(cat.points / cat.maxPoints) * 100} className="h-1.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">{cat.explanation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detected Signals */}
      {intelligence.signals && intelligence.signals.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Detected Signals</span>
            <span className="text-xs font-normal normal-case text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {intelligence.signals.length} total
            </span>
          </h4>
          <div className="space-y-3">
            {intelligence.signals.map((sig, idx) => (
              <div key={idx} className="flex gap-4 p-4 rounded-lg border bg-card">
                <div className="mt-0.5 shrink-0">
                  {getClassificationIcon(sig.signalClassification)}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <h5 className="font-semibold text-sm">{sig.signalTitle}</h5>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                        {sig.points > 0 ? `+${sig.points} pts` : sig.signalClassification === 'unconfirmed' ? "+0 pts (Unconfirmed)" : "+0 pts"}
                      </Badge>
                    </div>
                  </div>
                  
                  <p className="text-xs text-foreground/80 leading-relaxed">{sig.signalDescription}</p>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground pt-1 mt-2 border-t border-border/50">
                    <span className="flex items-center gap-1 capitalize font-medium">
                      Classification: {sig.signalClassification}
                    </span>
                    <span className="flex items-center gap-1 capitalize">
                      {getFreshnessIcon(sig.freshness)}
                      {sig.freshness}
                    </span>
                    {(sig.sourceName || sig.sourceURL) && (
                      <span className="flex items-center gap-1">
                        Source: {sig.sourceURL ? (
                          <a href={sig.sourceURL} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                            {sig.sourceName || "Link"} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          sig.sourceName
                        )}
                        {sig.sourceDate && ` (${new Date(sig.sourceDate).toLocaleDateString()})`}
                      </span>
                    )}
                    {sig.dateDiscovered && (
                      <span className="text-muted-foreground/70">
                        Discovered: {new Date(sig.dateDiscovered).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

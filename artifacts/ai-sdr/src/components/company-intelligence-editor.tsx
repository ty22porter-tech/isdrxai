import { COST_COMPARISON_HELP } from "@workspace/db/ai-sales-automation";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";

function intelligenceFieldLabel(key: string) {
  const labels: Record<string, string> = {
    sellerServices: "Services",
    sellerProducts: "Products",
    sellerCapabilities: "Capabilities",
    sellerDifferentiators: "Strengths / Differentiators",
    sellerCertifications: "Certifications",
    sellerIndustriesServed: "Industries Served",
    sellerBusinessOutcomes: "Business Outcomes",
    sellerProblemsSolved: "Problems Solved",
    sellerProofPoints: "Proof Points",
    sellerPortfolioExamples: "Portfolio / Case Study Experience",
    sellerValuePropositions: "Value Propositions",
    sellerTypicalCustomers: "Typical Customers",
    sellerCTAs: "Relevant Calls to Action",
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Seller ", "");
}

function sourceRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function citationDetails(value: unknown) {
  if (typeof value === "string") return { label: value, url: "", evidence: "", date: "" };
  const source = sourceRecord(value);
  if (!source) return { label: "Public source", url: "", evidence: "", date: "" };
  const label = [
    source.title,
    source.name,
    source.sourceName,
    source.publisher,
    source.domain,
  ].find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() || "Public source";
  const url = [source.url, source.sourceURL, source.href]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() || "";
  const evidence = [source.evidence, source.supportingEvidence, source.description, source.citation]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() || "";
  const date = [source.publishedDate, source.sourceDate, source.date]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim() || "";
  return { label, url, evidence, date };
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}

/**
 * A failed research attempt must not be presented as the last successful
 * research. New profiles use researchLastAnalyzed for the successful evidence
 * timestamp and lastAnalysisAttemptAt for a separate attempt timestamp;
 * researchedGenerated remains a compatibility fallback for successful legacy
 * profiles.
 */
export function sellerResearchTimestamps(profile: Record<string, unknown>): {
  lastResearched?: string;
  lastAttempt?: string;
} {
  const status = profile.researchStatus;
  const hasSuccessfulResearch = status === "ready" || status === "limited";
  const lastResearched = hasSuccessfulResearch
    ? validTimestamp(profile.researchLastAnalyzed) ?? validTimestamp(profile.researchedGenerated)
    : undefined;
  const lastAttempt = validTimestamp(profile.lastAnalysisAttemptAt)
    ?? (status === "failed" || profile.lastAnalysisAttemptStatus === "failed"
      ? validTimestamp(profile.researchLastAnalyzed)
      : undefined);
  return { lastResearched, lastAttempt };
}

function StringArrayField({
  label,
  items,
  onChange,
  source,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  source: "Public research" | "Approved edit";
}) {
  return (
    <div className="space-y-2 border-t border-border pt-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold">{label}</label>
        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{source}</span>
      </div>
      {items.length === 0 && <div className="text-xs text-muted-foreground">No items added.</div>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                onChange(next);
              }}
              rows={2}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-red-400"
              onClick={() => {
                const next = [...items];
                next.splice(i, 1);
                onChange(next);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, ""])}
        className="mt-2 text-xs"
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Add {label}
      </Button>
    </div>
  );
}

export function CompanyIntelligenceEditor({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(() => ({
    sellerServices: Array.isArray(profile.sellerServices) ? profile.sellerServices : [],
    sellerProducts: Array.isArray(profile.sellerProducts) ? profile.sellerProducts : [],
    sellerCapabilities: Array.isArray(profile.sellerCapabilities) ? profile.sellerCapabilities : [],
    sellerDifferentiators: Array.isArray(profile.sellerDifferentiators) ? profile.sellerDifferentiators : [],
    sellerCertifications: Array.isArray(profile.sellerCertifications) ? profile.sellerCertifications : [],
    sellerIndustriesServed: Array.isArray(profile.sellerIndustriesServed) ? profile.sellerIndustriesServed : [],
    sellerBusinessOutcomes: Array.isArray(profile.sellerBusinessOutcomes) ? profile.sellerBusinessOutcomes : [],
    sellerProblemsSolved: Array.isArray(profile.sellerProblemsSolved) ? profile.sellerProblemsSolved : [],
    sellerProofPoints: Array.isArray(profile.sellerProofPoints) ? profile.sellerProofPoints : [],
    sellerPortfolioExamples: Array.isArray(profile.sellerPortfolioExamples) ? profile.sellerPortfolioExamples : [],
    sellerValuePropositions: Array.isArray(profile.sellerValuePropositions) ? profile.sellerValuePropositions : [],
    sellerTypicalCustomers: Array.isArray(profile.sellerTypicalCustomers) ? profile.sellerTypicalCustomers : [],
    sellerCTAs: Array.isArray(profile.sellerCTAs) ? profile.sellerCTAs : [],
  }));
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const researchIdentity = sourceRecord(profile.researchIdentity);
  const researchSources = Array.isArray(profile.researchSources) ? profile.researchSources : [];
  const hasResearchProvenance = Boolean(
    profile.researchVersion !== undefined && profile.researchStatus && researchIdentity,
  );
  const researchStatus = hasResearchProvenance
    ? String(profile.researchStatus).replace(/_/g, " ")
    : "refresh needed";
  const researchMethod = typeof profile.researchMethod === "string" ? profile.researchMethod : "";
  const researchVersion = profile.researchVersion;
  const { lastResearched, lastAttempt } = sellerResearchTimestamps(profile);

  useEffect(() => {
    setDraft({
      sellerServices: Array.isArray(profile.sellerServices) ? profile.sellerServices : [],
      sellerProducts: Array.isArray(profile.sellerProducts) ? profile.sellerProducts : [],
      sellerCapabilities: Array.isArray(profile.sellerCapabilities) ? profile.sellerCapabilities : [],
      sellerDifferentiators: Array.isArray(profile.sellerDifferentiators) ? profile.sellerDifferentiators : [],
      sellerCertifications: Array.isArray(profile.sellerCertifications) ? profile.sellerCertifications : [],
      sellerIndustriesServed: Array.isArray(profile.sellerIndustriesServed) ? profile.sellerIndustriesServed : [],
      sellerBusinessOutcomes: Array.isArray(profile.sellerBusinessOutcomes) ? profile.sellerBusinessOutcomes : [],
      sellerProblemsSolved: Array.isArray(profile.sellerProblemsSolved) ? profile.sellerProblemsSolved : [],
      sellerProofPoints: Array.isArray(profile.sellerProofPoints) ? profile.sellerProofPoints : [],
      sellerPortfolioExamples: Array.isArray(profile.sellerPortfolioExamples) ? profile.sellerPortfolioExamples : [],
      sellerValuePropositions: Array.isArray(profile.sellerValuePropositions) ? profile.sellerValuePropositions : [],
      sellerTypicalCustomers: Array.isArray(profile.sellerTypicalCustomers) ? profile.sellerTypicalCustomers : [],
      sellerCTAs: Array.isArray(profile.sellerCTAs) ? profile.sellerCTAs : [],
    });
  }, [profile]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...draft,
        ...Object.fromEntries(
          Object.entries(draft)
            .filter(([, value]) => Array.isArray(value))
            .map(([key, value]) => [
              key,
              (value as string[]).map(item => item.trim()).filter(Boolean),
            ]),
        ),
      };
      const res = await fetch("/api/users/company-intelligence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setMsg({ type: "ok", text: "Seller research edits updated successfully." });
      setTimeout(() => setMsg(null), 3000);
    },
    onError: (err: Error) => {
      setMsg({ type: "err", text: err.message });
    }
  });

  const arrayFields = [
    "sellerServices",
    "sellerProducts",
    "sellerCapabilities",
    "sellerDifferentiators",
    "sellerCertifications",
    "sellerIndustriesServed",
    "sellerBusinessOutcomes",
    "sellerProblemsSolved",
    "sellerProofPoints",
    "sellerPortfolioExamples",
    "sellerValuePropositions",
    "sellerTypicalCustomers",
    "sellerCTAs"
  ];

  return (
    <div className="space-y-4 rounded-md border border-border/70 bg-background/60 p-4 text-xs mt-3">
      <div className="rounded-md border border-border bg-card/60 p-3 text-muted-foreground">
        Seller research summarizes publicly discovered offerings and evidence for this company, including rebrands when public sources connect the old and current identity. Fields marked as approved edits override same-company research on future refreshes.
      </div>
      {profile.sellerIndustry === "ai_sales_automation" && <p className="rounded-md border p-3 text-muted-foreground">{COST_COMPARISON_HELP}</p>}
      <dl className="grid gap-2 rounded-md border border-border/70 p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="seller-research-metadata">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Company</dt>
          <dd className="mt-1 text-sm text-foreground">{profile.sellerCompanyName || "Not identified"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Seller industry</dt>
          <dd className="mt-1 text-sm text-foreground">{profile.sellerIndustry || researchIdentity?.vertical || "Not available"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Research status</dt>
          <dd className="mt-1 capitalize text-sm text-foreground">{researchStatus}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Research version</dt>
          <dd className="mt-1 text-sm text-foreground">{researchVersion ?? "Legacy profile"}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Company website (optional contact field)</dt>
          <dd className="mt-1 break-all text-sm text-foreground">{profile.sellerWebsite || "Not provided"}</dd>
        </div>
      </dl>
      <div className="rounded-md border border-border/70 bg-muted/20 p-3 text-muted-foreground" data-testid="seller-research-provenance">
        <p>
          <span className="font-medium text-foreground">Research provenance:</span>{" "}
          {researchMethod || "Public web research"}.
          {lastResearched && <> Last researched {new Date(lastResearched).toLocaleString()}.</>}
          {lastAttempt && <> Last attempt {new Date(lastAttempt).toLocaleString()}.</>}
        </p>
        {researchIdentity && (
          <p className="mt-1">
            <span className="font-medium text-foreground">Research identity:</span>{" "}
            {String(researchIdentity.companyName || profile.sellerCompanyName || "Unknown company")}
            {researchIdentity.vertical ? ` · seller industry ${String(researchIdentity.vertical)}` : ""}
          </p>
        )}
      </div>
      {researchSources.length > 0 && (
        <section className="space-y-2" data-testid="seller-research-sources">
          <div>
            <h3 className="text-sm font-semibold">Public research sources</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Citations supporting publicly discovered offerings, evidence, and company identity.</p>
          </div>
          <ul className="space-y-2">
            {researchSources.map((source: unknown, index: number) => {
              const citation = citationDetails(source);
              return (
                <li key={index} className="rounded-md border border-border/70 bg-background px-3 py-2">
                  {citation.url ? (
                    <a href={citation.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline" data-testid={`link-seller-research-source-${index}`}>
                      {citation.label}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{citation.label}</span>
                  )}
                  {citation.date && <span className="ml-2 text-muted-foreground">({citation.date})</span>}
                  {citation.evidence && <p className="mt-1 text-muted-foreground">{citation.evidence}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="space-y-1.5">
        <label htmlFor="input-research-profile-company-name" className="text-sm font-semibold">Research Profile Company Name</label>
        <input
          type="text"
          value={profile.sellerCompanyName || ""}
          readOnly
          aria-readonly="true"
          data-testid="input-research-profile-company-name"
          className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">This is read-only here. To change the canonical seller identity used for new research, update Seller Company Name in Settings.</p>
        {typeof researchIdentity?.companyName === "string" && researchIdentity.companyName !== profile.sellerCompanyName && (
          <p className="text-xs text-muted-foreground">
            Public research resolved a related name: <span className="font-medium text-foreground">{String(researchIdentity.companyName)}</span>. This does not change your Seller Company Name.
          </p>
        )}
      </div>

      {arrayFields.map(key => (
        <StringArrayField
          key={key}
          label={intelligenceFieldLabel(key)}
          items={draft[key as keyof typeof draft] as string[]}
          onChange={(items) => setDraft({ ...draft, [key]: items })}
          source={Object.prototype.hasOwnProperty.call(profile.userOverrides ?? {}, key) ? "Approved edit" : "Public research"}
        />
      ))}

      <div className="pt-4 border-t border-border flex items-center justify-between">
        {msg ? (
          <p className={`text-xs ${msg.type === "ok" ? "text-emerald-400" : "text-red-400"} flex items-center gap-1.5`}>
            {msg.type === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {msg.text}
          </p>
        ) : (
          <div />
        )}
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setMsg(null);
            mutation.mutate();
          }}
        >
          {mutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</> : "Save Edits"}
        </Button>
      </div>
    </div>
  );
}

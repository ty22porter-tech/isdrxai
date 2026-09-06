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

function StringArrayField({
  label,
  items,
  onChange
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-4 mt-4">
      <label className="text-sm font-semibold">{label}</label>
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
    sellerCompanyName: profile.sellerCompanyName || "",
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

  useEffect(() => {
    setDraft({
      sellerCompanyName: profile.sellerCompanyName || "",
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
        sellerCompanyName: draft.sellerCompanyName.trim() || null,
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
      setMsg({ type: "ok", text: "Company intelligence updated successfully." });
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
      <div className="space-y-1.5">
        <label className="text-sm font-semibold">Company Name</label>
        <input
          type="text"
          value={draft.sellerCompanyName}
          onChange={e => setDraft({ ...draft, sellerCompanyName: e.target.value })}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {arrayFields.map(key => (
        <StringArrayField
          key={key}
          label={intelligenceFieldLabel(key)}
          items={draft[key as keyof typeof draft] as string[]}
          onChange={(items) => setDraft({ ...draft, [key]: items })}
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

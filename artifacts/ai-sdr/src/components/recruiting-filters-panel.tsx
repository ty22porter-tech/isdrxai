import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECRUITING_INDUSTRIES, type RecruitingFilterState } from "@/lib/recruiting";

type Props = { value: RecruitingFilterState; onChange: (next: RecruitingFilterState) => void };

const TEXT_FIELDS: { key: keyof RecruitingFilterState; label: string; placeholder: string; type?: string }[] = [
  { key: "subindustry", label: "Subindustry", placeholder: "e.g. Home health, Midstream" },
  { key: "hiringLocation", label: "Job location detail (optional)", placeholder: "Further restrict by site or region" },
  { key: "radiusMiles", label: "Radius (miles)", placeholder: "e.g. 50", type: "number" },
  { key: "companySize", label: "Company size", placeholder: "e.g. 50-500 employees" },
  { key: "jobTitles", label: "Job titles", placeholder: "e.g. RN, CNC Machinist" },
  { key: "roleFamilies", label: "Role families", placeholder: "e.g. Nursing, Skilled trades" },
  { key: "seniority", label: "Seniority", placeholder: "e.g. Mid-level, Director" },
  { key: "employmentType", label: "Employment type", placeholder: "Full-time, contract, temporary" },
  { key: "workArrangement", label: "Work arrangement", placeholder: "On-site, hybrid, remote" },
  { key: "recencyDays", label: "Signal recency (days)", placeholder: "e.g. 30", type: "number" },
  { key: "minRelevantJobs", label: "Min. unique relevant postings", placeholder: "e.g. 3", type: "number" },
  { key: "openingBefore", label: "Expansion or opening before", placeholder: "", type: "date" },
];

export function RecruitingFiltersPanel({ value, onChange }: Props) {
  const set = <K extends keyof RecruitingFilterState>(k: K, v: RecruitingFilterState[K]) => onChange({ ...value, [k]: v });
  const toggle = (ind: (typeof RECRUITING_INDUSTRIES)[number]) =>
    set("industries", value.industries.includes(ind) ? value.industries.filter((i) => i !== ind) : [...value.industries, ind]);

  return (
    <div className="space-y-4" data-testid="panel-recruiting-filters">
      <div className="space-y-2">
        <Label>Employer Industries</Label>
        <p className="text-xs text-muted-foreground">Search starts with published openings in the job search area, then researches the hiring employers. Select employer sectors, not job functions: a developer at a manufacturer is Manufacturing. Leave optional job filters blank to discover broader hiring needs.</p>
        <div className="flex flex-wrap gap-2">
          {RECRUITING_INDUSTRIES.map((ind) => {
            const active = value.industries.includes(ind);
            return (
              <button
                key={ind}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(ind)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                data-testid={`toggle-industry-${ind.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
              >
                {active && <Check className="h-3.5 w-3.5" />}{ind}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={`rf-${f.key}`}>{f.label}</Label>
            <Input
              id={`rf-${f.key}`}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={String(value[f.key] ?? "")}
              onChange={(e) => set(f.key, e.target.value as never)}
              data-testid={`input-recruiting-${f.key}`}
            />
          </div>
        ))}
        <div className="space-y-2">
          <Label>Signal type</Label>
          <p className="text-xs text-muted-foreground">Growth filters further narrow employers found through job openings; they do not start a separate growth-only search.</p>
          <Select value={value.signalType} onValueChange={(v) => set("signalType", v as RecruitingFilterState["signalType"])}>
            <SelectTrigger data-testid="select-recruiting-signal"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All signals</SelectItem>
              <SelectItem value="jobs">Active job postings</SelectItem>
              <SelectItem value="expansion">Expansion</SelectItem>
              <SelectItem value="relocation">Relocation</SelectItem>
              <SelectItem value="new_business">New businesses hiring</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Evidence confidence</Label>
          <Select value={value.confidence} onValueChange={(v) => set("confidence", v as RecruitingFilterState["confidence"])}>
            <SelectTrigger data-testid="select-recruiting-confidence"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium or higher</SelectItem>
              <SelectItem value="low">Low or higher</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.serviceMatchOnly} onChange={(e) => set("serviceMatchOnly", e.target.checked)} data-testid="checkbox-service-match" />
          Only employers matching my confirmed services and specialties
        </label>
      </div>
    </div>
  );
}

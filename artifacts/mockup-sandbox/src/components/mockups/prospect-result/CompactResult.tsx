import { Building2, Globe, MapPin, Phone } from "lucide-react";
import "./_group.css";

const rows = [
  {
    label: "Why target",
    value: "Verified local IT services company with active field operations and a public Dallas location.",
  },
  {
    label: "Potential needs",
    value: "Support field-team growth; streamline onboarding for new technicians.",
  },
  {
    label: "Verified signal",
    value: "Hiring service technicians: Current openings are listed in Dallas.",
  },
  {
    label: "Recommended outreach",
    value: "Lead with the verified hiring activity and ask how the team supports new field technicians.",
  },
];

export function CompactResult() {
  return (
    <main className="min-h-screen bg-background p-8 font-sans text-foreground">
      <article className="mx-auto max-w-4xl rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Northstar Technology Services</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Managed IT Services</p>
          </div>
          <button className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Add Prospect
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Dallas, TX</span>
          <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> (214) 555-0148</span>
          <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> northstartech.com</span>
        </div>

        <div className="mt-3">
          <span className="inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            IT Opportunity Score: 74 — Strong Fit
          </span>
          <button className="ml-2 px-2 py-1 text-xs font-medium text-primary">View Score Breakdown</button>
        </div>

        <div className="my-3 h-px bg-border" />

        <div className="space-y-1.5" data-testid="section-opportunity-intelligence-compact">
          {rows.map((row) => (
            <p key={row.label} className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{row.label}: </span>
              {row.value}
            </p>
          ))}
        </div>
      </article>
    </main>
  );
}
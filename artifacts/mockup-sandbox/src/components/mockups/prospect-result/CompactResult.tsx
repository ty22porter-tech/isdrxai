import { Building2, Globe, MapPin, Phone } from "lucide-react";
import "./_group.css";

const rows = [
  {
    label: "Why target",
    value: "Official mobile-service evidence: All About Home Care states that its caregivers provide in-home care throughout North Texas. This verifies a mobile operating model, but not fleet size or a current graphics need.",
  },
  {
    label: "Potential needs",
    value: "All About Home Care’s documented in-home service model creates a question about whether supporting vehicles are clearly and consistently identified. Northstar Graphics’ fleet lettering may support a more recognizable field presence if discovery confirms a vehicle-branding gap.",
  },
  {
    label: "Recommended outreach",
    value: "Ask All About Home Care how vehicles supporting its in-home service model are identified today and where consistency becomes difficult. If they confirm a gap, connect fleet lettering to the specific vehicles and timing they describe.",
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
              <h2 className="text-lg font-semibold">All About Home Care</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Home Health Care</p>
          </div>
          <button className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Add Prospect
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
           <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Dallas, TX</span>
           <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> (214) 555-0186</span>
           <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> allabouthomecare.example</span>
        </div>

        <div className="mt-3">
          <span className="inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Fleet Wrap Opportunity Score: 58 — Possible Fit
          </span>
          <button className="ml-2 px-2 py-1 text-xs font-medium text-primary">View Score Breakdown</button>
        </div>

        <div className="my-3 h-px bg-border" />

        <div className="space-y-1.5" data-testid="section-opportunity-intelligence-compact">
          {rows.map((row) => (
            <p key={row.label} className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{row.label}: </span>
              {row.value}
            </p>
          ))}
        </div>
      </article>
    </main>
  );
}
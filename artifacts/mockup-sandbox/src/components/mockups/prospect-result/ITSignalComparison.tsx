import { Building2, Globe, MapPin, Phone } from "lucide-react";
import "./_group.css";

type ProspectCardProps = {
  stateLabel: string;
  company: string;
  industry: string;
  location: string;
  phone: string;
  website: string;
  score: string;
  rows: Array<{ label: string; value: string }>;
};

function ProspectCard({
  stateLabel,
  company,
  industry,
  location,
  phone,
  website,
  score,
  rows,
}: ProspectCardProps) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
        {stateLabel}
      </p>
      <article className="h-full rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 shrink-0 text-primary" />
              <h2 className="text-lg font-semibold">{company}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{industry}</p>
          </div>
          <button className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Add Prospect
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> {location}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> {phone}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> {website}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            IT Opportunity Score: {score}
          </span>
          <button className="px-2 py-1 text-xs font-medium text-primary">
            View Score Breakdown
          </button>
        </div>

        {rows.length > 0 && (
          <>
            <div className="my-3 h-px bg-border" />
            <div className="space-y-2">
              {rows.map((row) => (
                <p key={row.label} className="text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{row.label}: </span>
                  {row.value}
                </p>
              ))}
            </div>
          </>
        )}
      </article>
    </section>
  );
}

const signalRows = [
  {
    label: "Why target",
    value:
      "Official expansion announcement: Meridian Financial opened a second North Texas office. This may create a need to integrate users, systems, security controls, and support during the expansion.",
  },
  {
    label: "Potential needs",
    value:
      "Meridian Financial’s verified second-office expansion creates a question about consistent identity access, endpoint setup, and network support across both locations. SecurePath IT’s multi-location network integration may support consistent and secure operations.",
  },
  {
    label: "Verified signal",
    value:
      "The company’s official news page announced its second North Texas office on August 18, 2026.",
  },
  {
    label: "Recommended outreach",
    value:
      "Ask Meridian Financial how technology access and support are being coordinated for the verified second office. If the expansion reveals gaps, connect SecurePath IT’s multi-location network integration to the locations and rollout timing they describe.",
  },
];

export function ITSignalComparison() {
  return (
    <main className="min-h-screen bg-background p-8 font-sans text-foreground">
      <div className="mx-auto max-w-[1380px]">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Corrected IT prospect-card behavior</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Narrative fields appear only when verified company-specific evidence supports them.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <ProspectCard
            stateLabel="Verified company-specific signal"
            company="Meridian Financial"
            industry="Financial Services"
            location="Plano, TX"
            phone="(972) 555-0142"
            website="meridianfinancial.example"
            score="72 — Strong Fit"
            rows={signalRows}
          />
          <ProspectCard
            stateLabel="No company-specific signal"
            company="SF5 Construction"
            industry="Construction"
            location="Frisco, TX"
            phone="(469) 555-0175"
            website="sf5construction.example"
            score="28 — Low Priority"
            rows={[]}
          />
        </div>
      </div>
    </main>
  );
}
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { ChevronDown, ChevronRight, Fingerprint, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VisitorEvent { event: string; page: string; at: string }
interface KnownVisitor {
  id: number;
  identitySource: "signed_in" | "form_submission";
  name: string | null;
  email: string | null;
  company: string | null;
  emailDomain: string | null;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  events: VisitorEvent[];
}
interface VisitorActivityResponse { visitors: KnownVisitor[]; days: number; limit: number }

async function fetchVisitorActivity(): Promise<VisitorActivityResponse> {
  const res = await fetch("/api/admin/visitor-activity", { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "Viewed page",
  book_demo_clicked: "Clicked Book a Demo",
  free_trial_clicked: "Clicked Start Free Trial",
  pricing_clicked: "Clicked Pricing",
  settings_saved: "Saved settings",
  calendly_authorization_started: "Started Calendly connection",
  lead_form_submitted: "Submitted demo/contact form",
};

const fmt = (iso: string) => new Date(iso).toLocaleString();

function SourceBadge({ source }: { source: KnownVisitor["identitySource"] }) {
  return source === "signed_in" ? (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
      Signed-in account
    </span>
  ) : (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30" title="Details typed into a demo/contact form; not verified by iSDRX">
      Form lead · unverified, self-reported
    </span>
  );
}

export function VisitorActivityReport() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { user, isLoaded } = useUser();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-visitor-activity", user?.id ?? null],
    queryFn: fetchVisitorActivity,
    enabled: isLoaded && !!user?.id,
  });
  const visitors = data?.visitors ?? [];

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-primary" />
            Known Visitor Activity
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Opted-in browser sessions linked to a signed-in account or a submitted form, last {data?.days ?? 30} days
            (up to {data?.limit ?? 100}). Each row is a browser session, not necessarily a unique person. Anonymous sessions are excluded.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : isError ? (
        <div className="px-6 py-10 text-center">
          <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-destructive" />
          <p className="font-medium text-sm">Couldn't load visitor activity</p>
          <p className="text-xs text-muted-foreground mt-1">{(error as Error)?.message}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : visitors.length === 0 ? (
        <div className="px-6 py-12 text-center text-muted-foreground">
          <Fingerprint className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">No known visitor sessions yet</p>
          <p className="text-xs mt-1">Sessions appear once a visitor opts in and signs in or submits a demo/contact form.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visitors.map((v) => {
            const open = expanded === v.id;
            return (
              <div key={v.id} className="px-6 py-4">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : v.id)}
                  className="w-full text-left flex flex-col md:flex-row md:items-center gap-2 md:gap-4 group"
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {v.name || v.email || "Name not provided"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[v.email, v.company, v.emailDomain && `@${v.emailDomain}`].filter(Boolean).join(" · ") || "No contact details"}
                      </div>
                    </div>
                  </div>
                  <SourceBadge source={v.identitySource} />
                  <div className="text-xs text-muted-foreground md:text-right whitespace-nowrap">
                    <div><span className="text-foreground font-semibold">{v.totalEvents}</span> event{v.totalEvents === 1 ? "" : "s"}</div>
                    <div>Last {fmt(v.lastSeen)}</div>
                  </div>
                </button>
                {open && (
                  <div className="mt-3 ml-5 rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-xs">
                      {([
                        ["Name", v.name], ["Email", v.email], ["Company", v.company], ["Email domain", v.emailDomain],
                        ["First seen", fmt(v.firstSeen)], ["Last seen", fmt(v.lastSeen)],
                      ] as [string, string | null][]).map(([l, val]) => (
                        <div key={l} className="flex justify-between gap-4">
                          <span className="text-muted-foreground">{l}</span>
                          <span className={val ? "font-medium break-all text-right" : "italic text-muted-foreground/60"}>{val || "not provided"}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                        Recent activity {v.totalEvents > v.events.length && `(latest ${v.events.length} of ${v.totalEvents})`}
                      </div>
                      {v.events.length === 0 ? (
                        <p className="text-xs italic text-muted-foreground">No events recorded.</p>
                      ) : (
                        <ul className="space-y-1">
                          {v.events.map((e, i) => (
                            <li key={`${e.at}-${i}`} className="flex justify-between gap-4 text-xs">
                              <span>{EVENT_LABELS[e.event] ?? e.event} <span className="text-muted-foreground">· {e.page.replace(/_/g, " ")}</span></span>
                              <span className="text-muted-foreground whitespace-nowrap">{fmt(e.at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

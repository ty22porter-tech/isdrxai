import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type ConversionMetric =
  | "book_demo" | "start_trial" | "buy_now" | "get_started"
  | "demo_completed" | "accounts" | "trial_started" | "paid_sale"
  | "checkout_started" | "calendar_errors" | "calendar_unbooked";

export const METRIC_META: Record<ConversionMetric, { title: string; note: string }> = {
  book_demo: { title: "Book a Demo clicks", note: "Website CTA clicks. Identity is shown only when the server could associate one." },
  start_trial: { title: "Start Free Trial clicks", note: "Website CTA clicks. Identity is shown only when the server could associate one." },
  buy_now: { title: "Buy Now clicks", note: "Website CTA clicks. Identity is shown only when the server could associate one." },
  get_started: { title: "Get Started clicks", note: "Website CTA clicks. Identity is shown only when the server could associate one." },
  demo_completed: { title: "Demo requests", note: "Completed demo request submissions." },
  accounts: { title: "Accounts created", note: "New accounts created in the period." },
  trial_started: { title: "Free trials", note: "Trials started in the period." },
  paid_sale: { title: "New customers", note: "Confirmed paid sales." },
  checkout_started: { title: "Stripe checkout starts", note: "Successful checkout-session creation — not confirmed payments." },
  calendar_errors: { title: "Calendar link errors", note: "Errors observed in our scheduling/link flow only (server-recorded or browser-reported, unverified). Errors inside Calendly itself are not visible to us." },
  calendar_unbooked: { title: "Calendar clicks without a confirmed booking", note: "Individual non-bot tracked click attempts with no matched Calendly booking. Not proof of a failed visit — booking sync may lag and recent clicks are included." },
};

interface Row {
  id: string; at: string; name: string | null; email: string | null;
  identitySource: string; ownerEmail: string | null; outcome: string; detail: string;
}
interface Resp { rows: Row[]; total: number; offset: number; limit: number }

async function fetchDetails(metric: string, offset: number): Promise<Resp> {
  const res = await fetch(`/api/admin/conversion-details?metric=${metric}&days=30&offset=${offset}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(res.status === 403 ? "Admin access required." : err.message || err.error || `API error ${res.status}`);
  }
  return res.json();
}

export function ConversionDetailsDialog({ metric, onClose }: { metric: ConversionMetric | null; onClose: () => void }) {
  const { user } = useUser();
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [metric]);

  const q = useQuery({
    queryKey: ["admin-conversion-details", user?.id ?? null, metric, offset],
    queryFn: () => fetchDetails(metric!, offset),
    enabled: !!metric && !!user?.id,
  });
  const data = q.data;
  const limit = data?.limit ?? 50;
  const total = data?.total ?? 0;
  const meta = metric ? METRIC_META[metric] : null;

  return (
    <Dialog open={!!metric} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{meta?.title}</DialogTitle>
          <DialogDescription>Last 30 days. {meta?.note}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          “Identity” is what the server associated with the event (e.g. link recipient) — links can be forwarded or scanned, so it is not a verified clicker.
          “Owner” is the responsible app user, not the person who clicked.
        </p>

        <div className="flex-1 overflow-y-auto rounded-lg border divide-y">
          {q.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-3 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
            ))
          ) : q.isError ? (
            <div className="p-8 text-center">
              <AlertTriangle className="w-6 h-6 mx-auto text-destructive mb-2" />
              <p className="text-sm">{(q.error as Error).message || "Could not load details."}</p>
              <Button size="sm" variant="secondary" className="mt-3 gap-1.5" onClick={() => q.refetch()}>
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          ) : !data || data.rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <Inbox className="w-7 h-7 mx-auto mb-2" />
              <p className="text-sm">No events recorded for this metric in the last 30 days.</p>
            </div>
          ) : (
            data.rows.map((r) => (
              <div key={r.id} className={`p-3 text-sm ${q.isFetching ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {r.name || r.email ? (
                      <>{r.name ?? r.email}{r.name && r.email && <span className="text-muted-foreground font-normal"> · {r.email}</span>}</>
                    ) : <span className="text-muted-foreground italic">Anonymous</span>}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.at).toLocaleString()}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Outcome: <span className="text-foreground">{r.outcome}</span></span>
                  <span>Identity source: {r.identitySource}</span>
                  {r.ownerEmail && <span>Owner: {r.ownerEmail}</span>}
                </div>
                {r.detail && <p className="mt-1 text-xs text-muted-foreground break-words">{r.detail}</p>}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total > 0 ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}` : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0 || q.isFetching} onClick={() => setOffset(Math.max(0, offset - limit))}>
              <ChevronLeft className="w-3.5 h-3.5" /> Prev 50
            </Button>
            <Button size="sm" variant="outline" disabled={offset + limit >= total || q.isFetching} onClick={() => setOffset(offset + limit)}>
              Next 50 <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

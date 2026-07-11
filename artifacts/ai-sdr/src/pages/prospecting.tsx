import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useProspectSearch, useCreateProspect, useBulkCreateProspects, getListProspectsQueryKey } from "@workspace/api-client-react";
import type { ProspectLead } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, UserPlus, Check, Building2, Phone, Mail, MapPin, Users, SquareStack, AlertCircle, RefreshCw, X, RotateCcw } from "lucide-react";

const INDUSTRIES = [
  "Healthcare",
  "Technology",
  "Legal",
  "Finance",
  "Commercial Real Estate",
  "Logistics & Warehousing",
  "Manufacturing",
  "Education",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

// When "Skip duplicates" is chosen, the server reports duplicates as failures
// with a "Duplicate:" reason. Detect those so we can report them as skipped
// rather than failed.
const isDuplicateError = (error?: string) => !!error && /^duplicate/i.test(error.trim());

// Persisted snapshot of an in-progress prospect list so it survives leaving the
// page, refresh, or tab close. Sets/Maps are stored as arrays for JSON.
type ProspectingSnapshot = {
  savedAt: number;
  params: { city: string; state: string; industry: string; count: string };
  leads: ProspectLead[];
  added: number[];
  skipped: number[];
  failures: [number, string][];
  cancelledRemaining: number[] | null;
  duplicateStrategy: "skip" | "update";
};

const storageKeyForUser = (userId: string) => `prospecting:inprogress:${userId}`;

export default function Prospecting() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [industry, setIndustry] = useState("");
  const [count, setCount] = useState("10");
  const [leads, setLeads] = useState<ProspectLead[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [failures, setFailures] = useState<Map<number, string>>(new Map());
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addAllProgress, setAddAllProgress] = useState<{ done: number; total: number; added: number; updated: number; skipped: number } | null>(null);
  const [cancelledRemaining, setCancelledRemaining] = useState<Set<number> | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update">("skip");
  const [confirmSearchOpen, setConfirmSearchOpen] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<ProspectingSnapshot | null>(null);
  const cancelAddAllRef = useRef(false);
  const hydratedRef = useRef(false);

  const { user } = useUser();
  const storageKey = user?.id ? storageKeyForUser(user.id) : null;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchMutation = useProspectSearch();
  const createProspect = useCreateProspect();
  const bulkCreateProspects = useBulkCreateProspects();

  const runSearch = () => {
    setRestorable(null);
    setLeads([]);
    setAdded(new Set());
    setSkipped(new Set());
    setFailures(new Map());
    setCancelledRemaining(null);
    searchMutation.mutate(
      { data: { city: city.trim(), state, industry, count: parseInt(count) } },
      {
        onSuccess: (data) => setLeads(data),
        onError: () => toast({ title: "Search failed", description: "Could not generate prospects.", variant: "destructive" }),
      }
    );
  };

  const handleSearch = () => {
    if (!city.trim() || !state || !industry) {
      toast({ title: "Fill in all fields", description: "City, state, and industry are required.", variant: "destructive" });
      return;
    }
    const hasUnaddedLeads = leads.length > 0 && leads.some((_, idx) => !added.has(idx));
    if ((hasUnaddedLeads || (cancelledRemaining?.size ?? 0) > 0) && addAllProgress === null) {
      setConfirmSearchOpen(true);
      return;
    }
    runSearch();
  };

  const handleAdd = async (lead: ProspectLead, idx: number) => {
    setAddingId(idx);
    createProspect.mutate(
      {
        data: {
          companyName: lead.companyName,
          contactName: lead.contactName,
          email: lead.email,
          phone: lead.phone,
          industry: lead.industry,
          city: lead.city,
          state: lead.state,
          website: lead.website,
          notes: `${lead.contactTitle} — ${lead.whyTarget}`,
          employeeCount: lead.estimatedEmployees,
          squareFootage: lead.estimatedSquareFootage,
        },
      },
      {
        onSuccess: () => {
          setAdded((prev) => new Set([...prev, idx]));
          setFailures((prev) => {
            const next = new Map(prev);
            next.delete(idx);
            return next;
          });
          setCancelledRemaining((prev) => {
            if (!prev || !prev.has(idx)) return prev;
            const next = new Set(prev);
            next.delete(idx);
            return next.size > 0 ? next : null;
          });
          setAddingId(null);
          queryClient.invalidateQueries({ queryKey: getListProspectsQueryKey() });
          toast({ title: "Prospect added", description: `${lead.companyName} added to your pipeline.` });
        },
        onError: (err: any) => {
          setAddingId(null);
          const reason = err?.data?.error || err?.message || "Could not add prospect";
          setFailures((prev) => new Map(prev).set(idx, reason));
          toast({ title: "Failed to add", description: reason, variant: "destructive" });
        },
      }
    );
  };

  const handleAddAll = async () => {
    const pending = leads
      .map((lead, idx) => ({ lead, idx }))
      .filter(({ idx }) => !added.has(idx));
    if (!pending.length) return;
    const CHUNK_SIZE = 100;
    let totalAdded = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let anyRequestSucceeded = false;
    let cancelled = false;
    const addedThisRun = new Set<number>();
    cancelAddAllRef.current = false;
    setCancelledRemaining(null);
    setAddAllProgress({ done: 0, total: pending.length, added: 0, updated: 0, skipped: 0 });
    try {
      for (let start = 0; start < pending.length; start += CHUNK_SIZE) {
        if (cancelAddAllRef.current) {
          cancelled = true;
          break;
        }
        const chunk = pending.slice(start, start + CHUNK_SIZE);
        try {
          const result = await bulkCreateProspects.mutateAsync({
            data: {
              duplicateStrategy,
              prospects: chunk.map(({ lead }) => ({
                companyName: lead.companyName,
                contactName: lead.contactName,
                email: lead.email,
                phone: lead.phone,
                industry: lead.industry,
                city: lead.city,
                state: lead.state,
                website: lead.website,
                notes: `${lead.contactTitle} — ${lead.whyTarget}`,
                employeeCount: lead.estimatedEmployees,
                squareFootage: lead.estimatedSquareFootage,
              })),
            },
          });
          anyRequestSucceeded = true;
          totalAdded += result.added;
          totalUpdated += result.updated ?? 0;
          if (duplicateStrategy === "skip") {
            const skippedInChunk = result.results.filter((r) => !r.success && isDuplicateError(r.error)).length;
            totalSkipped += skippedInChunk;
            totalFailed += result.failed - skippedInChunk;
          } else {
            totalFailed += result.failed;
          }
          setAdded((prev) => {
            const next = new Set(prev);
            result.results.forEach((r) => {
              if (r.success) {
                next.add(chunk[r.index].idx);
                addedThisRun.add(chunk[r.index].idx);
              }
            });
            return next;
          });
          const skippedIdxInChunk: number[] = [];
          setFailures((prev) => {
            const next = new Map(prev);
            result.results.forEach((r) => {
              const idx = chunk[r.index].idx;
              if (r.success) {
                next.delete(idx);
              } else if (duplicateStrategy === "skip" && isDuplicateError(r.error)) {
                // Skipped duplicate — not a failure the user needs to act on.
                next.delete(idx);
                skippedIdxInChunk.push(idx);
              } else {
                next.set(idx, r.error || "Could not add prospect");
              }
            });
            return next;
          });
          if (skippedIdxInChunk.length) {
            setSkipped((prev) => new Set([...prev, ...skippedIdxInChunk]));
          }
        } catch (err: any) {
          totalFailed += chunk.length;
          const reason = err?.data?.error || err?.message || "Could not add prospect";
          setFailures((prev) => {
            const next = new Map(prev);
            chunk.forEach(({ idx }) => next.set(idx, reason));
            return next;
          });
        }
        setAddAllProgress({ done: Math.min(start + CHUNK_SIZE, pending.length), total: pending.length, added: totalAdded, updated: totalUpdated, skipped: totalSkipped });
      }
      queryClient.invalidateQueries({ queryKey: getListProspectsQueryKey() });
      const summaryParts = [`${totalAdded} added`];
      if (totalUpdated) summaryParts.push(`${totalUpdated} updated`);
      if (totalSkipped) summaryParts.push(`${totalSkipped} skipped`);
      const addedUpdated = summaryParts.join(", ");
      if (cancelled) {
        const remaining = new Set(
          pending.filter(({ idx }) => !addedThisRun.has(idx)).map(({ idx }) => idx)
        );
        setCancelledRemaining(remaining.size > 0 ? remaining : null);
        toast({
          title: "Add all cancelled",
          description: `${addedUpdated} before cancelling.${remaining.size ? ` ${remaining.size} still need adding.` : ""}${totalFailed ? ` ${totalFailed} failed.` : ""}`,
        });
      } else if (!anyRequestSucceeded) {
        toast({ title: "Failed to add prospects", variant: "destructive" });
      } else if (totalFailed === 0) {
        toast({
          title: totalUpdated ? "Prospects added and updated" : totalSkipped ? "Prospects added" : "All prospects added",
          description: `${addedUpdated} in your pipeline.`,
        });
      } else {
        toast({
          title: "Some prospects failed to add",
          description: `${addedUpdated}, ${totalFailed} failed. See the reason under each highlighted prospect below.`,
          variant: "destructive",
        });
      }
    } finally {
      setAddAllProgress(null);
    }
  };

  const allAdded = leads.length > 0 && leads.every((_, idx) => added.has(idx));
  const hasRemaining = (cancelledRemaining?.size ?? 0) > 0;
  const hasUnaddedLeads = leads.length > 0 && leads.some((_, idx) => !added.has(idx));
  const hasUnsavedList = hasUnaddedLeads || hasRemaining;

  // Restore any in-progress list saved from a previous visit (per client). We
  // don't auto-populate the page — instead we surface a restore / start-fresh
  // affordance so the user stays in control of a possibly stale list.
  useEffect(() => {
    if (!storageKey || hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const snap = JSON.parse(raw) as ProspectingSnapshot;
      const addedSet = new Set(snap?.added ?? []);
      const stillUnadded =
        (snap?.leads?.length ?? 0) > 0 &&
        (snap.leads.some((_, i) => !addedSet.has(i)) || (snap.cancelledRemaining?.length ?? 0) > 0);
      if (stillUnadded) {
        setRestorable(snap);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Corrupt/unreadable snapshot — clear it so we start clean next time.
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey]);

  // Persist the in-progress list whenever it changes, so leaving the page (in-app
  // nav, refresh, or tab close) doesn't lose it. We hold off while a restore
  // decision is pending so we don't overwrite the saved snapshot first.
  useEffect(() => {
    if (!hydratedRef.current || !storageKey || restorable) return;
    if (!hasUnsavedList) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      return;
    }
    const snap: ProspectingSnapshot = {
      savedAt: Date.now(),
      params: { city, state, industry, count },
      leads,
      added: [...added],
      skipped: [...skipped],
      failures: [...failures.entries()],
      cancelledRemaining: cancelledRemaining ? [...cancelledRemaining] : null,
      duplicateStrategy,
    };
    try { localStorage.setItem(storageKey, JSON.stringify(snap)); } catch { /* ignore quota */ }
  }, [storageKey, restorable, hasUnsavedList, leads, added, skipped, failures, cancelledRemaining, duplicateStrategy, city, state, industry, count]);

  const restorableRemaining = restorable
    ? restorable.leads.filter((_, i) => !restorable.added.includes(i)).length
    : 0;

  const handleRestore = () => {
    const snap = restorable;
    if (!snap) return;
    setCity(snap.params.city);
    setState(snap.params.state);
    setIndustry(snap.params.industry);
    setCount(snap.params.count);
    setLeads(snap.leads);
    setAdded(new Set(snap.added));
    setSkipped(new Set(snap.skipped));
    setFailures(new Map(snap.failures));
    setCancelledRemaining(snap.cancelledRemaining && snap.cancelledRemaining.length ? new Set(snap.cancelledRemaining) : null);
    setDuplicateStrategy(snap.duplicateStrategy);
    setRestorable(null);
  };

  const handleStartFresh = () => {
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    setRestorable(null);
  };

  // Warn before leaving the page while a partly-added prospect list (or a
  // cancelled "Add all" highlight) would be lost. Covers browser refresh/close
  // (beforeunload) and in-app wouter navigation (link click interception).
  useEffect(() => {
    if (!hasUnsavedList) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNavHref(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", handleClickCapture, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClickCapture, true);
    };
  }, [hasUnsavedList]);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const confirmLeave = () => {
    const target = pendingNavHref;
    setPendingNavHref(null);
    if (!target) return;
    const path = basePath && target.startsWith(basePath) ? target.slice(basePath.length) || "/" : target;
    setLocation(path);
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prospect Search</h2>
          <p className="text-muted-foreground mt-1">
            Generate a targeted list of commercial prospects in any market. Add them directly to your pipeline.
          </p>
        </div>

        {restorable && (
          <Card className="border-amber-300 bg-amber-50/60">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900">Pick up where you left off</p>
                  <p className="text-amber-800/90">
                    You have an unfinished list of {restorable.leads.length} prospect{restorable.leads.length === 1 ? "" : "s"}
                    {restorable.params.city && restorable.params.state
                      ? ` in ${restorable.params.city}, ${restorable.params.state}`
                      : ""}
                    {restorable.params.industry ? ` — ${restorable.params.industry}` : ""}
                    {restorableRemaining > 0 ? ` (${restorableRemaining} not yet added).` : "."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={handleStartFresh}>
                  Start fresh
                </Button>
                <Button size="sm" onClick={handleRestore}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Restore list
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  placeholder="e.g. Chicago"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Count</Label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["5","10","15","20"].map((n) => (
                      <SelectItem key={n} value={n}>{n} prospects</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Button onClick={handleSearch} disabled={searchMutation.isPending} className="min-w-[140px]">
                {searchMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Search className="mr-2 h-4 w-4" /> Generate Leads</>
                )}
              </Button>
              {leads.length > 0 && !allAdded && (
                <Button variant="outline" onClick={handleAddAll} disabled={createProspect.isPending || addAllProgress !== null}>
                  {addAllProgress !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  {addAllProgress !== null
                    ? `Adding ${addAllProgress.done} of ${addAllProgress.total}...`
                    : hasRemaining
                      ? `Add Remaining (${cancelledRemaining!.size})`
                      : "Add All to Pipeline"}
                </Button>
              )}
              {addAllProgress !== null && (
                <>
                  <div className="h-2 w-40 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={addAllProgress.total} aria-valuenow={addAllProgress.done}>
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${addAllProgress.total ? Math.round((addAllProgress.done / addAllProgress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground" aria-live="polite">
                    {addAllProgress.added} added
                    {duplicateStrategy === "update"
                      ? `, ${addAllProgress.updated} updated`
                      : `, ${addAllProgress.skipped} skipped`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { cancelAddAllRef.current = true; }}
                    disabled={cancelAddAllRef.current}
                  >
                    <X className="mr-1 h-4 w-4" /> {cancelAddAllRef.current ? "Cancelling..." : "Cancel"}
                  </Button>
                </>
              )}
              {leads.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {added.size} of {leads.length} added
                </span>
              )}
              {hasRemaining && addAllProgress === null && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {cancelledRemaining!.size} still need adding
                </span>
              )}
            </div>
            {leads.length > 0 && !allAdded && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">If a prospect already exists in your pipeline</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="add-all-duplicate-strategy"
                      className="mt-0.5"
                      checked={duplicateStrategy === "skip"}
                      onChange={() => setDuplicateStrategy("skip")}
                      disabled={addAllProgress !== null}
                    />
                    <span className="text-sm">
                      Skip duplicates
                      <span className="block text-xs text-muted-foreground">Leave existing prospects unchanged</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="add-all-duplicate-strategy"
                      className="mt-0.5"
                      checked={duplicateStrategy === "update"}
                      onChange={() => setDuplicateStrategy("update")}
                      disabled={addAllProgress !== null}
                    />
                    <span className="text-sm">
                      Update existing
                      <span className="block text-xs text-muted-foreground">Refresh existing prospects with the latest data</span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {searchMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground text-sm">Generating prospects for {industry} companies in {city}, {state}...</p>
          </div>
        )}

        {!searchMutation.isPending && leads.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {leads.length} prospects found in {city}, {state} — {industry}
              </p>
            </div>
            <div className="grid gap-4">
              {leads.map((lead, idx) => (
                <Card key={idx} className={added.has(idx) ? "opacity-60" : failures.has(idx) ? "border-red-300" : skipped.has(idx) ? "border-blue-300 bg-blue-50/40" : cancelledRemaining?.has(idx) ? "border-amber-300 bg-amber-50/40" : ""}>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          <h3 className="font-semibold text-base">{lead.companyName}</h3>
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${CONFIDENCE_COLORS[lead.confidence]}`}
                          >
                            {lead.confidence} fit
                          </Badge>
                          {skipped.has(idx) && !added.has(idx) && (
                            <Badge variant="outline" className="text-xs font-medium bg-blue-100 text-blue-800 border-blue-200">
                              Already in pipeline
                            </Badge>
                          )}
                          {cancelledRemaining?.has(idx) && !added.has(idx) && !skipped.has(idx) && (
                            <Badge variant="outline" className="text-xs font-medium bg-amber-100 text-amber-800 border-amber-200">
                              Not yet added
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 text-sm mb-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium text-foreground">{lead.contactName}</span>
                            <span>·</span>
                            <span>{lead.contactTitle}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span>{lead.phone}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span>{lead.city}, {lead.state}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="h-3.5 w-3.5 shrink-0" />
                            <span>{lead.estimatedEmployees} employees</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <SquareStack className="h-3.5 w-3.5 shrink-0" />
                            <span>{lead.estimatedSquareFootage.toLocaleString()} sq ft</span>
                          </div>
                        </div>

                        <Separator className="my-2.5" />
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Why target: </span>
                          {lead.whyTarget}
                        </p>
                        {failures.has(idx) && !added.has(idx) && (
                          <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700">
                              <span className="font-medium">Couldn't add: </span>
                              {failures.get(idx)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0">
                        {added.has(idx) ? (
                          <Button size="sm" variant="outline" disabled className="gap-1.5 text-green-700 border-green-300">
                            <Check className="h-4 w-4" /> Added
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAdd(lead, idx)}
                            disabled={addingId === idx}
                          >
                            {addingId === idx ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : failures.has(idx) ? (
                              <><RefreshCw className="mr-1.5 h-4 w-4" /> Retry</>
                            ) : (
                              <><UserPlus className="mr-1.5 h-4 w-4" /> Add</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!searchMutation.isPending && leads.length === 0 && !searchMutation.isIdle && (
          <div className="text-center py-16 text-muted-foreground text-sm">No results returned. Try different parameters.</div>
        )}
      </div>

      <AlertDialog open={confirmSearchOpen} onOpenChange={setConfirmSearchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard the current list?</AlertDialogTitle>
            <AlertDialogDescription>
              You still have {leads.length - added.size} prospect{leads.length - added.size === 1 ? "" : "s"} that
              {leads.length - added.size === 1 ? " hasn't" : " haven't"} been added to your pipeline. Starting a new
              search will clear this list and you'll lose your place. Add the remaining prospects first if you want to
              keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current list</AlertDialogCancel>
            <AlertDialogAction onClick={runSearch}>Discard and search</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingNavHref !== null} onOpenChange={(open) => { if (!open) setPendingNavHref(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without adding these prospects?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasRemaining && !hasUnaddedLeads
                ? `${cancelledRemaining!.size} prospect${cancelledRemaining!.size === 1 ? "" : "s"} still ${cancelledRemaining!.size === 1 ? "needs" : "need"} adding.`
                : `You still have ${leads.length - added.size} prospect${leads.length - added.size === 1 ? "" : "s"} that ${leads.length - added.size === 1 ? "hasn't" : "haven't"} been added to your pipeline.`}
              {" "}Leaving this page will clear the list and you'll lose your place. Add the remaining prospects first if you want to keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on this page</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>Leave anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

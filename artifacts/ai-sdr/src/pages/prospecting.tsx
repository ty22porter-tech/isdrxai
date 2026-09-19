import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProspectSearch, useCreateProspect, useBulkCreateProspects, useEnrichLeads, useRefreshOpportunityIntelligence, refreshOpportunityIntelligence, getListProspectsQueryKey, getListProspectsQueryOptions } from "@workspace/api-client-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OpportunityIntelligenceView, sanitizeOpportunityLanguage } from "@/components/opportunity-intelligence-view";
import { useToast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import { addToAutopilotProspectSelection, clearAutopilotProspectSelection } from "@/lib/autopilot-prospect-selection";
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

// IT Services vertical uses its own industry list, employee-range filter, and
// compliance-priority filter. Janitorial keeps the original list above.
const IT_INDUSTRIES = [
  "All Industries",
  "Commercial",
  "Healthcare",
  "Retail",
  "Financial Services",
  "Insurance",
  "Manufacturing",
  "Construction",
  "Logistics",
  "Nonprofit",
  "Hospitality",
  "Real Estate",
];

const IT_EMPLOYEE_RANGES = [
  "5-2,000 (default)",
  "5-10",
  "11-25",
  "26-50",
  "51-100",
  "101-250",
  "251-500",
  "501-1,000",
  "1,001-2,000",
];

const IT_COMPLIANCE_PRIORITIES = [
  "All Prospects",
  "High Compliance Need",
  "Healthcare Compliance",
  "Financial Compliance",
  "Government Contractor Compliance",
  "Retail and Payment Security",
  "Data Privacy Requirements",
];

const FLEET_INDUSTRIES = [
  "All Industries",
  "Home Services",
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Landscaping",
  "Pest Control",
  "Car Dealerships",
  "Construction",
  "Delivery & Logistics",
  "Municipal",
  "Higher Education",
  "Commercial",
];

const SCORE_COLORS: Record<string, string> = {
  "High Priority": "bg-green-100 text-green-800 border-green-200",
  "Strong Fit": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Possible Fit": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Low Priority": "bg-gray-100 text-gray-600 border-gray-200",
};

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

// Per-lead contact-enrichment status, shown on the results page. "pending"
// while the Apollo lookup is in flight; "not_found" is surfaced explicitly so
// the user knows the email is still a placeholder.
type EnrichStatus = "pending" | "enriched" | "not_found" | "failed";

// Persisted snapshot of an in-progress prospect list so it survives leaving the
// page, refresh, or tab close. Sets/Maps are stored as arrays for JSON.
type ProspectingSnapshot = {
  savedAt: number;
  vertical?: string;
  params: { city: string; state: string; industry: string; count: string; employeeRange?: string; compliancePriority?: string };
  leads: ProspectLead[];
  added: number[];
  skipped: number[];
  failures: [number, string][];
  cancelledRemaining: number[] | null;
  duplicateStrategy: "skip" | "update";
  enrichment?: [number, EnrichStatus][];
  enrichmentErrors?: [number, string][];
  researchWarnings?: [number, string][];
  addedProspectIds?: [number, number][];
};

const storageKeyForUser = (userId: string) => `prospecting:inprogress:${userId}`;

/** Prospecting needs the seller identity, never a seller website. */
export function hasSellerProfileForProspecting(profile?: { businessName?: string | null; vertical?: string | null } | null): boolean {
  return Boolean(profile?.businessName?.trim() && profile?.vertical);
}

// Saved lists reference market data that goes stale over time. Snapshots older
// than this are auto-discarded on hydration rather than offered for restore.
const SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// Human-friendly "saved 3 days ago" style label from a timestamp.
const formatSavedAgo = (savedAt: number): string => {
  const diff = Date.now() - savedAt;
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Enrichment result shape returned per lead from /ai/enrich-leads.
type EnrichLeadResult = {
  index: number;
  status: EnrichStatus;
  contactName?: string;
  email?: string;
  title?: string;
  phone?: string;
  employeeCount?: number;
  opportunityIntelligence?: ProspectLead["opportunityIntelligence"];
  error?: string;
  researchWarning?: string;
};

// Apply Apollo enrichment results to the current lead list. `snapshot` is the
// exact lead list that was sent for enrichment; a lead is only updated when
// the lead at the same position in `current` is verifiably the same business
// (company name + email). This means results from a stale enrichment run
// (e.g. search A finishing after search B replaced the list) can never write
// the wrong contact onto a different business. Exported for tests.
export function applyEnrichmentResults(
  current: ProspectLead[],
  snapshot: ProspectLead[],
  results: EnrichLeadResult[],
): ProspectLead[] {
  return current.map((lead, i) => {
    const r = results.find((x) => x.index === i);
    if (!r || r.status === "failed") return lead;
    if (r.status === "not_found" && !r.employeeCount && !r.opportunityIntelligence) return lead;
    const snap = snapshot[i];
    // Identity check: the lead we enriched must still be the lead at this slot.
    if (!snap || snap.companyName !== lead.companyName || snap.email !== lead.email) return lead;

    const leadVersion = (lead as any)._intelligenceVersion || 0;
    const snapVersion = (snap as any)._intelligenceVersion || 0;
    const isNewerIntelligence = leadVersion > snapVersion;
    const useEnrichIntel = !isNewerIntelligence && r.opportunityIntelligence !== undefined;

    return {
      ...lead,
      contactName: r.status === "enriched" ? r.contactName ?? lead.contactName : lead.contactName,
      contactTitle: r.status === "enriched" ? r.title ?? "Decision maker" : lead.contactTitle,
      email: r.status === "enriched" ? r.email ?? lead.email : lead.email,
      phone: r.status === "enriched" ? r.phone || lead.phone : lead.phone,
      estimatedEmployees: r.employeeCount ?? lead.estimatedEmployees,
      opportunityIntelligence: useEnrichIntel ? r.opportunityIntelligence : lead.opportunityIntelligence,
      opportunityScore: useEnrichIntel && r.opportunityIntelligence?.score != null ? r.opportunityIntelligence.score : lead.opportunityScore,
      scoreLabel: useEnrichIntel && r.opportunityIntelligence?.label ? r.opportunityIntelligence.label : lead.scoreLabel,
      whyTarget: useEnrichIntel && r.opportunityIntelligence?.whyTarget ? r.opportunityIntelligence.whyTarget : lead.whyTarget,
      potentialNeeds: useEnrichIntel && r.opportunityIntelligence?.potentialNeeds ? r.opportunityIntelligence.potentialNeeds : lead.potentialNeeds,
      recommendedOutreach: useEnrichIntel && r.opportunityIntelligence?.recommendedOutreach ? r.opportunityIntelligence.recommendedOutreach : lead.recommendedOutreach,
    };
  });
}

export default function Prospecting() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [industry, setIndustry] = useState("");
  const [count, setCount] = useState("10");
  const [employeeRange, setEmployeeRange] = useState(IT_EMPLOYEE_RANGES[0]);
  const [compliancePriority, setCompliancePriority] = useState("All Prospects");
  const [leads, setLeads] = useState<ProspectLead[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [failures, setFailures] = useState<Map<number, string>>(new Map());
  const [addingId, setAddingId] = useState<number | null>(null);
  const [addAllProgress, setAddAllProgress] = useState<{ done: number; total: number; added: number; updated: number; skipped: number } | null>(null);
  const [cancelledRemaining, setCancelledRemaining] = useState<Set<number> | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update">("skip");
  const [enrichment, setEnrichment] = useState<Map<number, EnrichStatus>>(new Map());
  const [enrichmentErrors, setEnrichmentErrors] = useState<Map<number, string>>(new Map());
  const [researchWarnings, setResearchWarnings] = useState<Map<number, string>>(new Map());
  const [addedProspectIds, setAddedProspectIds] = useState<Map<number, number>>(new Map());
  const [refreshing, setRefreshing] = useState<Set<number>>(new Set());
  const [confirmSearchOpen, setConfirmSearchOpen] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<ProspectingSnapshot | null>(null);
  const [lastSearchedParams, setLastSearchedParams] = useState<ProspectingSnapshot["params"] | null>(null);
  const cancelAddAllRef = useRef(false);
  const hydratedRef = useRef(false);
  // True from the moment hydration finds a restorable snapshot until the user
  // decides (restore / start fresh / new search). The `restorable` state alone
  // isn't enough to guard the save effect: on the mount that hydrates, both
  // effects run in the same commit, so the save effect still sees
  // restorable === null and would delete the snapshot before the banner even
  // renders. A ref is updated synchronously, closing that gap.
  const restorePendingRef = useRef(false);

  const { user } = useUser();
  const storageKey = user?.id ? storageKeyForUser(user.id) : null;

  // The active vertical drives which filters, terminology, and result fields
  // are shown. IT Services and Janitorial prospect lists never mix.
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/users/me`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });
  const verticalLoaded = me !== undefined;
  const isIT = me?.vertical === "it_services";
  const isFleet = me?.vertical === "fleet_wraps";
  const vertical = isIT ? "it_services" : isFleet ? "fleet_wraps" : "janitorial";
  const verticalLabel = isIT ? "IT Services" : isFleet ? "Fleet & Commercial Vehicle Wraps" : "Janitorial";
  const industryOptions = isIT ? IT_INDUSTRIES : isFleet ? FLEET_INDUSTRIES : INDUSTRIES;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchMutation = useProspectSearch();
  const createProspect = useCreateProspect();
  const bulkCreateProspects = useBulkCreateProspects();
  const enrichLeadsMutation = useEnrichLeads();
  const refreshIntelligenceMutation = useRefreshOpportunityIntelligence({
    mutation: {
      mutationFn: ({ data }) => refreshOpportunityIntelligence(data, {
        signal: AbortSignal.timeout(100_000),
      }),
    },
  });
  // Monotonically increasing enrichment run ID. Callbacks from a run that is
  // no longer current (a newer search or enrichment started) are ignored, so
  // a slow Apollo response for search A can never touch search B's results.
  const enrichRunRef = useRef(0);
  const searchRunIdRef = useRef(0);

  // Automatically look up the real decision-maker (name + email) for each
  // fresh search result via Apollo, replacing the "Owner" / contact@….invalid
  // placeholders before the user adds anything to the pipeline. Leads where no
  // contact is found are flagged explicitly rather than left looking real.
  const runEnrichment = (searchLeads: ProspectLead[]) => {
    if (!searchLeads.length) return;
    const runId = ++enrichRunRef.current;
    setEnrichment(new Map(searchLeads.map((_, i) => [i, "pending" as EnrichStatus])));
    setEnrichmentErrors(new Map());
    setResearchWarnings(new Map());
    enrichLeadsMutation.mutate(
      {
        data: {
          leads: searchLeads.map((l) => ({
            companyName: l.companyName,
            contactName: l.contactName,
            email: l.email,
            website: l.website,
            industry: l.industry,
            city: l.city,
            state: l.state,
            address: l.address,
            phone: l.phone,
          })),
        },
      },
      {
        onSuccess: (result) => {
          if (enrichRunRef.current !== runId) return; // stale run — a newer search replaced the list
          const statusMap = new Map<number, EnrichStatus>(
            searchLeads.map((_, i) => [i, "failed" as EnrichStatus])
          );
          result.results.forEach((r) => statusMap.set(r.index, r.status));
          setEnrichmentErrors(new Map(result.results.filter((r) => r.error).map((r) => [r.index, r.error!])));
          setResearchWarnings(new Map(result.results.filter((r) => r.researchWarning).map((r) => [r.index, r.researchWarning!])));
          setLeads((prev) => applyEnrichmentResults(prev, searchLeads, result.results));
          setEnrichment(statusMap);
          if (result.planBlocked) {
            toast({
              title: "Contact lookup unavailable",
              description: result.error || "Apollo denied access to contact enrichment. Check the API key's endpoint permissions and account API access.",
              variant: "destructive",
            });
          }
        },
        onError: (err: any) => {
          if (enrichRunRef.current !== runId) return; // stale run
          const reason = err?.data?.error || err?.message || "Contact lookup request failed. Try again.";
          setEnrichment((prev) => new Map([...prev].map(([i, s]) => [i, s === "pending" ? ("failed" as EnrichStatus) : s])));
          setEnrichmentErrors(new Map(searchLeads.map((_, i) => [i, reason])));
          toast({
            title: "Contact lookup failed",
            description: reason,
            variant: "destructive",
          });
        },
      }
    );
  };

  const runSearch = (overrideParams?: ProspectingSnapshot["params"]) => {
    if (!hasSellerProfileForProspecting(me)) {
      toast({
        title: "Seller profile required",
        description: "Add your seller company name and choose your seller industry in Settings before researching prospects.",
        variant: "destructive",
      });
      return;
    }
    const searchCity = overrideParams?.city ?? city;
    const searchState = overrideParams?.state ?? state;
    const searchIndustry = overrideParams?.industry ?? industry;
    const searchCount = overrideParams?.count ?? count;
    const searchEmployeeRange = overrideParams?.employeeRange ?? employeeRange;
    const searchCompliancePriority = overrideParams?.compliancePriority ?? compliancePriority;

    // If called with override params, sync the form fields so the user sees what
    // was searched after the results arrive.
    if (overrideParams) {
      setCity(searchCity);
      setState(searchState);
      setIndustry(searchIndustry);
      setCount(searchCount);
      if (overrideParams.employeeRange) setEmployeeRange(overrideParams.employeeRange);
      if (overrideParams.compliancePriority) setCompliancePriority(overrideParams.compliancePriority);
    }

    const currentParams = {
      city: searchCity,
      state: searchState,
      industry: searchIndustry,
      count: searchCount,
      employeeRange: searchEmployeeRange,
      compliancePriority: searchCompliancePriority,
    };
    setLastSearchedParams(currentParams);

    restorePendingRef.current = false;
    if (user?.id) clearAutopilotProspectSelection(user.id);
    setRestorable(null);
    setLeads([]);
    setAdded(new Set());
    setAddedProspectIds(new Map());
    setSkipped(new Set());
    setFailures(new Map());
    setCancelledRemaining(null);
    setRefreshing(new Set());
    // Invalidate any in-flight enrichment run from the previous list so its
    // late response can't overwrite the new search's leads.
    enrichRunRef.current++;
    searchRunIdRef.current++;
    setEnrichment(new Map());
    setEnrichmentErrors(new Map());
    setResearchWarnings(new Map());
    searchMutation.mutate(
      {
        data: {
          city: searchCity.trim(),
          state: searchState,
          industry: searchIndustry,
          count: parseInt(searchCount),
          ...(isIT
            ? {
                employeeRange: searchEmployeeRange === IT_EMPLOYEE_RANGES[0] ? undefined : searchEmployeeRange,
                compliancePriority: searchCompliancePriority === "All Prospects" ? undefined : searchCompliancePriority,
              }
            : {}),
        },
      },
      {
        onSuccess: (data) => {
          setLeads(data);
          runEnrichment(data);
          trackEvent("prospect_search_completed", {
            vertical,
            requested_count: parseInt(searchCount),
            result_count: data.length,
          });
        },
        onError: (err: any) =>
          toast({
            title: "Search failed",
            description: err?.data?.error || err?.message || "Could not search for businesses.",
            variant: "destructive",
          }),
      }
    );
  };

  const handleRefreshLead = async (lead: ProspectLead, index: number) => {
    setRefreshing((prev) => new Set([...prev, index]));
    const selectedIndustry = lead.opportunityIntelligence?.itResearch?.selectedIndustry || lastSearchedParams?.industry || industry;
    const runId = searchRunIdRef.current;
    const prospectId = addedProspectIds.get(index);
    try {
      const data = await refreshIntelligenceMutation.mutateAsync({
        data: {
          ...(prospectId ? { prospectId } : {
            lead: {
              companyName: lead.companyName,
              website: lead.website,
              industry: lead.industry,
              location: lead.city && lead.state ? `${lead.city}, ${lead.state}` : lead.city || lead.state || undefined,
              employeeCount: lead.estimatedEmployees,
              contactName: lead.contactName,
              contactTitle: lead.contactTitle,
            }
          }),
          selectedIndustry,
        }
      });
      if (searchRunIdRef.current !== runId) return;
      setLeads((prev) => {
        // Guard: ensure the lead at this index is still the same business
        const current = prev[index];
        if (!current || current.companyName !== lead.companyName) return prev;
        const intel = data.opportunityIntelligence;
        const next = [...prev];
        next[index] = {
          ...current,
          opportunityIntelligence: intel,
          opportunityScore: intel?.score ?? current.opportunityScore,
          scoreLabel: intel?.label ?? current.scoreLabel,
          whyTarget: intel?.whyTarget ?? current.whyTarget,
          potentialNeeds: intel?.potentialNeeds ?? current.potentialNeeds,
          recommendedOutreach: intel?.recommendedOutreach ?? current.recommendedOutreach,
          _intelligenceVersion: ((current as any)._intelligenceVersion || 0) + 1,
        } as ProspectLead;
        return next;
      });
      toast({ title: "Intelligence Refreshed for " + lead.companyName });
    } catch (err: any) {
      if (searchRunIdRef.current !== runId) return;
      toast({ title: "Failed to refresh intelligence", description: err?.data?.error || err?.message || "Could not refresh.", variant: "destructive" });
    } finally {
      if (searchRunIdRef.current === runId) {
        setRefreshing((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    }
  };

  const handleSearch = () => {
    if (!city.trim() || !state || !industry) {
      toast({ title: "Fill in all fields", description: "City, state, and industry are required.", variant: "destructive" });
      return;
    }
    const hasUnaddedLeads =
      leads.length > 0 &&
      leads.some((_, idx) => !added.has(idx) && !(skipped.has(idx) && !failures.has(idx)));
    if ((hasUnaddedLeads || (cancelledRemaining?.size ?? 0) > 0) && addAllProgress === null) {
      setConfirmSearchOpen(true);
      return;
    }
    runSearch();
  };

  // Rich vertical-specific research stays attached when the lead enters the pipeline.
  const leadNotes = (lead: ProspectLead) => {
    let notes = `${lead.contactTitle} — ${lead.whyTarget}`;
    if (lead.opportunityScore != null) {
      const scoreName = lead.vertical === "fleet_wraps" ? "Fleet Wrap Opportunity Score" : "IT Opportunity Score";
      notes += `\n${scoreName}: ${lead.opportunityScore}${lead.scoreLabel ? ` (${lead.scoreLabel})` : ""}`;
      if (lead.potentialNeeds?.length) notes += `\nPotential opportunities (unconfirmed): ${lead.potentialNeeds.join(", ")}`;
      if (lead.complianceConsideration) notes += `\nCompliance: ${lead.complianceConsideration}`;
      if (lead.fleetBrandingSignal) notes += `\nFleet / Branding Signal: ${lead.fleetBrandingSignal}`;
      if (lead.recommendedOutreach) notes += `\nRecommended outreach: ${lead.recommendedOutreach}`;
    }
    return notes;
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
          address: lead.address,
          notes: leadNotes(lead),
          opportunityIntelligence: lead.opportunityIntelligence,
          employeeCount: lead.estimatedEmployees,
          squareFootage: lead.estimatedSquareFootage,
          title: /pending/i.test(lead.contactTitle) ? undefined : lead.contactTitle,
        },
      },
      {
        onSuccess: (prospect) => {
          if (user?.id && prospect?.id) {
            addToAutopilotProspectSelection(user.id, [prospect.id]);
          }
          if (prospect?.id) {
            setAddedProspectIds((prev) => new Map(prev).set(idx, prospect.id));
          }
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
                address: lead.address,
                notes: leadNotes(lead),
                opportunityIntelligence: lead.opportunityIntelligence,
                employeeCount: lead.estimatedEmployees,
                squareFootage: lead.estimatedSquareFootage,
                title: /pending/i.test(lead.contactTitle) ? undefined : lead.contactTitle,
              })),
            },
          });
          anyRequestSucceeded = true;
          if (user?.id) {
            addToAutopilotProspectSelection(
              user.id,
              result.results
                .filter((r) => r.success && r.prospect?.id)
                .map((r) => r.prospect!.id),
            );
          }
          totalAdded += result.added;
          totalUpdated += result.updated ?? 0;
          if (duplicateStrategy === "skip") {
            const skippedInChunk = result.results.filter((r) => !r.success && isDuplicateError(r.error)).length;
            totalSkipped += skippedInChunk;
            totalFailed += result.failed - skippedInChunk;
          } else {
            totalFailed += result.failed;
          }
          setAddedProspectIds((prev) => {
            const next = new Map(prev);
            result.results.forEach((r) => {
              if (r.success && r.prospect?.id) {
                next.set(chunk[r.index].idx, r.prospect.id);
              }
            });
            return next;
          });
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
  // Leads known to already exist in the pipeline but not added from this list.
  // Kept separate from `added` so the "N of M added" summary never double-counts.
  const skippedNotAdded = [...skipped].filter((idx) => !added.has(idx)).length;
  const hasRemaining = (cancelledRemaining?.size ?? 0) > 0;
  // A lead is "handled" when it is added OR it is skipped (already in pipeline)
  // without a real failure. Skipped leads with a recorded failure still need
  // the user's attention, so they continue to count as unadded.
  const hasUnaddedLeads =
    leads.length > 0 &&
    leads.some((_, idx) => !added.has(idx) && !(skipped.has(idx) && !failures.has(idx)));
  const hasUnsavedList = hasUnaddedLeads || hasRemaining;

  // Restore any in-progress list saved from a previous visit (per client). We
  // don't auto-populate the page — instead we surface a restore / start-fresh
  // affordance so the user stays in control of a possibly stale list.
  useEffect(() => {
    // Wait until the vertical is known so a snapshot saved under the other
    // vertical is discarded, never restored (vertical isolation requirement).
    if (!storageKey || !verticalLoaded || hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const snap = JSON.parse(raw) as ProspectingSnapshot;
      const addedSet = new Set(snap?.added ?? []);
      const skippedSet = new Set(snap?.skipped ?? []);
      const failureSet = new Set((snap?.failures ?? []).map(([idx]) => idx));
      // A lead is "handled" if it is added OR it is skipped without a real failure.
      // A snapshot is restorable only when at least one lead still needs attention,
      // or a cancelled-remaining highlight is present.
      const stillUnadded =
        (snap?.leads?.length ?? 0) > 0 &&
        (snap.leads.some(
          (_, i) => !addedSet.has(i) && !(skippedSet.has(i) && !failureSet.has(i)),
        ) || (snap.cancelledRemaining?.length ?? 0) > 0);
      const tooOld =
        typeof snap?.savedAt === "number" && Date.now() - snap.savedAt > SNAPSHOT_MAX_AGE_MS;
      const wrongVertical = (snap?.vertical ?? "janitorial") !== vertical;
      const outdatedScoring = snap?.leads?.some(
        lead => lead.opportunityIntelligence && lead.opportunityIntelligence.version !== 3,
      );
      if (stillUnadded && !tooOld && !wrongVertical && !outdatedScoring) {
        restorePendingRef.current = true;
        setRestorable(snap);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Corrupt/unreadable snapshot — clear it so we start clean next time.
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
  }, [storageKey, verticalLoaded, vertical]);

  // Persist the in-progress list whenever it changes, so leaving the page (in-app
  // nav, refresh, or tab close) doesn't lose it. We hold off while a restore
  // decision is pending so we don't overwrite the saved snapshot first.
  useEffect(() => {
    if (!hydratedRef.current || !storageKey || restorable || restorePendingRef.current) return;
    if (!hasUnsavedList) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      return;
    }
    const snap: ProspectingSnapshot = {
      savedAt: Date.now(),
      vertical,
      params: lastSearchedParams || { city, state, industry, count, employeeRange, compliancePriority },
      leads,
      added: [...added],
      skipped: [...skipped],
      failures: [...failures.entries()],
      cancelledRemaining: cancelledRemaining ? [...cancelledRemaining] : null,
      duplicateStrategy,
      // "pending" never survives a page leave — the in-flight lookup is gone,
      // so it's saved as "failed" (lookup can be retried by searching again).
      enrichment: [...enrichment.entries()].map(([i, s]) => [i, s === "pending" ? "failed" : s] as [number, EnrichStatus]),
      enrichmentErrors: [...enrichmentErrors.entries()],
      researchWarnings: [...researchWarnings.entries()],
      addedProspectIds: [...addedProspectIds.entries()],
    };
    try { localStorage.setItem(storageKey, JSON.stringify(snap)); } catch { /* ignore quota */ }
  }, [storageKey, restorable, hasUnsavedList, leads, added, skipped, failures, cancelledRemaining, duplicateStrategy, enrichment, enrichmentErrors, researchWarnings, addedProspectIds, lastSearchedParams, city, state, industry, count, employeeRange, compliancePriority, vertical]);

  const restorableRemaining = restorable
    ? restorable.leads.filter((_, i) => !restorable.added.includes(i)).length
    : 0;

  // After restoring a saved list, check the current pipeline for prospects that
  // were added elsewhere (another page, another device) since the snapshot was
  // saved. Matching mirrors the server's duplicate check: email, trimmed and
  // lowercased. Matches are marked "Already in pipeline" (skipped) — never
  // "added" — so the "N of M added" summary only counts adds made from this
  // list. If the pipeline fetch fails we leave the restored state as-is; the
  // server-side duplicate handling still catches any re-add attempts.
  const reconcileWithPipeline = async (snapLeads: ProspectLead[], snapAdded: Set<number>) => {
    let prospects: { email: string }[];
    try {
      prospects = await queryClient.fetchQuery(getListProspectsQueryOptions());
    } catch {
      return;
    }
    const pipelineEmails = new Set(prospects.map((p) => p.email.trim().toLowerCase()));
    const inPipeline = snapLeads
      .map((lead, idx) => ({ lead, idx }))
      .filter(({ lead, idx }) => !snapAdded.has(idx) && pipelineEmails.has(lead.email.trim().toLowerCase()))
      .map(({ idx }) => idx);
    if (!inPipeline.length) return;
    setSkipped((prev) => new Set([...prev, ...inPipeline]));
    setFailures((prev) => {
      if (!inPipeline.some((idx) => prev.has(idx))) return prev;
      const next = new Map(prev);
      inPipeline.forEach((idx) => next.delete(idx));
      return next;
    });
    setCancelledRemaining((prev) => {
      if (!prev || !inPipeline.some((idx) => prev.has(idx))) return prev;
      const next = new Set(prev);
      inPipeline.forEach((idx) => next.delete(idx));
      return next.size > 0 ? next : null;
    });
  };

  const handleRestore = () => {
    const snap = restorable;
    if (!snap) return;
    searchRunIdRef.current++;
    restorePendingRef.current = false;
    setCity(snap.params.city);
    setState(snap.params.state);
    setIndustry(snap.params.industry);
    setCount(snap.params.count);
    if (snap.params.employeeRange) setEmployeeRange(snap.params.employeeRange);
    if (snap.params.compliancePriority) setCompliancePriority(snap.params.compliancePriority);
    setLastSearchedParams(snap.params);
    setLeads(snap.leads);
    const addedSet = new Set(snap.added);
    setAdded(addedSet);
    setAddedProspectIds(new Map(snap.addedProspectIds ?? []));
    setSkipped(new Set(snap.skipped));
    setFailures(new Map(snap.failures));
    setCancelledRemaining(snap.cancelledRemaining && snap.cancelledRemaining.length ? new Set(snap.cancelledRemaining) : null);
    setDuplicateStrategy(snap.duplicateStrategy);
    setEnrichment(new Map(snap.enrichment ?? []));
    setEnrichmentErrors(new Map(snap.enrichmentErrors ?? []));
    setResearchWarnings(new Map(snap.researchWarnings ?? []));
    setRestorable(null);
    void reconcileWithPipeline(snap.leads, addedSet);
  };

  const handleStartFresh = () => {
    restorePendingRef.current = false;
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    setRestorable(null);
  };

  // Re-run a fresh prospect search using the saved snapshot's params, discarding
  // the stale stored leads. The form fields are updated to match the re-run so
  // the user can see (and adjust) exactly what was searched.
  const handleSearchAgain = () => {
    const snap = restorable;
    if (!snap) return;
    if (storageKey) {
      try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    runSearch(snap.params);
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
            {isIT
              ? "Generate a targeted list of IT services prospects — companies likely to need managed IT, cybersecurity, and compliance support. Add them directly to your pipeline."
              : "Generate a targeted list of commercial prospects in any market. Add them directly to your pipeline."}
          </p>
          <p className="mt-2 text-xs font-medium text-primary" data-testid="text-seller-vertical">
            Seller vertical: {verticalLabel}. Prospect Industry below is the market you want to search.
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
                  {typeof restorable.savedAt === "number" && (
                    <p className="mt-0.5 text-xs text-amber-700/80">
                      Saved {formatSavedAgo(restorable.savedAt)} — market data may have changed since.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleStartFresh}>
                  Start fresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleSearchAgain}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Search again
                </Button>
                <Button size="sm" onClick={handleRestore}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Restore list
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

         {verticalLoaded && !hasSellerProfileForProspecting(me) && (
          <Card className="border-amber-500/40 bg-amber-500/10" data-testid="notice-seller-profile-required">
            <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold">Complete your seller profile before generating prospects</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add your seller company name and choose Your Industry in Settings. Your seller industry controls seller-side matching; the Prospect Industry below describes the businesses you want to find.
                  </p>
                </div>
              </div>
              <Button type="button" size="sm" onClick={() => setLocation("/settings")} data-testid="button-open-company-settings">
                Open Settings
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search Parameters</CardTitle>
            <p className="text-xs text-muted-foreground">Seller vertical: {verticalLabel} · select a separate Prospect Industry to describe your target businesses.</p>
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
                <Label>Prospect Industry</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {industryOptions.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">This is the selected prospect market, not your seller industry.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prospect-search-count">Count</Label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger id="prospect-search-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["5","10","15","20","25","50","75","100"].map((n) => (
                      <SelectItem key={n} value={n}>{n} prospects</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Up to 100 matching prospects. Larger searches take longer to research.</p>
              </div>
              {isIT && (
                <>
                  <div className="space-y-2">
                    <Label>Employee Count</Label>
                    <Select value={employeeRange} onValueChange={setEmployeeRange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IT_EMPLOYEE_RANGES.map((r) => (
                          <SelectItem key={r} value={r}>{r === IT_EMPLOYEE_RANGES[0] ? r : `${r} employees`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2 md:col-span-2">
                    <Label>Cybersecurity &amp; Compliance Priority</Label>
                    <Select value={compliancePriority} onValueChange={setCompliancePriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IT_COMPLIANCE_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending || !verticalLoaded || !hasSellerProfileForProspecting(me)}
                className="min-w-[140px]"
                data-testid="button-generate-leads"
              >
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
                  {skippedNotAdded > 0 ? ` · ${skippedNotAdded} already in pipeline` : ""}
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
            <p className="text-muted-foreground text-sm">Building your {verticalLabel} prospect list…</p>
          </div>
        )}

        {!searchMutation.isPending && leads.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                 {leads.length} prospects found in {city}, {state} — Prospect Industry: {industry}
                {enrichLeadsMutation.isPending && (
                  <span className="ml-2 inline-flex items-center gap-1 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up decision-maker contacts…
                  </span>
                )}
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
                          {enrichment.get(idx) === "pending" && (
                            <Badge variant="outline" className="text-xs font-medium bg-gray-100 text-gray-600 border-gray-200">
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Finding contact…
                            </Badge>
                          )}
                          {enrichment.get(idx) === "enriched" && (
                            <Badge variant="outline" className="text-xs font-medium bg-green-100 text-green-800 border-green-200">
                              <Check className="mr-1 h-3 w-3" /> Real contact found
                            </Badge>
                          )}
                          {enrichment.get(idx) === "not_found" && (
                            <Badge variant="outline" className="text-xs font-medium bg-amber-100 text-amber-800 border-amber-200">
                              <AlertCircle className="mr-1 h-3 w-3" /> No contact found — placeholder email
                            </Badge>
                          )}
                          {enrichment.get(idx) === "failed" && (
                            <Badge variant="outline" className="text-xs font-medium bg-gray-100 text-gray-600 border-gray-200">
                              <AlertCircle className="mr-1 h-3 w-3" /> Contact lookup unavailable
                            </Badge>
                          )}
                        </div>
                        {enrichmentErrors.get(idx) && (
                          <p className="mb-3 text-sm text-red-700" role="alert">
                            Contact lookup failed: {enrichmentErrors.get(idx)}
                          </p>
                        )}
                        {researchWarnings.get(idx) && (
                          <p className="mb-3 text-sm text-amber-700" role="status">
                            Research warning: {researchWarnings.get(idx)}
                          </p>
                        )}

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
                          {lead.estimatedEmployees != null && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Users className="h-3.5 w-3.5 shrink-0" />
                              <span>{lead.estimatedEmployees} employees</span>
                            </div>
                          )}
                          {lead.estimatedSquareFootage != null && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <SquareStack className="h-3.5 w-3.5 shrink-0" />
                              <span>{lead.estimatedSquareFootage.toLocaleString()} sq ft</span>
                            </div>
                          )}
                          {lead.estimatedLocations != null && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <SquareStack className="h-3.5 w-3.5 shrink-0" />
                              <span>{lead.estimatedLocations} location{lead.estimatedLocations === 1 ? "" : "s"} (est.)</span>
                            </div>
                          )}
                        </div>

                        {lead.opportunityScore != null && lead.scoreLabel && (
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge
                              variant="outline"
                              className={`text-xs font-medium ${SCORE_COLORS[lead.scoreLabel] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                            >
                              {isFleet ? "Fleet Wrap Opportunity Score" : isIT ? "IT Opportunity Score" : "Opportunity Score"}: {lead.opportunityScore} — {lead.scoreLabel}
                            </Badge>
                            {lead.opportunityScore >= 30 && (
                              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-xs font-medium text-primary">
                                <Phone className="mr-1 h-3 w-3" /> Fit to Call
                              </Badge>
                            )}
                            {lead.opportunityIntelligence && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2 hover:bg-muted">
                                    View Score Breakdown
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                                  <DialogHeader>
                                    <DialogTitle>Opportunity Intelligence</DialogTitle>
                                  </DialogHeader>
                                  <OpportunityIntelligenceView
                                    intelligence={lead.opportunityIntelligence}
                                    isDialog={true}
                                    vertical={me?.vertical}
                                    onRefresh={() => handleRefreshLead(lead, idx)}
                                    isRefreshing={refreshing.has(idx)}
                                  />
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        )}
                        {lead.scoreExplanation && !lead.opportunityIntelligence && (
                          <p className="text-xs text-muted-foreground mb-2">{lead.scoreExplanation}</p>
                        )}

                        <Separator className="my-2.5" />
                        {lead.opportunityIntelligence ? (
                          <OpportunityIntelligenceView
                            intelligence={lead.opportunityIntelligence}
                            compact
                            vertical={me?.vertical}
                            onRefresh={() => handleRefreshLead(lead, idx)}
                            isRefreshing={refreshing.has(idx)}
                          />
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">Why target: </span>
                              {sanitizeOpportunityLanguage(lead.whyTarget)}
                            </p>
                            {lead.potentialNeeds && lead.potentialNeeds.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1.5">
                                <span className="font-medium text-foreground">Potential opportunities (unconfirmed): </span>
                                {lead.potentialNeeds.map(sanitizeOpportunityLanguage).join(", ")}
                              </p>
                            )}
                            {lead.complianceConsideration && (
                              <p className="text-xs text-muted-foreground mt-1.5">
                                <span className="font-medium text-foreground">Compliance: </span>
                                {sanitizeOpportunityLanguage(lead.complianceConsideration)}
                              </p>
                            )}
                            {lead.fleetBrandingSignal && (
                              <p className="text-xs text-muted-foreground mt-1.5">
                                <span className="font-medium text-foreground">Fleet / Branding Signal: </span>
                                {sanitizeOpportunityLanguage(lead.fleetBrandingSignal)}
                              </p>
                            )}
                            {lead.recommendedOutreach && (
                              <p className="text-xs text-muted-foreground mt-1.5">
                                <span className="font-medium text-foreground">Recommended outreach: </span>
                                {sanitizeOpportunityLanguage(lead.recommendedOutreach)}
                              </p>
                            )}
                          </>
                        )}
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
            <AlertDialogAction onClick={() => runSearch()}>Discard and search</AlertDialogAction>
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

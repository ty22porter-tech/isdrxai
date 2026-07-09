import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, UserPlus, Check, Building2, Phone, Mail, MapPin, Users, SquareStack } from "lucide-react";

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

export default function Prospecting() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [industry, setIndustry] = useState("");
  const [count, setCount] = useState("10");
  const [leads, setLeads] = useState<ProspectLead[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [addingId, setAddingId] = useState<number | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchMutation = useProspectSearch();
  const createProspect = useCreateProspect();
  const bulkCreateProspects = useBulkCreateProspects();

  const handleSearch = () => {
    if (!city.trim() || !state || !industry) {
      toast({ title: "Fill in all fields", description: "City, state, and industry are required.", variant: "destructive" });
      return;
    }
    setLeads([]);
    setAdded(new Set());
    searchMutation.mutate(
      { data: { city: city.trim(), state, industry, count: parseInt(count) } },
      {
        onSuccess: (data) => setLeads(data),
        onError: () => toast({ title: "Search failed", description: "Could not generate prospects.", variant: "destructive" }),
      }
    );
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
          setAddingId(null);
          queryClient.invalidateQueries({ queryKey: getListProspectsQueryKey() });
          toast({ title: "Prospect added", description: `${lead.companyName} added to your pipeline.` });
        },
        onError: () => {
          setAddingId(null);
          toast({ title: "Failed to add", variant: "destructive" });
        },
      }
    );
  };

  const handleAddAll = async () => {
    const pending = leads
      .map((lead, idx) => ({ lead, idx }))
      .filter(({ idx }) => !added.has(idx));
    if (!pending.length) return;
    try {
      const result = await bulkCreateProspects.mutateAsync({
        data: {
          prospects: pending.map(({ lead }) => ({
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
      setAdded((prev) => {
        const next = new Set(prev);
        result.results.forEach((r) => {
          if (r.success) next.add(pending[r.index].idx);
        });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: getListProspectsQueryKey() });
      if (result.failed === 0) {
        toast({ title: "All prospects added", description: `${result.added} prospect${result.added !== 1 ? "s" : ""} added to your pipeline.` });
      } else {
        toast({
          title: "Some prospects failed to add",
          description: `${result.added} added, ${result.failed} failed. Failed prospects can be retried.`,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Failed to add prospects", variant: "destructive" });
    }
  };

  const allAdded = leads.length > 0 && leads.every((_, idx) => added.has(idx));

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prospect Search</h2>
          <p className="text-muted-foreground mt-1">
            Generate a targeted list of commercial prospects in any market. Add them directly to your pipeline.
          </p>
        </div>

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
                <Button variant="outline" onClick={handleAddAll} disabled={createProspect.isPending || bulkCreateProspects.isPending}>
                  {bulkCreateProspects.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Add All to Pipeline
                </Button>
              )}
              {leads.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {added.size} of {leads.length} added
                </span>
              )}
            </div>
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
                <Card key={idx} className={added.has(idx) ? "opacity-60" : ""}>
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
    </Layout>
  );
}

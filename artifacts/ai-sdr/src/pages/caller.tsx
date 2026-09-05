import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useListProspects, useListCampaigns } from "@workspace/api-client-react";
import { Headset, Phone, Play, Clock, Search, Briefcase, Plus, AlertCircle, Users, BarChart3, ListOrdered } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { trackEvent } from "@/lib/analytics";

async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const CALL_OUTCOMES = [
  "connected",
  "voicemail",
  "no_answer",
  "callback_requested",
  "information_sent",
  "meeting_booked",
  "not_interested",
  "do_not_call",
  "wrong_number",
] as const;

export default function CallerWorkspace() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [callbackAt, setCallbackAt] = useState("");

  const { data: reporting } = useQuery({
    queryKey: ["caller-reporting"],
    queryFn: () => fetchApi("/caller/reporting"),
  });

  const { data: queueData } = useQuery({
    queryKey: ["caller-queue", "claimed"],
    queryFn: () => fetchApi("/caller/queue?status=claimed&limit=1"),
  });

  const { data: pendingQueue } = useQuery({
    queryKey: ["caller-queue", "queued"],
    queryFn: () => fetchApi("/caller/queue?status=queued&limit=20"),
  });

  const activeTask = queueData?.tasks?.[0];
  const prospectData = activeTask?.prospect;
  const campaignData = activeTask?.campaign;

  const claimNextMutation = useMutation({
    mutationFn: () => fetchApi("/caller/queue/claim-next", { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["caller-queue"] });
      qc.invalidateQueries({ queryKey: ["caller-reporting"] });
      if (!data?.task) {
        toast({ title: "Queue is empty", description: "No calls due at the moment." });
      }
    },
    onError: (err: Error) => toast({ title: "Failed to claim task", description: err.message, variant: "destructive" }),
  });

  const releaseMutation = useMutation({
    mutationFn: (snoozeUntil?: string) =>
      fetchApi(`/caller/queue/${activeTask.id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeUntil }),
      }),
    onSuccess: () => {
      toast({ title: "Task released" });
      qc.invalidateQueries({ queryKey: ["caller-queue"] });
      qc.invalidateQueries({ queryKey: ["caller-reporting"] });
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Failed to release task", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: (submittedOutcome: string) => {
      const payload: any = { outcome: submittedOutcome };
      if (notes) payload.notes = notes;
      const parsedDuration = parseInt(duration);
      if (!isNaN(parsedDuration)) payload.duration = parsedDuration;
      if (submittedOutcome === "callback_requested" && callbackAt) {
        payload.callbackAt = new Date(callbackAt).toISOString();
      }
      return fetchApi(`/caller/queue/${activeTask.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (_data, submittedOutcome) => {
      trackEvent("caller_outcome_completed", { outcome: submittedOutcome });
      toast({ title: "Call completed" });
      qc.invalidateQueries({ queryKey: ["caller-queue"] });
      qc.invalidateQueries({ queryKey: ["caller-reporting"] });
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Failed to complete call", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setNotes("");
    setDuration("");
    setOutcome("");
    setCallbackAt("");
  };

  const limits = reporting?.limits;
  const isPilotEnabled = reporting?.enabled === true;

  let scriptObj = null;
  if (activeTask?.approvedScriptSnapshot) {
    try {
      scriptObj = JSON.parse(activeTask.approvedScriptSnapshot);
    } catch {
      // string
    }
  }

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-sm">
          <Headset className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Caller Workspace</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Focus mode for executing due calls and logging outcomes.</p>
        </div>
      </div>

      {!isPilotEnabled && reporting ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-destructive shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-destructive">Caller Pilot Not Enabled</h3>
            <p className="text-sm text-destructive/80 mt-1">This workspace is part of the hybrid human-caller pilot. Ask your admin to enable it in the Admin panel.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Queue Stats */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-6">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">My Queue</h3>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-lg border bg-muted/20 p-3 text-center">
                  <div className="text-2xl font-bold">{reporting?.counts?.queued ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Queued</div>
                </div>
                <div className="rounded-lg border bg-emerald-500/10 p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{reporting?.counts?.completed ?? 0}</div>
                  <div className="text-xs text-emerald-600/80 font-medium mt-1">Completed</div>
                </div>
              </div>

              {limits && (
                <div className="space-y-4 mb-6">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground font-medium">Daily Limit</span>
                      <span className="font-semibold">{limits.today.completed} / {limits.today.limit}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, (limits.today.completed / limits.today.limit) * 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground font-medium">Monthly Limit</span>
                      <span className="font-semibold">{limits.month.completed} / {limits.month.limit}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/60 transition-all" style={{ width: `${Math.min(100, (limits.month.completed / limits.month.limit) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {reporting?.outcomes && Object.keys(reporting.outcomes).length > 0 && (
                <div className="space-y-2 mb-6">
                  <h4 className="text-[10px] uppercase font-bold text-muted-foreground">Outcomes</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(reporting.outcomes).map(([outcome, count]) => (
                      <Badge key={outcome} variant="secondary" className="text-[10px]">
                        {String(count)} {outcome.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {reporting?.triggers && Object.keys(reporting.triggers).length > 0 && (
                <div className="space-y-2 mb-6 border-t pt-4">
                  <h4 className="text-[10px] uppercase font-bold text-muted-foreground">Sources</h4>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {Object.entries(reporting.triggers).map(([trigger, count]) => (
                      <div key={trigger} className="flex justify-between">
                        <span className="capitalize">{trigger.replace(/_/g, ' ')}</span>
                        <span className="font-medium text-foreground">{String(count)}</span>
                      </div>
                    ))}
                    {reporting.counts?.callbacks !== undefined && (
                      <div className="flex justify-between text-primary font-medium pt-1">
                        <span>Pending Callbacks</span>
                        <span>{reporting.counts.callbacks}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {reporting?.recentDailyTotals && reporting.recentDailyTotals.length > 0 && (
                <div className="space-y-2 mb-6 border-t pt-4">
                  <h4 className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                    <span>Recent Activity</span>
                    <BarChart3 className="w-3 h-3" />
                  </h4>
                  <div className="flex items-end h-12 gap-1 pt-2">
                    {reporting.recentDailyTotals.slice(-14).map((day: any) => {
                      const max = Math.max(1, ...reporting.recentDailyTotals.map((d: any) => d.total));
                      const height = `${Math.max(4, (day.total / max) * 100)}%`;
                      return (
                        <div key={day.date} className="flex-1 flex flex-col justify-end group relative">
                          <div 
                            className={`w-full rounded-t-sm transition-all ${day.total > 0 ? 'bg-primary' : 'bg-muted'}`}
                            style={{ height }}
                          />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                            <div className="bg-foreground text-background text-[10px] px-2 py-0.5 rounded whitespace-nowrap">
                              {day.total} calls
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button 
                className="w-full h-12 text-sm font-semibold" 
                size="lg"
                disabled={claimNextMutation.isPending || !!activeTask}
                onClick={() => claimNextMutation.mutate()}
              >
                {claimNextMutation.isPending ? "Finding next..." : activeTask ? "Task in progress" : "Claim Next Task"}
              </Button>
            </div>

            <ManualEnqueueCard />
          </div>

          {/* Right Column: Active Task */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {!activeTask ? (
              <div className="rounded-xl border border-dashed bg-muted/10 p-12 text-center text-muted-foreground min-h-[400px] flex flex-col items-center justify-center">
                <Headset className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-foreground mb-2">No active call task</h3>
                <p className="text-sm max-w-md mx-auto">
                  Click "Claim Next Task" to pull the highest priority due call from your queue. You will see the prospect details, campaign script, and a form to log the outcome.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
                {/* Header info */}
                <div className="px-6 py-6 border-b bg-muted/5 flex flex-wrap gap-6 justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Active Call</Badge>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">Task #{activeTask.id}</span>
                      {activeTask.priority > 50 && <Badge variant="default" className="bg-amber-500 hover:bg-amber-500 text-[10px]">High Priority</Badge>}
                      {activeTask.sourceTrigger === "callback" && <Badge variant="secondary" className="text-[10px] text-primary bg-primary/10">Scheduled Callback</Badge>}
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">{prospectData?.companyName || "Loading..."}</h2>
                    <div className="flex items-center gap-4 mt-2.5 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" /> {prospectData?.industry || "Unknown"}</span>
                      {prospectData?.city && <span className="flex items-center gap-1.5 text-muted-foreground/80">{prospectData.city}{prospectData.state ? `, ${prospectData.state}` : ''}</span>}
                      {activeTask.campaignId && (
                        <span className="flex items-center gap-1.5 text-muted-foreground/80 border-l pl-4">
                          {campaignData?.name || `Campaign #${activeTask.campaignId}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right bg-background border rounded-lg p-4 shadow-sm min-w-[200px]">
                    <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1">Contact</p>
                    <p className="text-lg font-semibold">{prospectData?.contactName || "—"}</p>
                    {prospectData?.phone ? (
                      <a href={`tel:${prospectData.phone}`} className="inline-flex items-center gap-1.5 mt-2 text-primary hover:text-primary/80 transition-colors font-semibold text-lg bg-primary/5 px-3 py-1.5 rounded-md border border-primary/10">
                        <Phone className="w-4 h-4" /> {prospectData.phone}
                      </a>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-2 italic">No phone number</p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-12 divide-y md:divide-y-0 md:divide-x border-b">
                  {/* Script section */}
                  <div className="md:col-span-7 p-6 bg-muted/5">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                      <Search className="w-3.5 h-3.5" /> Approved Script 
                      {activeTask.approvedScriptVersion > 0 && <span className="text-[10px] font-mono font-normal">v{activeTask.approvedScriptVersion}</span>}
                    </h4>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
                      {scriptObj ? (
                        <div className="space-y-4">
                          {Object.keys(scriptObj).map((key) => {
                            const step = scriptObj[key];
                            if (!step || !step.body) return null;
                            return (
                              <div key={key} className="rounded-lg border bg-background p-4 shadow-sm">
                                <p className="font-semibold text-foreground mb-2 text-xs">{step.subject || key}</p>
                                <p className="whitespace-pre-wrap leading-relaxed">{step.body.replace(/{{contactName}}/g, prospectData?.contactName || "Contact").replace(/{{companyName}}/g, prospectData?.companyName || "Company").replace(/{{industry}}/g, prospectData?.industry || "Industry").replace(/{{city}}/g, prospectData?.city || "City").replace(/{{state}}/g, prospectData?.state || "State")}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap leading-relaxed bg-background border rounded-lg p-5 shadow-sm">
                          {activeTask.approvedScriptSnapshot || "No script provided."}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outcomes form */}
                  <div className="md:col-span-5 p-6 bg-card">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-4 flex items-center gap-2">
                      <Play className="w-3.5 h-3.5" /> Log Outcome
                    </h4>
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Result <span className="text-destructive">*</span></label>
                        <Select value={outcome} onValueChange={setOutcome}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Select outcome..." /></SelectTrigger>
                          <SelectContent>
                            {CALL_OUTCOMES.map(o => (
                              <SelectItem key={o} value={o}>{o.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {outcome === "callback_requested" && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                          <label className="text-sm font-semibold">Callback At <span className="text-destructive">*</span></label>
                          <Input 
                            type="datetime-local" 
                            className="h-10"
                            value={callbackAt}
                            onChange={(e) => setCallbackAt(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-muted-foreground">Notes <span className="font-normal">(optional)</span></label>
                        <Textarea 
                          rows={4}
                          className="resize-none"
                          placeholder="Summarize the conversation, key objections, or next steps..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-muted-foreground">Duration <span className="font-normal">(seconds, optional)</span></label>
                        <Input 
                          type="number"
                          placeholder="e.g. 120"
                          className="h-10"
                          value={duration}
                          onChange={(e) => setDuration(e.target.value)}
                        />
                      </div>

                      <div className="pt-6 border-t flex flex-col gap-3">
                        <Button
                          onClick={() => completeMutation.mutate(outcome)}
                          disabled={!outcome || (outcome === 'callback_requested' && !callbackAt) || completeMutation.isPending}
                          size="lg"
                          className={`w-full font-semibold text-white ${
                            outcome === "meeting_booked" ? "bg-emerald-600 hover:bg-emerald-700" :
                            outcome === "do_not_call" ? "bg-destructive hover:bg-destructive/90" : 
                            "bg-primary hover:bg-primary/90"
                          }`}
                        >
                          {completeMutation.isPending ? "Saving..." : "Complete Call"}
                        </Button>
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            type="button"
                            variant="outline"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => releaseMutation.mutate(undefined)}
                            disabled={releaseMutation.isPending}
                          >
                            Release back to queue
                          </Button>
                          <Button 
                            type="button"
                            variant="outline"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const d = new Date();
                              d.setHours(d.getHours() + 4);
                              releaseMutation.mutate(d.toISOString());
                            }}
                            disabled={releaseMutation.isPending}
                          >
                            <Clock className="w-3.5 h-3.5 mr-2" /> Snooze 4h
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming Queue Preview */}
            {pendingQueue?.tasks && pendingQueue.tasks.length > 0 && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-muted/5 flex items-center justify-between">
                  <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ListOrdered className="w-4 h-4" /> Upcoming Queue
                  </h3>
                  <Badge variant="secondary">{reporting?.counts?.queued ?? 0} left</Badge>
                </div>
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {pendingQueue.tasks.map((task: any) => (
                    <div key={task.id} className="p-4 hover:bg-muted/10 transition-colors text-sm">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <span className="font-semibold text-foreground truncate">{task.prospect?.companyName || `Prospect #${task.prospectId}`}</span>
                        {task.priority > 50 && <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wide shrink-0">High Pri</span>}
                      </div>
                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground mt-1.5">
                        {task.sourceTrigger === "callback" ? (
                          <span className="text-primary font-medium">Callback</span>
                        ) : (
                          <span className="capitalize">{task.sourceTrigger.replace(/_/g, ' ')}</span>
                        )}
                        <span>•</span>
                        <span>{task.prospect?.industry || 'Unknown industry'}</span>
                        {task.campaign && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[150px]">{task.campaign.name}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>Due {new Date(task.dueAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

function ManualEnqueueCard() {
  const [prospectId, setProspectId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [priority, setPriority] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: prospectsData } = useListProspects();
  const { data: campaignsData } = useListCampaigns();

  const prospects = prospectsData || [];
  const campaigns = campaignsData?.filter((c: any) => c.type === "call" && c.callScriptApprovedAt) || [];

  const enqueueProspectMutation = useMutation({
    mutationFn: () => fetchApi("/caller/queue/prospect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectId: parseInt(prospectId),
        priority: priority ? parseInt(priority) : 0,
      }),
    }),
    onSuccess: (data) => {
      if (data.suppression) {
        toast({ title: "Suppressed", description: data.suppression, variant: "destructive" });
      } else {
        toast({ title: data.created ? "Added to queue" : "Already in queue" });
      }
      setProspectId("");
      setPriority("");
      qc.invalidateQueries({ queryKey: ["caller-queue"] });
      qc.invalidateQueries({ queryKey: ["caller-reporting"] });
    },
    onError: (err: Error) => toast({ title: "Failed to enqueue prospect", description: err.message, variant: "destructive" }),
  });

  const enqueueCampaignMutation = useMutation({
    mutationFn: () => fetchApi("/caller/queue/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: parseInt(campaignId),
        priority: priority ? parseInt(priority) : 0,
      }),
    }),
    onSuccess: (data) => {
      toast({ 
        title: "Campaign added to queue", 
        description: `${data.created} added, ${data.existing} existing, ${data.suppressed} suppressed.` 
      });
      setCampaignId("");
      setPriority("");
      qc.invalidateQueries({ queryKey: ["caller-queue"] });
      qc.invalidateQueries({ queryKey: ["caller-reporting"] });
    },
    onError: (err: Error) => toast({ title: "Failed to enqueue campaign", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-6">
      <div>
        <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Prospect to Queue
        </h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Prospect</label>
            <Select value={prospectId} onValueChange={setProspectId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a prospect..." /></SelectTrigger>
              <SelectContent>
                {prospects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.companyName} - {p.contactName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Priority <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input 
              type="number"
              placeholder="0"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <Button 
            className="w-full" 
            size="sm"
            variant="secondary"
            disabled={!prospectId || enqueueProspectMutation.isPending}
            onClick={() => enqueueProspectMutation.mutate()}
          >
            {enqueueProspectMutation.isPending ? "Adding..." : "Enqueue Prospect"}
          </Button>
        </div>
      </div>
      
      <Separator />

      <div>
        <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Users className="w-4 h-4" /> Add Campaign to Queue
        </h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Call Campaign</label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select an approved call campaign..." /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            className="w-full" 
            size="sm"
            variant="secondary"
            disabled={!campaignId || enqueueCampaignMutation.isPending}
            onClick={() => enqueueCampaignMutation.mutate()}
          >
            {enqueueCampaignMutation.isPending ? "Adding..." : "Enqueue Campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}

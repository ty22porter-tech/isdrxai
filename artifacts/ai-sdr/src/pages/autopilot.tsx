import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Bot, Play, Pause, Mail, Calendar, CheckCircle2, AlertCircle, Clock, MessageSquare, Loader2, PlusCircle, X, ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `API error ${res.status}`);
  return data;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:        { label: "Sending",        color: "text-sky-400 bg-sky-500/10 border-sky-500/30",    icon: Play },
  paused:        { label: "Paused",         color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30", icon: Pause },
  replied:       { label: "Replied",        color: "text-purple-400 bg-purple-500/10 border-purple-500/30", icon: MessageSquare },
  calendly_sent: { label: "Calendly Sent", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: Calendar },
  booked:        { label: "Booked!",        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  completed:     { label: "Done",           color: "text-slate-400 bg-slate-500/10 border-slate-500/30", icon: CheckCircle2 },
  unsubscribed:  { label: "Opted Out",      color: "text-red-400 bg-red-500/10 border-red-500/30", icon: X },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.paused;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function StepDots({ step, status }: { step: number; status: string }) {
  const total = 3;
  return (
    <div className="flex items-center gap-1" title={`Step ${step} of ${total} emails sent`}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted-foreground/20"}`} />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{step}/{total}</span>
    </div>
  );
}

function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `in ${h}h`;
  return `in ${Math.floor(h / 24)}d`;
}

export default function AutopilotPage() {
  const { user, isLoaded } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [replyModal, setReplyModal] = useState<{ id: number; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [enrollModal, setEnrollModal] = useState(false);
  const [enrollCampaign, setEnrollCampaign] = useState<number | null>(null);
  const [selectedProspects, setSelectedProspects] = useState<number[]>([]);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: isLoaded && !!user,
  });

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["autopilot-enrollments"],
    queryFn: () => apiFetch("/autopilot/enrollments"),
    enabled: isLoaded && !!user,
    refetchInterval: 30000,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiFetch("/campaigns"),
    enabled: enrollModal,
  });

  const { data: prospects = [] } = useQuery({
    queryKey: ["prospects-for-enroll"],
    queryFn: () => apiFetch("/prospects"),
    enabled: enrollModal,
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, replyContent }: { id: number; replyContent: string }) =>
      apiFetch(`/autopilot/enrollments/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyContent }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopilot-enrollments"] });
      setReplyModal(null);
      setReplyText("");
    },
    onError: (err: Error) => toast({ title: "Failed to send reply", description: err.message, variant: "destructive" }),
  });

  const bookMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/autopilot/enrollments/${id}/book`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot-enrollments"] }),
    onError: (err: Error) => toast({ title: "Failed to mark as booked", description: err.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/autopilot/enrollments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot-enrollments"] }),
    onError: (err: Error) => toast({ title: "Failed to update status", description: err.message, variant: "destructive" }),
  });

  const unenrollMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/autopilot/enrollments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopilot-enrollments"] }),
    onError: (err: Error) => toast({ title: "Failed to remove enrollment", description: err.message, variant: "destructive" }),
  });

  const enrollMutation = useMutation({
    mutationFn: () =>
      apiFetch("/autopilot/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: enrollCampaign ?? undefined, prospectIds: selectedProspects, startNow: true }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopilot-enrollments"] });
      setEnrollModal(false);
      setSelectedProspects([]);
      setEnrollCampaign(null);
    },
    onError: (err: Error) => toast({ title: "Failed to enroll prospects", description: err.message, variant: "destructive" }),
  });

  const active = enrollments.filter((e: any) => e.status === "active").length;
  const booked = enrollments.filter((e: any) => e.status === "booked").length;
  const replied = enrollments.filter((e: any) => ["replied", "calendly_sent"].includes(e.status)).length;
  const emailsSent = enrollments.reduce((sum: number, e: any) => sum + (e.currentStep ?? 0), 0);

  const notConfigured = !me?.autopilotReady;

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Autopilot</h2>
              <p className="text-muted-foreground mt-0.5">iSDRX AI running on autopilot — emails, follow-ups, and booking</p>
            </div>
          </div>
          <Button onClick={() => setEnrollModal(true)} disabled={notConfigured} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Add Prospects
          </Button>
        </div>

        {notConfigured && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-300 text-sm">Quick setup needed</p>
              <p className="text-yellow-400/80 text-sm mt-0.5">Add your business name, reply-to email, and business mailing address in Settings — takes 30 seconds, no passwords needed.</p>
              <Link href="/settings">
                <Button size="sm" variant="outline" className="mt-3 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10">
                  Go to Settings
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active", value: active, icon: Play, color: "text-sky-400" },
            { label: "Emails Sent", value: emailsSent, icon: Mail, color: "text-blue-400" },
            { label: "Replied", value: replied, icon: MessageSquare, color: "text-purple-400" },
            { label: "Booked", value: booked, icon: CheckCircle2, color: "text-emerald-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                <Icon className={`w-4 h-4 ${color}`} />
                {label}
              </div>
              <div className="text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">Active Prospects</h3>
            <span className="text-xs text-muted-foreground">Refreshes every 30s</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide font-medium">
            <div>Prospect</div>
            <div>Status</div>
            <div>Progress</div>
            <div>Next Email</div>
            <div>Actions</div>
          </div>
          <div className="divide-y divide-border">
            {isLoading && <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>}
            {!isLoading && enrollments.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground">
                <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No prospects enrolled yet</p>
                <p className="text-sm mt-1">Click "Add Prospects" to put your iSDRX AI on autopilot</p>
              </div>
            )}
            {enrollments.map((e: any) => (
              <div key={e.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-muted/20 transition-colors">
                <div>
                  <div className="font-medium text-sm">{e.prospect?.companyName ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{e.prospect?.contactName} · {e.prospect?.email}</div>
                  {e.campaign && <div className="text-xs text-muted-foreground/60 mt-0.5">{e.campaign.name}</div>}
                  {e.errorMessage && <div className="text-xs text-red-400 mt-0.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{e.errorMessage}</div>}
                </div>
                <StatusPill status={e.status} />
                <StepDots step={e.currentStep} status={e.status} />
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {["active"].includes(e.status) ? timeUntil(e.nextSendAt) : "—"}
                </div>
                <div className="flex items-center gap-1">
                  {e.status === "active" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-yellow-400 hover:text-yellow-300"
                      onClick={() => pauseMutation.mutate({ id: e.id, status: "paused" })}>
                      Pause
                    </Button>
                  )}
                  {e.status === "paused" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-sky-400 hover:text-sky-300"
                      onClick={() => pauseMutation.mutate({ id: e.id, status: "active" })}>
                      Resume
                    </Button>
                  )}
                  {["active", "paused", "completed"].includes(e.status) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-purple-400 hover:text-purple-300"
                      onClick={() => { setReplyModal({ id: e.id, name: e.prospect?.companyName ?? "Prospect" }); setReplyText(""); }}>
                      Log Reply
                    </Button>
                  )}
                  {e.status === "calendly_sent" && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
                      onClick={() => bookMutation.mutate(e.id)}>
                      Mark Booked
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => unenrollMutation.mutate(e.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sequence explainer */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4">How Autopilot Works</h3>
          <div className="flex items-start gap-0">
            {[
              { day: "Day 0", label: "Cold Email", desc: "AI writes a personalized intro email and sends it immediately", icon: Mail, color: "text-sky-400" },
              { day: "Day 3", label: "Follow-up", desc: "If no reply, AI sends a short friendly follow-up", icon: Mail, color: "text-blue-400" },
              { day: "Day 7", label: "Final Touch", desc: "One last outreach — direct and respectful", icon: Mail, color: "text-indigo-400" },
              { day: "On Reply", label: "Calendly Link", desc: "AI detects interest, auto-sends your booking link", icon: Calendar, color: "text-emerald-400" },
            ].map((step, i, arr) => (
              <div key={step.day} className="flex items-start flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${step.color.replace("text-", "border-")} bg-card`}>
                    <step.icon className={`w-4 h-4 ${step.color}`} />
                  </div>
                  {i < arr.length - 1 && <div className="w-px flex-1 bg-border mt-1" style={{ height: 20 }} />}
                </div>
                <div className="ml-3 pb-6 flex-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{step.day}</div>
                  <div className="font-medium text-sm mt-0.5">{step.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reply Modal */}
      {replyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Log Reply from {replyModal.name}</h3>
              <button onClick={() => setReplyModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Paste what they replied. The AI will analyze their interest level and automatically send your Calendly link if they're interested.</p>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Paste their reply here..."
              rows={5}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setReplyModal(null)}>Cancel</Button>
              <Button className="flex-1" disabled={!replyText.trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate({ id: replyModal.id, replyContent: replyText })}>
                {replyMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing…</> : "Log & Auto-Respond"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Modal */}
      {enrollModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Add Prospects to Autopilot</h3>
              <button onClick={() => setEnrollModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Campaign (optional)</label>
              <select
                value={enrollCampaign ?? ""}
                onChange={e => setEnrollCampaign(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">No campaign — standard 3-step AI sequence</option>
                {(campaigns as any[]).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                Prospects ({selectedProspects.length} selected)
              </label>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                {(prospects as any[]).filter((p: any) => p.status !== "appointment_set").map((p: any) => (
                  <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProspects.includes(p.id)}
                      onChange={e => setSelectedProspects(prev =>
                        e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
                      )}
                      className="accent-primary"
                    />
                    <div>
                      <div className="text-sm font-medium">{p.companyName}</div>
                      <div className="text-xs text-muted-foreground">{p.contactName} · {p.email}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setEnrollModal(false)}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={selectedProspects.length === 0 || enrollMutation.isPending}
                onClick={() => enrollMutation.mutate()}
              >
                {enrollMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting…</> : `Start Autopilot (${selectedProspects.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

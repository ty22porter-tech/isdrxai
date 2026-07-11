import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Shield, Users, CheckCircle2, XCircle, Loader2, Play, Eye, Clock, ChevronDown, ChevronRight, Ticket, Plus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error("forbidden");
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    trialing: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
    cancelled: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full border ${styles[status] ?? styles.cancelled}`}>
      {status}
    </span>
  );
}

function EventBadge({ event }: { event: string }) {
  if (event === "loaded") return <span className="text-xs text-sky-400 font-medium">👁 Opened</span>;
  if (event === "25") return <span className="text-xs text-yellow-400 font-medium">▶ 25%</span>;
  if (event === "50") return <span className="text-xs text-orange-400 font-medium">▶ 50%</span>;
  if (event === "75") return <span className="text-xs text-emerald-400 font-medium">▶ 75%</span>;
  if (event === "100") return <span className="text-xs text-emerald-500 font-bold">✓ Watched</span>;
  return <span className="text-xs text-muted-foreground">{event}</span>;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function groupViewsByRef(views: any[]) {
  const map: Record<string, { ref: string; clientId: string; events: Set<string>; lastSeen: string }> = {};
  for (const v of views) {
    const key = `${v.clientId}::${v.ref}`;
    if (!map[key]) {
      map[key] = { ref: v.ref, clientId: v.clientId, events: new Set(), lastSeen: v.createdAt };
    }
    map[key].events.add(v.event);
    if (v.createdAt > map[key].lastSeen) map[key].lastSeen = v.createdAt;
  }
  return Object.values(map).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

function SendingEmailEditor({
  client,
  saving,
  onSave,
}: {
  client: any;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const current = client.sendingEmail ?? "";
  const [val, setVal] = useState(current);
  const dirty = val.trim() !== current;
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Sends as</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="shared domain (default)"
        spellCheck={false}
        className="text-xs bg-muted/40 border rounded px-2 py-1 w-64 font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {dirty && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-primary"
          disabled={saving}
          onClick={() => onSave(val.trim())}
        >
          Save
        </Button>
      )}
    </div>
  );
}

function ClientDetails({ client }: { client: any }) {
  const rows: [string, string | null][] = [
    ["Account name", client.accountName],
    ["Email", client.email],
    ["Business name", client.businessName],
    ["Sender name", client.senderName],
    ["Phone", client.phone],
    ["Business address", client.businessAddress],
    ["Industry vertical", client.vertical],
    ["Reply-to email", client.outreachEmail],
    ["Sending email", client.sendingEmail ?? "shared domain (default)"],
    ["Calendly link", client.calendlyUrl],
    ["Timezone", client.timezone],
    ["Autopilot", client.autopilotEnabled ? "On" : "Off"],
    ["Trial ends", client.trialEndsAt ? new Date(client.trialEndsAt).toLocaleDateString() : null],
    ["Account ID", client.id],
  ];
  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 text-xs">
          <span className="text-muted-foreground shrink-0">{label}</span>
          <span className={`text-right break-all ${value ? "font-medium" : "text-muted-foreground/60 italic"}`}>
            {value || "not set"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const { user, isLoaded } = useUser();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [codeLabel, setCodeLabel] = useState("");
  const [codeDays, setCodeDays] = useState("14");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: meData, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: isLoaded && !!user,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: () => apiFetch("/admin/clients"),
    enabled: !!meData?.isAdmin,
  });

  const { data: viewsData, isLoading: viewsLoading } = useQuery({
    queryKey: ["admin-video-views"],
    queryFn: () => apiFetch("/admin/video-views"),
    enabled: !!meData?.isAdmin,
    refetchInterval: 30000,
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiFetch(`/admin/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-clients"] }),
    onError: (err: Error) => toast({ title: "Failed to update client", description: err.message, variant: "destructive" }),
  });

  const { data: codesData, isLoading: codesLoading } = useQuery({
    queryKey: ["admin-trial-codes"],
    queryFn: () => apiFetch("/trial-codes"),
    enabled: !!meData?.isAdmin,
  });

  const generateMutation = useMutation({
    mutationFn: (body: { label: string; trialDays: number }) =>
      apiFetch("/trial-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setCodeLabel("");
      qc.invalidateQueries({ queryKey: ["admin-trial-codes"] });
    },
    onError: (err: Error) => toast({ title: "Failed to generate code", description: err.message, variant: "destructive" }),
  });

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code)
      .then(() => {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
      })
      .catch(() => {});
  };

  if (!isLoaded || meLoading) return null;
  if (meData && !meData.isAdmin) return <Redirect to="/dashboard" />;

  const clients: any[] = data?.clients ?? [];
  const trialCodes: any[] = codesData?.codes ?? [];
  const allViews: any[] = viewsData?.views ?? [];
  const groupedViews = groupViewsByRef(allViews);
  const uniqueLinks = new Set(allViews.map((v: any) => `${v.clientId}::${v.ref}`)).size;
  const watchedCount = groupedViews.filter(g => g.events.has("100")).length;

  return (
    <Layout>
      <div className="space-y-10">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Admin Panel</h2>
            <p className="text-muted-foreground mt-0.5">Manage all client accounts and video analytics</p>
          </div>
        </div>

        {/* Client stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Clients", value: clients.length },
            { label: "Active", value: clients.filter(c => c.status === "active" || c.status === "trialing").length },
            { label: "Suspended", value: clients.filter(c => c.status === "suspended").length },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border bg-card p-5">
              <div className="text-muted-foreground text-sm">{label}</div>
              <div className="text-2xl font-bold mt-1">{value}</div>
            </div>
          ))}
        </div>

        {/* Clients table */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Clients</h3>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide font-medium">
            <div>Client</div>
            <div>Status</div>
            <div className="text-center">Usage</div>
            <div>Joined</div>
            <div>Actions</div>
          </div>
          <div className="divide-y divide-border">
            {isLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
            {!isLoading && clients.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2" />
                No clients yet
              </div>
            )}
            {clients.map((client: any) => (
              <div key={client.id} className="px-6 py-4 hover:bg-muted/20 transition-colors">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center">
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-left group"
                    onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                  >
                    {expandedId === client.id
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <span className="font-medium text-sm truncate max-w-[220px] group-hover:text-primary transition-colors">
                      {client.businessName || client.accountName || client.email || "Unnamed client"}
                    </span>
                  </button>
                  <div className="text-muted-foreground text-xs mt-0.5 truncate max-w-[240px] pl-5">
                    {client.email ?? "no email on file"}
                    {client.accountName && client.businessName ? ` · ${client.accountName}` : ""}
                  </div>
                  <div className="pl-5">
                    <SendingEmailEditor
                      client={client}
                      saving={patchMutation.isPending}
                      onSave={(sendingEmail) => patchMutation.mutate({ id: client.id, body: { sendingEmail } })}
                    />
                  </div>
                </div>
                <StatusBadge status={client.status} />
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span title="Prospects">{client.stats?.prospects ?? 0}P</span>
                  <span title="Emails">{client.stats?.emails ?? 0}E</span>
                  <span title="Calls">{client.stats?.calls ?? 0}C</span>
                  <span title="Appts">{client.stats?.appointments ?? 0}A</span>
                </div>
                <div className="text-muted-foreground text-xs whitespace-nowrap">
                  {new Date(client.createdAt).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  {client.status === "suspended" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-emerald-500 hover:text-emerald-400 h-8 gap-1.5 text-xs"
                      disabled={patchMutation.isPending}
                      onClick={() => patchMutation.mutate({ id: client.id, body: { status: "active" } })}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Activate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-8 gap-1.5 text-xs"
                      disabled={patchMutation.isPending || client.isAdmin}
                      onClick={() => patchMutation.mutate({ id: client.id, body: { status: "suspended" } })}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Suspend
                    </Button>
                  )}
                </div>
                </div>
                {expandedId === client.id && <ClientDetails client={client} />}
              </div>
            ))}
          </div>
        </div>

        {/* Trial Codes */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Ticket className="w-4 h-4 text-primary" /> Free Trial Codes</h3>
            <span className="text-muted-foreground text-sm">
              <span className="text-foreground font-semibold">{trialCodes.filter(c => !c.redeemedBy).length}</span> available
            </span>
          </div>

          <div className="px-6 py-4 border-b bg-muted/30 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Label (optional)</label>
              <input
                value={codeLabel}
                onChange={(e) => setCodeLabel(e.target.value)}
                placeholder="e.g. Acme Corp — sales demo"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="w-full sm:w-28">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Trial days</label>
              <input
                value={codeDays}
                onChange={(e) => setCodeDays(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <Button
              className="gap-1.5"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate({ label: codeLabel.trim(), trialDays: Number(codeDays) || 14 })}
            >
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Generate code
            </Button>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-3 bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide font-medium">
            <div>Code</div>
            <div>Trial</div>
            <div>Status</div>
            <div>Created</div>
          </div>

          <div className="divide-y divide-border">
            {codesLoading && (
              <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
            )}
            {!codesLoading && trialCodes.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground">
                <Ticket className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No trial codes yet</p>
                <p className="text-xs mt-1">Generate a code above and share it with a prospective client.</p>
              </div>
            )}
            {trialCodes.map((c) => (
              <div key={c.code} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-3 items-center hover:bg-muted/20 transition-colors">
                <div className="min-w-0">
                  <button type="button" onClick={() => copyCode(c.code)} className="flex items-center gap-2 font-mono text-sm group">
                    <span className="truncate">{c.code}</span>
                    {copiedCode === c.code
                      ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      : <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />}
                  </button>
                  {c.label && <div className="text-muted-foreground text-xs mt-0.5 truncate">{c.label}</div>}
                </div>
                <div className="text-muted-foreground text-xs whitespace-nowrap">{c.trialDays}d</div>
                <div className="whitespace-nowrap">
                  {c.redeemedBy
                    ? <span className="text-xs text-muted-foreground">Used{c.redeemedAt ? ` · ${new Date(c.redeemedAt).toLocaleDateString()}` : ""}</span>
                    : <span className="text-xs text-emerald-400 font-medium">Available</span>}
                </div>
                <div className="text-muted-foreground text-xs whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Video Views */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" /> Video View Tracking
            </h3>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-muted-foreground">
                <span className="text-foreground font-semibold">{uniqueLinks}</span> links sent
              </span>
              <span className="text-muted-foreground">
                <span className="text-emerald-400 font-semibold">{watchedCount}</span> watched to end
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-3 bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide font-medium">
            <div>Prospect / Ref</div>
            <div>Progress</div>
            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> Last Seen</div>
            <div>Watch %</div>
          </div>

          <div className="divide-y divide-border">
            {viewsLoading && (
              <div className="flex justify-center py-10">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            )}
            {!viewsLoading && groupedViews.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground">
                <Eye className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No views yet</p>
                <p className="text-xs mt-1">Share a tracking link to start seeing who watches your video</p>
                <div className="mt-4 rounded-lg bg-muted/60 px-4 py-3 text-left text-xs font-mono break-all text-muted-foreground">
                  {window.location.origin}/ai-sdr-video/?ref=prospect-name&amp;c=YOUR_USER_ID
                </div>
              </div>
            )}
            {groupedViews.map((g) => {
              const pct = g.events.has("100") ? 100
                : g.events.has("75") ? 75
                : g.events.has("50") ? 50
                : g.events.has("25") ? 25
                : g.events.has("loaded") ? 5
                : 0;
              return (
                <div key={`${g.clientId}::${g.ref}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-muted/20 transition-colors">
                  <div>
                    <div className="font-medium text-sm">{g.ref}</div>
                    <div className="text-muted-foreground text-xs mt-0.5 font-mono">{g.clientId.slice(0, 14)}…</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {["loaded", "25", "50", "75", "100"].map(ev => (
                      <div
                        key={ev}
                        title={ev === "loaded" ? "Opened" : `${ev}% watched`}
                        className={`w-2 h-2 rounded-full ${g.events.has(ev) ? "bg-primary" : "bg-muted-foreground/20"}`}
                      />
                    ))}
                  </div>
                  <div className="text-muted-foreground text-xs whitespace-nowrap">
                    {timeAgo(g.lastSeen)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: pct >= 100 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#3b82f6",
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium w-8">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </Layout>
  );
}

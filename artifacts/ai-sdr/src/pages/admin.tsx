import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Shield, Users, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "@/components/layout";
import { Redirect } from "wouter";

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

export default function Admin() {
  const { user, isLoaded } = useUser();
  const qc = useQueryClient();

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

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiFetch(`/admin/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-clients"] }),
  });

  if (!isLoaded || meLoading) return null;
  if (meData && !meData.isAdmin) return <Redirect to="/dashboard" />;

  const clients: any[] = data?.clients ?? [];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Admin Panel</h2>
            <p className="text-muted-foreground mt-0.5">Manage all client accounts</p>
          </div>
        </div>

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

        <div className="rounded-xl border bg-card overflow-hidden">
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
              <div key={client.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4 items-center hover:bg-muted/20 transition-colors">
                <div>
                  <div className="font-medium text-sm truncate max-w-[200px]">
                    {client.email ?? client.id.slice(0, 20) + "…"}
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5 font-mono">{client.id.slice(0, 14)}…</div>
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
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

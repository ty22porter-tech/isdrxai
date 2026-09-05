import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, AlertCircle, ExternalLink, Loader2, Ticket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API error ${res.status}`);
  }
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    trialing: "bg-primary/10 text-primary border-primary/30",
    suspended: "bg-red-500/20 text-red-400 border-red-500/30",
    cancelled: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  const labels: Record<string, string> = { active: "Active", trialing: "Trial", suspended: "Suspended", cancelled: "Cancelled" };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${styles[status] ?? styles.cancelled}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function Billing() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const params = new URLSearchParams(window.location.search);
  const onboarding = params.get("onboarding") === "1";
  const checkoutSuccess = params.get("checkout") === "success";

  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => apiFetch("/stripe/subscription"),
    refetchInterval: checkoutSuccess ? 3_000 : false,
  });
  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    refetchInterval: checkoutSuccess ? 3_000 : false,
  });

  const portalMutation = useMutation({
    mutationFn: () => apiFetch("/stripe/billing-portal", { method: "POST" }),
    onSuccess: (data) => { if (data.url) window.location.href = data.url; },
    onError: (err: Error) => toast({ title: "Couldn't open billing portal", description: err.message, variant: "destructive" }),
  });

  const redeemMutation = useMutation({
    mutationFn: (c: string) =>
      apiFetch("/trial-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      }),
    onSuccess: async (data) => {
      toast({ title: "Free trial activated!", description: data.trialDays === 0 ? "You have full access with no expiration." : `You have full access for ${data.trialDays} days.` });
      setCode("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subscription"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
      ]);
      setLocation("/prospecting");
    },
    onError: (err: Error) => toast({ title: "Couldn't redeem code", description: err.message, variant: "destructive" }),
  });

  const status = subData?.status ?? "trialing";
  const subscription = subData?.subscription;
  const trialEndsAt = subData?.trialEndsAt ? new Date(subData.trialEndsAt) : null;
  const trialActive = trialEndsAt ? trialEndsAt.getTime() > Date.now() : false;
  // Trials ending more than ~50 years out are "unlimited" test-access trials.
  const trialUnlimited = trialActive && trialEndsAt!.getTime() - Date.now() > 50 * 365 * 86400000;
  const trialDaysLeft = trialActive ? Math.ceil((trialEndsAt!.getTime() - Date.now()) / 86400000) : 0;
  const serverEntitled = meData?.isAdmin || meData?.status === "active" || (meData?.trialEndsAt && new Date(meData.trialEndsAt).getTime() > Date.now());
  useEffect(() => {
    if (checkoutSuccess && serverEntitled) setLocation("/prospecting");
  }, [checkoutSuccess, serverEntitled, setLocation]);

  return (
    <Layout>
      <div className="max-w-3xl space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
          <p className="text-muted-foreground mt-1">Manage your subscription and payment method</p>
        </div>
        {checkoutSuccess && !serverEntitled && <div role="status" className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">
          <div className="font-semibold">Confirming payment…</div>
          <p className="text-muted-foreground mt-1">Your payment is being verified with our server. This page will continue checking; if it takes more than a few minutes, refresh or contact support.</p>
        </div>}
        {onboarding && !serverEntitled && <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
          <div className="font-semibold">Choose a plan or redeem a trial code to continue</div>
          <p className="text-sm text-muted-foreground mt-1">Your account needs an active subscription or trial before prospecting is available.</p>
        </div>}

        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-primary" />
              <div>
                <div className="font-semibold">Subscription Status</div>
                <div className="text-muted-foreground text-sm">{user?.primaryEmailAddress?.emailAddress}</div>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>

          {trialActive && (
            <div className="flex items-start gap-3 bg-primary/10 border border-primary/30 rounded-lg p-4">
              <Sparkles className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-primary">{trialUnlimited ? "Free trial active — no expiration" : `Free trial active — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`}</div>
                <div className="text-muted-foreground text-sm mt-1">{trialUnlimited ? "You have full access with no end date." : `Full access through ${trialEndsAt!.toLocaleDateString()}. Subscribe before then to keep your account running.`}</div>
              </div>
            </div>
          )}

          {status === "suspended" && (
            <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-destructive">Account Suspended</div>
                <div className="text-muted-foreground text-sm mt-1">Your account has been suspended due to a payment issue. Please update your payment method to restore access.</div>
              </div>
            </div>
          )}

          {subscription && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Current Period Ends</div>
                <div className="font-medium mt-1">
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end * 1000).toLocaleDateString()
                    : "—"}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wide">Billing Interval</div>
                <div className="font-medium mt-1 capitalize">
                  {subscription.items?.data?.[0]?.price?.recurring?.interval ?? "Monthly"}
                </div>
              </div>
            </div>
          )}

          {subData?.subscription && (
            <Button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              variant="outline"
              className="w-full"
            >
              {portalMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Manage Billing in Stripe Portal
            </Button>
          )}
        </div>

        {!subscription && status !== "active" && !trialActive && (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Ticket className="w-5 h-5 text-primary" />
              <div>
                <div className="font-semibold">Have a trial code?</div>
                <div className="text-muted-foreground text-sm">Redeem it for full access — no card required.</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="TRIAL-XXXXXXXX"
                spellCheck={false}
                onKeyDown={(e) => { if (e.key === "Enter" && code.trim()) redeemMutation.mutate(code.trim()); }}
                className="flex-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button onClick={() => redeemMutation.mutate(code.trim())} disabled={!code.trim() || redeemMutation.isPending}>
                {redeemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem"}
              </Button>
            </div>
          </div>
        )}

        {!subscription && (
          <div className="rounded-xl border bg-card p-8 text-center space-y-3">
            <CreditCard className="w-10 h-10 text-primary mx-auto" />
            <div>
              <div className="font-semibold text-lg">Choose your plan</div>
              <div className="text-muted-foreground text-sm mt-1">
                Plans start at $249/month with a 14-day free trial — licensed per user,
                not per domain.
              </div>
            </div>
            <Link href="/pricing">
              <Button className="mt-1">View Plans &amp; Pricing</Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}

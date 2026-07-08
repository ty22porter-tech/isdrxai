import { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CreditCard, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}/api${path}`, { credentials: "include", ...options });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
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
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => apiFetch("/stripe/subscription"),
  });

  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiFetch("/stripe/products"),
  });

  const portalMutation = useMutation({
    mutationFn: () => apiFetch("/stripe/billing-portal", { method: "POST" }),
    onSuccess: (data) => { if (data.url) window.location.href = data.url; },
    onError: (err: Error) => toast({ title: "Couldn't open billing portal", description: err.message, variant: "destructive" }),
  });

  const handleCheckout = async (priceId: string) => {
    setLoadingCheckout(true);
    try {
      const data = await apiFetch("/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Couldn't start checkout", description: err?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoadingCheckout(false);
    }
  };

  const status = subData?.status ?? "trialing";
  const subscription = subData?.subscription;
  const products: any[] = productsData?.products ?? [];

  return (
    <Layout>
      <div className="max-w-3xl space-y-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
          <p className="text-muted-foreground mt-1">Manage your subscription and payment method</p>
        </div>

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

        {!subscription && products.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Choose a Plan</h3>
            <div className="grid gap-4">
              {products.map((product: any) =>
                product.prices?.map((price: any) => (
                  <div key={price.id} className="rounded-xl border bg-card p-6 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-lg">{product.name}</div>
                      {product.description && (
                        <div className="text-muted-foreground text-sm mt-1">{product.description}</div>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        {["Unlimited Prospects", "AI Email Generation", "Priority Support"].map((f) => (
                          <div key={f} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-6">
                      <div className="font-bold text-2xl">
                        ${((price.unitAmount ?? 0) / 100).toFixed(0)}
                        <span className="text-muted-foreground text-base font-normal">/{price.recurring?.interval ?? "mo"}</span>
                      </div>
                      <Button
                        className="mt-3"
                        onClick={() => handleCheckout(price.id)}
                        disabled={loadingCheckout}
                      >
                        {loadingCheckout ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {!subscription && products.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center">
            <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <div className="text-muted-foreground">No plans available yet. Check back soon.</div>
          </div>
        )}
      </div>
    </Layout>
  );
}

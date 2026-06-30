import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Settings, Mail, Calendar, CheckCircle2, AlertCircle, Loader2, ExternalLink, Building2, Zap, User, Phone, MapPin } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}/api${path}`, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `API error ${res.status}`);
  return data;
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const qc = useQueryClient();

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: isLoaded && !!user,
  });

  const [businessName, setBusinessName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (me) {
      setBusinessName(me.businessName ?? "");
      setSenderName(me.senderName ?? "");
      setPhone(me.phone ?? "");
      setBusinessAddress(me.businessAddress ?? "");
      setReplyEmail(me.outreachEmail ?? "");
      setCalendlyUrl(me.calendlyUrl ?? "");
    }
  }, [me]);

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/users/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          senderName,
          phone,
          businessAddress,
          outreachEmail: replyEmail,
          calendlyUrl,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setSaveMsg({ type: "ok", text: "Settings saved!" });
      setTimeout(() => setSaveMsg(null), 3000);
    },
    onError: (err: Error) => {
      setSaveMsg({ type: "err", text: err.message });
    },
  });

  const allSet = !!(me?.platformEmailReady && me?.outreachEmail);

  return (
    <Layout>
      <div className="max-w-xl space-y-8">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
            <p className="text-muted-foreground mt-0.5">Configure your autopilot in 3 fields — no passwords needed</p>
          </div>
        </div>

        {/* How it works banner */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex gap-4">
          <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">How email sending works</p>
            <p className="text-sm text-muted-foreground mt-1">
              Emails go out through our platform — no Gmail setup, no app passwords, no SMTP.
              Prospects see your business name as the sender and replies land directly in your inbox.
            </p>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex gap-3">
          <div className={`flex-1 rounded-xl border p-4 flex items-center gap-3 ${me?.platformEmailReady ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
            <Mail className={`w-5 h-5 shrink-0 ${me?.platformEmailReady ? "text-emerald-400" : "text-amber-400"}`} />
            <div className="min-w-0">
              <div className={`text-xs font-semibold ${me?.platformEmailReady ? "text-emerald-400" : "text-amber-400"}`}>
                {me?.platformEmailReady ? "Platform email ready" : "Platform email not set up"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {me?.platformEmailReady ? `Sending from ${me?.platformFromEmail ?? "platform"}` : "Admin needs to add RESEND_API_KEY"}
              </div>
            </div>
          </div>
          <div className={`flex-1 rounded-xl border p-4 flex items-center gap-3 ${me?.calendlyUrl ? "border-emerald-500/30 bg-emerald-500/10" : "border-border bg-card"}`}>
            <Calendar className={`w-5 h-5 shrink-0 ${me?.calendlyUrl ? "text-emerald-400" : "text-muted-foreground"}`} />
            <div>
              <div className={`text-xs font-semibold ${me?.calendlyUrl ? "text-emerald-400" : "text-muted-foreground"}`}>
                {me?.calendlyUrl ? "Calendly connected" : "Calendly not set"}
              </div>
              <div className="text-xs text-muted-foreground">{me?.calendlyUrl ? "Booking link ready" : "Add your link below"}</div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Business Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. SparkClean Commercial Services"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">This is what prospects see in the "From" field of every email.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Your Name
            </label>
            <input
              type="text"
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
              placeholder="e.g. Jordan Lee"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">Signed at the bottom of every email so it feels personal — no more [Your Name] placeholders.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. (555) 123-4567"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">Added to your email signature so prospects can call you directly.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" /> Your Email Address
            </label>
            <input
              type="email"
              value={replyEmail}
              onChange={e => setReplyEmail(e.target.value)}
              placeholder="you@yourcompany.com"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">When prospects hit Reply, it goes straight to this inbox.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Business Mailing Address
            </label>
            <textarea
              value={businessAddress}
              onChange={e => setBusinessAddress(e.target.value)}
              placeholder="123 Main St, Suite 100, Springfield, IL 62701"
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Required by anti-spam law (CAN-SPAM) — a real postal address must appear in every marketing email. Including it also keeps you out of the spam folder.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Calendly Booking Link
            </label>
            <input
              type="url"
              value={calendlyUrl}
              onChange={e => setCalendlyUrl(e.target.value)}
              placeholder="https://calendly.com/your-name/walkthrough"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              When a prospect shows interest, the AI automatically sends this link.{" "}
              {!me?.calendlyUrl && (
                <a href="https://calendly.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 inline-flex items-center gap-0.5">
                  Create a free account <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </p>
          </div>

          {saveMsg && (
            <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm ${saveMsg.type === "ok" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
              {saveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              {saveMsg.text}
            </div>
          )}

          <Button
            className="w-full"
            disabled={mutation.isPending || isLoading}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save Settings"}
          </Button>
        </div>

        {/* Admin note */}
        {!me?.platformEmailReady && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" /> One-time platform setup (admin only)
            </p>
            <p className="text-sm text-muted-foreground">To enable email sending, add these two secrets to your project:</p>
            <div className="rounded-lg bg-muted/60 p-3 space-y-1.5 font-mono text-xs">
              <div><span className="text-primary">RESEND_API_KEY</span> <span className="text-muted-foreground">= re_xxxxxxxxxxxx</span></div>
              <div><span className="text-primary">RESEND_FROM_EMAIL</span> <span className="text-muted-foreground">= outreach@yourdomain.com</span></div>
            </div>
            <a
              href="https://resend.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
            >
              Get your free Resend API key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </Layout>
  );
}

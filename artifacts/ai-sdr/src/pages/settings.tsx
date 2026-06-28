import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Settings, Mail, Calendar, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, ExternalLink } from "lucide-react";

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

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: isLoaded && !!user,
  });

  const [provider, setProvider] = useState<"gmail" | "outlook">("gmail");
  const [outreachEmail, setOutreachEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useState(() => {
    if (me) {
      setProvider((me.emailProvider as "gmail" | "outlook") ?? "gmail");
      setOutreachEmail(me.outreachEmail ?? "");
      setCalendlyUrl(me.calendlyUrl ?? "");
    }
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/users/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailProvider: provider,
          outreachEmail: outreachEmail || undefined,
          outreachAppPassword: appPassword || undefined,
          calendlyUrl,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setSaveMsg({ type: "ok", text: "Settings saved — email connection verified!" });
      setAppPassword("");
      setTimeout(() => setSaveMsg(null), 4000);
    },
    onError: (err: Error) => {
      setSaveMsg({ type: "err", text: err.message });
    },
  });

  const gmailInstructions = [
    "Go to myaccount.google.com → Security",
    "Enable 2-Step Verification if not already on",
    'Search for "App passwords" in the search bar',
    'Select "Mail" and generate a password',
    "Copy the 16-character password and paste it below",
  ];

  const outlookInstructions = [
    "Go to account.microsoft.com → Security",
    "Click 'Advanced security options'",
    "Enable two-step verification",
    "Under App passwords, create a new one",
    "Copy the password and paste it below",
  ];

  const instructions = provider === "gmail" ? gmailInstructions : outlookInstructions;

  return (
    <Layout>
      <div className="max-w-2xl space-y-8">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Autopilot Settings</h2>
            <p className="text-muted-foreground mt-0.5">Connect your email and Calendly to enable autopilot outreach</p>
          </div>
        </div>

        {/* Connection status */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${me?.hasEmailCredentials ? "border-emerald-500/30 bg-emerald-500/10" : "border-border bg-card"}`}>
            <Mail className={`w-5 h-5 ${me?.hasEmailCredentials ? "text-emerald-400" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">{me?.hasEmailCredentials ? "Email connected" : "Email not connected"}</div>
              <div className="text-xs text-muted-foreground">{me?.outreachEmail ?? "No email set"}</div>
            </div>
            {me?.hasEmailCredentials && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
          </div>
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${me?.calendlyUrl ? "border-emerald-500/30 bg-emerald-500/10" : "border-border bg-card"}`}>
            <Calendar className={`w-5 h-5 ${me?.calendlyUrl ? "text-emerald-400" : "text-muted-foreground"}`} />
            <div>
              <div className="text-sm font-medium">{me?.calendlyUrl ? "Calendly connected" : "Calendly not set"}</div>
              <div className="text-xs text-muted-foreground truncate">{me?.calendlyUrl ? "Booking link ready" : "No booking link"}</div>
            </div>
            {me?.calendlyUrl && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
          </div>
        </div>

        {/* Email settings */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <h3 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Email Account</h3>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Email Provider</label>
            <div className="flex gap-2">
              {(["gmail", "outlook"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${provider === p ? "bg-primary/10 border-primary/50 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                >
                  {p === "gmail" ? "Gmail" : "Outlook"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Your Email Address</label>
            <input
              type="email"
              value={outreachEmail}
              onChange={e => setOutreachEmail(e.target.value)}
              placeholder={provider === "gmail" ? "you@gmail.com" : "you@outlook.com"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              App Password <span className="text-xs text-muted-foreground/60">(not your regular password)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={appPassword}
                onChange={e => setAppPassword(e.target.value)}
                placeholder={me?.hasEmailCredentials ? "••••••••••••••••  (saved)" : "16-character app password"}
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
              />
              <button
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/60 p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How to get your app password</p>
            <ol className="space-y-1">
              {instructions.map((step, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
            <a
              href={provider === "gmail" ? "https://myaccount.google.com/security" : "https://account.microsoft.com/security"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mt-1"
            >
              Open {provider === "gmail" ? "Google" : "Microsoft"} security settings
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Calendly */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Calendly Booking Link</h3>
          <p className="text-sm text-muted-foreground">When a prospect replies with interest, the autopilot automatically sends them your Calendly link to book a walkthrough.</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Your Calendly URL</label>
            <input
              type="url"
              value={calendlyUrl}
              onChange={e => setCalendlyUrl(e.target.value)}
              placeholder="https://calendly.com/your-name/walkthrough"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {!me?.calendlyUrl && (
            <a href="https://calendly.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              Create a free Calendly account <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {saveMsg && (
          <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm ${saveMsg.type === "ok" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
            {saveMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {saveMsg.text}
          </div>
        )}

        <Button
          className="w-full"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying & saving…</> : "Save Settings"}
        </Button>
      </div>
    </Layout>
  );
}

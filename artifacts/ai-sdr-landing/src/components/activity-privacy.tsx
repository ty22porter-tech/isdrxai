import { useState, useSyncExternalStore } from "react";
import { ShieldCheck, X, Loader2 } from "lucide-react";
import {
  disableActivityTracking,
  enableActivityTracking,
  getActivityConsent,
  isActivityServerReady,
  subscribeActivityConsent,
} from "@/lib/visitor-activity";

export function ActivityPrivacyControl({
  side = "right",
  privacyHref = "/privacy",
}: {
  side?: "left" | "right";
  privacyHref?: string;
}) {
  const consent = useSyncExternalStore(subscribeActivityConsent, getActivityConsent, () => null);
  const ready = useSyncExternalStore(subscribeActivityConsent, isActivityServerReady, () => false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"allow" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "allow" | "decline") => {
    setBusy(action);
    setError(null);
    try {
      if (action === "allow") await enableActivityTracking();
      else await disableActivityTracking();
    } catch (err) {
      const detail = err instanceof Error && !/^Request failed/.test(err.message) ? ` ${err.message}` : "";
      setError(
        action === "allow"
          ? `Couldn't turn on activity linking. Nothing is being recorded.${detail || " Please try again."}`
          : `Linking is off in this browser, but we couldn't confirm this session's activity was removed.${detail || " Please try again."}`,
      );
    } finally {
      setBusy(null);
    }
  };

  const status = consent === "granted" ? (ready ? "On" : "Reconnecting") : "Off";
  const pos = side === "left" ? "left-4 sm:left-6" : "right-4 sm:right-6";

  return (
    <div className={`fixed bottom-4 sm:bottom-6 ${pos} z-40`}>
      {open && (
        <div
          role="dialog"
          aria-label="Activity privacy"
          className={`absolute bottom-12 ${side === "left" ? "left-0" : "right-0"} w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card text-card-foreground shadow-2xl p-4 text-sm`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Activity privacy
            </h2>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-muted-foreground leading-relaxed">
            If you allow it, your site visits and key clicks (like Book a Demo or Pricing) in this browser can be
            linked to your signed-in account or to details you submit in our demo or contact forms, and shown to
            iSDRX administrators. This is separate from our general anonymous analytics. It's off unless you turn it on, and lasts up to 30 days. Turning it off removes the activity recorded for this browser session; it doesn't remove earlier sessions, your account, or demo/contact requests you've submitted.
          </p>
          <p className="mt-2 text-xs">
            Status: <span className="font-medium" aria-live="polite">{status}</span>
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run("allow")}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              {busy === "allow" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {consent === "granted" && !ready ? "Reconnect" : "Allow"}
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => run("decline")}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {busy === "decline" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {consent === "granted" ? "Turn off & remove session activity" : "Decline"}
            </button>
          </div>
          <a href={privacyHref} className="mt-3 inline-block text-xs text-primary hover:underline">
            How this works and how to revoke
          </a>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card/90 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground shadow-md hover:text-foreground"
      >
        <ShieldCheck className="w-3.5 h-3.5" /> Activity privacy: {status}
      </button>
    </div>
  );
}

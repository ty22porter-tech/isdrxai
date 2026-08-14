import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, CheckCircle2, MailX } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UnsubInfo {
  companyName: string;
  email: string;
  businessName: string;
  alreadyUnsubscribed: boolean;
}

export default function Unsubscribe() {
  const [, params] = useRoute("/unsubscribe/:token");
  const token = params?.token ?? "";

  const [info, setInfo] = useState<UnsubInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/unsubscribe/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "This unsubscribe link is invalid or expired.");
        }
        return res.json();
      })
      .then((data: UnsubInfo) => {
        setInfo(data);
        if (data.alreadyUnsubscribed) setDone(true);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleUnsubscribe = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setDone(true);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p>Loading…</p>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <MailX className="w-10 h-10 text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-900">Link not found</h1>
            <p className="text-sm text-slate-500">{loadError}</p>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <h1 className="text-lg font-semibold text-slate-900">You're unsubscribed</h1>
            <p className="text-sm text-slate-500">
              {info?.email} will no longer receive outreach emails
              {info?.businessName ? ` from ${info.businessName}` : ""}.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <MailX className="w-10 h-10 text-slate-400" />
            <h1 className="text-lg font-semibold text-slate-900">Unsubscribe from emails</h1>
            <p className="text-sm text-slate-500">
              You're about to unsubscribe <span className="font-medium text-slate-700">{info?.email}</span>
              {info?.businessName ? <> from emails sent by <span className="font-medium text-slate-700">{info.businessName}</span></> : null}.
              You won't receive any further outreach.
            </p>
            <button
              onClick={handleUnsubscribe}
              disabled={submitting}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Unsubscribe me
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

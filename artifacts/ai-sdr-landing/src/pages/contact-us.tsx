import { useState } from "react";
import { Link } from "wouter";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

const emptyForm = { firstName: "", lastName: "", company: "", email: "", phone: "", message: "", website: "" };

export default function ContactUsPage() {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const update = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus("idle");
    try {
      const response = await fetch("/api/contact-us", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your request could not be sent. Please try again.");
      setStatus("success");
      trackEvent("contact_request_completed", { source: "ai_plus" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your request could not be sent. Please try again.");
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="min-h-screen bg-background text-white py-16 px-6">
    <div className="max-w-2xl mx-auto">
      <Link href="/" className="text-sm text-accent hover:text-white">← Back to iSDRX AI</Link>
      <div className="mt-10 rounded-2xl border border-white/10 bg-card p-6 sm:p-10 shadow-2xl">
        <p className="text-primary font-semibold uppercase tracking-wider text-sm">AI+ Service</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold">Contact us</h1>
        <p className="mt-3 text-muted-foreground">Tell us about your outreach goals and an agent will follow up.</p>
        {status === "success" ? <div role="status" className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" /><h2 className="font-semibold text-lg">We received your request.</h2>
          <p className="mt-2 text-sm text-muted-foreground">An agent will follow up with you shortly.</p>
        </div> : <form onSubmit={submit} className="mt-8 space-y-5">
          {status === "error" && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} required />
            <Field label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} required />
          </div>
          <Field label="Company name" value={form.company} onChange={(v) => update("company", v)} />
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} required />
            <Field label="Phone" type="tel" value={form.phone} onChange={(v) => update("phone", v)} required />
          </div>
          <div><label htmlFor="message" className="block text-sm font-medium mb-2">Message <span className="text-muted-foreground">(optional)</span></label><textarea id="message" maxLength={2000} value={form.message} onChange={(e) => update("message", e.target.value)} className="w-full min-h-36 rounded-lg border border-white/10 bg-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <p className="text-right text-xs text-muted-foreground mt-1" aria-live="polite">{form.message.length}/2000</p></div>
          <div className="hidden" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update("website", e.target.value)} /></div>
          <Button type="submit" disabled={submitting} className="w-full h-12">{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{submitting ? "Sending request…" : "Send request"}</Button>
        </form>}
      </div>
    </div>
  </main>;
}

function Field({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  const id = label.toLowerCase().replace(/\s/g, "-");
  return <div><label htmlFor={id} className="block text-sm font-medium mb-2">{label}{required && <span className="text-primary"> *</span>}</label><input id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" /></div>;
}
import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, CheckCircle2, Upload, X, Building2, CalendarDays } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ScheduleInfo {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  businessName: string;
  calendlyUrl: string | null;
  vertical?: string;
}

const SCHEDULE_COPY = {
  janitorial: {
    headline: "Schedule your free walkthrough",
    intro: (b: string, c: string) => `${b} would love to learn about ${c}'s cleaning needs. Answer a few quick questions, then pick a time below.`,
    offerNoun: "walkthrough",
    providerQuestion: "Who is your current cleaning provider?",
    frequencyQuestion: "Days per week currently cleaned",
    frequencyPlaceholder: "e.g. 5",
    frequencyMax: 7,
    timesQuestion: "When is it cleaned?",
    locationQuestion: "How many locations need cleaning?",
    sizeLabel: "Cleanable square footage per location",
    sizePlaceholder: "Cleanable sq ft",
    uploadLabel: "Floor plans (optional)",
    uploadHint: "Click to upload (PDF or images, 25MB total)",
    uploadLimitError: "Floor plans exceed the 25MB total limit.",
  },
  it_services: {
    headline: "Schedule your free IT assessment",
    intro: (b: string, c: string) => `${b} would love to learn about ${c}'s IT environment. Answer a few quick questions, then pick a time below.`,
    offerNoun: "IT assessment",
    providerQuestion: "Who currently manages your IT?",
    frequencyQuestion: "How many employees use computers?",
    frequencyPlaceholder: "e.g. 25",
    frequencyMax: 100000,
    timesQuestion: "Best times to reach you?",
    locationQuestion: "How many locations have IT equipment?",
    sizeLabel: "Workstations and servers per location",
    sizePlaceholder: "Total workstations + servers",
    uploadLabel: "Network diagrams or inventory lists (optional)",
    uploadHint: "Click to upload (PDF or images, 25MB total)",
    uploadLimitError: "Uploads exceed the 25MB total limit.",
  },
} as const;

interface LocationRow {
  label: string;
  squareFootage: string;
}

interface PendingFile {
  filename: string;
  contentBase64: string;
  size: number;
}

const SERVICE_TIME_OPTIONS = ["Days", "Evenings", "Weekends"];
const IT_INTEREST_OPTIONS = [
  "Co-Managed IT",
  "Full Managed IT",
  "Business Continuity",
  "Cloud Infrastructure",
  "Cybersecurity",
  "AI",
  "Managed Workstation",
  "Mobile Device Management",
  "Email Services",
  "Virtualization",
];
const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Schedule() {
  const [, params] = useRoute("/schedule/:token");
  const token = params?.token ?? "";

  const [info, setInfo] = useState<ScheduleInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentProvider, setCurrentProvider] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [serviceTimes, setServiceTimes] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [locationCount, setLocationCount] = useState("1");
  const [locations, setLocations] = useState<LocationRow[]>([{ label: "", squareFootage: "" }]);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [calendlyUrl, setCalendlyUrl] = useState<string | null>(null);
  const calendlyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("Invalid link.");
      setLoading(false);
      return;
    }
    fetch(`/api/schedule/${token}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as any).error || "This link is no longer valid.");
        return data as ScheduleInfo;
      })
      .then((data) => {
        setInfo(data);
        setContactName(data.contactName || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
        setCalendlyUrl(data.calendlyUrl);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const visibleLocations = Math.min(parseInt(locationCount, 10) || 1, 3);

  useEffect(() => {
    setLocations((prev) => {
      const next = [...prev];
      while (next.length < visibleLocations) next.push({ label: "", squareFootage: "" });
      return next.slice(0, visibleLocations);
    });
  }, [visibleLocations]);

  // Load Calendly widget script once we have a URL and the form is submitted.
  useEffect(() => {
    if (!submitted || !calendlyUrl) return;
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://assets.calendly.com/assets/external/widget.js"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://assets.calendly.com/assets/external/widget.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [submitted, calendlyUrl]);

  function toggleServiceTime(opt: string) {
    setServiceTimes((prev) => (prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]));
  }

  function toggleInterest(opt: string) {
    setInterests((prev) => (prev.includes(opt) ? prev.filter((t) => t !== opt) : [...prev, opt]));
  }

  function updateLocation(idx: number, field: keyof LocationRow, value: string) {
    setLocations((prev) => prev.map((loc, i) => (i === idx ? { ...loc, [field]: value } : loc)));
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setSubmitError(null);
    const incoming = Array.from(fileList);
    const accepted: PendingFile[] = [];
    let total = files.reduce((s, f) => s + f.size, 0);
    for (const file of incoming) {
      if (files.length + accepted.length >= MAX_FILES) break;
      total += file.size;
      if (total > MAX_TOTAL_BYTES) {
        setSubmitError("Uploads exceed the 25MB total limit.");
        break;
      }
      const dataUrl = await readFileAsBase64(file);
      accepted.push({ filename: file.name, contentBase64: dataUrl, size: file.size });
    }
    setFiles((prev) => [...prev, ...accepted]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/schedule/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName,
          email,
          phone,
          currentProvider,
          daysPerWeek,
          serviceTimes,
          interests,
          locationCount,
          locations,
          additionalNotes,
          files: files.map((f) => ({ filename: f.filename, contentBase64: f.contentBase64 })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || "Failed to submit. Please try again.");
      setCalendlyUrl((data as any).calendlyUrl ?? calendlyUrl);
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-white">Link unavailable</h1>
          <p className="mt-2 text-slate-400">{loadError ?? "This scheduling link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  const isIT = info.vertical === "it_services";
  const copy = isIT ? SCHEDULE_COPY.it_services : SCHEDULE_COPY.janitorial;

  const inputClass =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
  const labelClass = "block text-sm font-medium text-slate-300 mb-1.5";

  return (
    <div className="min-h-[100dvh] bg-slate-950 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 ring-1 ring-sky-500/30">
            <Building2 className="h-6 w-6 text-sky-400" />
          </div>
          <h1 className="text-3xl font-bold text-white">{copy.headline}</h1>
          <p className="mt-2 text-slate-400">
            {copy.intro(info.businessName, info.companyName)}
          </p>
        </div>

        {submitted ? (
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-700/40 bg-emerald-900/20 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-emerald-300">Thanks! Your details were sent.</p>
                <p className="text-sm text-emerald-200/80">
                  {calendlyUrl
                    ? `Pick a time below to lock in your ${copy.offerNoun}.`
                    : `${info.businessName} will reach out shortly to confirm your ${copy.offerNoun}.`}
                </p>
              </div>
            </div>

            {calendlyUrl && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-2">
                <div className="mb-2 flex items-center gap-2 px-3 pt-3 text-slate-200">
                  <CalendarDays className="h-5 w-5 text-sky-400" />
                  <span className="font-semibold">Choose a time</span>
                </div>
                <div
                  ref={calendlyRef}
                  className="calendly-inline-widget"
                  data-url={calendlyUrl}
                  style={{ minWidth: "320px", height: "660px" }}
                />
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-700/50 bg-slate-900 p-6 shadow-2xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Your name</label>
                <input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Company</label>
                <input className={inputClass} value={info.companyName} disabled />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" />
              </div>
            </div>

            <div>
              <label className={labelClass}>{copy.providerQuestion}</label>
              <input
                className={inputClass}
                value={currentProvider}
                onChange={(e) => setCurrentProvider(e.target.value)}
                placeholder="Provider name, or “None”"
              />
            </div>

            {isIT && (
              <div>
                <label className={labelClass}>I'm interested in</label>
                <p className="text-xs text-slate-500 mb-2">Select all that apply.</p>
                <div className="flex flex-wrap gap-2">
                  {IT_INTEREST_OPTIONS.map((opt) => {
                    const active = interests.includes(opt);
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => toggleInterest(opt)}
                        aria-pressed={active}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                          active
                            ? "bg-sky-500 text-white"
                            : "border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{copy.frequencyQuestion}</label>
                <input
                  type="number"
                  min={0}
                  max={copy.frequencyMax}
                  className={inputClass}
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(e.target.value)}
                  placeholder={copy.frequencyPlaceholder}
                />
              </div>
              <div>
                <label className={labelClass}>{copy.timesQuestion}</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SERVICE_TIME_OPTIONS.map((opt) => {
                    const active = serviceTimes.includes(opt);
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => toggleServiceTime(opt)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                          active
                            ? "bg-sky-500 text-white"
                            : "border border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>{copy.locationQuestion}</label>
              <input
                type="number"
                min={1}
                className={`${inputClass} sm:max-w-[140px]`}
                value={locationCount}
                onChange={(e) => setLocationCount(e.target.value)}
              />
            </div>

            {!isIT && (
              <div className="space-y-3">
                <label className={labelClass}>{copy.sizeLabel}</label>
                {locations.map((loc, idx) => (
                  <div key={idx} className="grid gap-3 sm:grid-cols-2">
                    <input
                      className={inputClass}
                      value={loc.label}
                      onChange={(e) => updateLocation(idx, "label", e.target.value)}
                      placeholder={`Location ${idx + 1} name / address`}
                    />
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={loc.squareFootage}
                      onChange={(e) => updateLocation(idx, "squareFootage", e.target.value)}
                      placeholder={copy.sizePlaceholder}
                    />
                  </div>
                ))}
                {(parseInt(locationCount, 10) || 1) > 3 && (
                  <p className="text-sm text-amber-300/90">
                    You have more than 3 locations — list your first 3 here and we'll call to discuss the
                    rest.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>{copy.uploadLabel}</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-800/50 px-4 py-6 text-slate-400 hover:border-sky-500/60 hover:text-slate-300">
                <Upload className="h-5 w-5" />
                <span>Click to upload (PDF or images, 25MB total)</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300"
                    >
                      <span className="truncate">{f.filename}</span>
                      <button type="button" onClick={() => removeFile(idx)} className="text-slate-500 hover:text-red-400">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className={labelClass}>Anything else we should know? (optional)</label>
              <textarea
                className={`${inputClass} min-h-[80px] resize-y`}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </div>

            {submitError && (
              <p className="rounded-lg border border-red-700/50 bg-red-900/30 px-3 py-2 text-sm text-red-300">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-400 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {submitting ? "Submitting…" : "Submit & pick a time"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

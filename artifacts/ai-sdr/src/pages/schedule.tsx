import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, CheckCircle2, Upload, X, Building2, CalendarDays, ArrowLeft, FileText, ExternalLink, AlertTriangle, RotateCw } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

import type { RecruitingQualification } from "@workspace/api-client-react";

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
  ai_sales_automation: {
    headline: "Discuss your sales workflow",
    intro: (b: string, c: string) => `${b} would like to understand ${c}'s prospecting and follow-up. Share what you know, then select a time below.`,
    offerNoun: "sales automation conversation", providerQuestion: "How is prospecting and follow-up handled today?",
    frequencyQuestion: "People involved in prospecting (if disclosed)", frequencyPlaceholder: "Optional", frequencyMax: 100000,
    timesQuestion: "Best times to reach you?", locationQuestion: "How many teams or locations are involved?",
    sizeLabel: "Sales workflow by location", sizePlaceholder: "Optional",
    uploadLabel: "Workflow or cost comparison (optional)", uploadHint: "Click to upload (PDF or images, 25MB total)", uploadLimitError: "Uploads exceed the 25MB total limit.",
  },
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
  recruiting_staffing: {
    headline: "Schedule a hiring-needs discovery call",
    intro: (b: string, c: string) => `${b} would like to understand ${c}'s hiring needs. Share what you can, then request a time below. Nothing is booked until the calendar confirms it.`,
    offerNoun: "hiring-needs discovery call",
    providerQuestion: "Do you currently work with any recruiting or staffing agencies?",
    frequencyQuestion: "Roughly how many open roles do you have?",
    frequencyPlaceholder: "e.g. 4",
    frequencyMax: 100000,
    timesQuestion: "Best times to reach you?",
    locationQuestion: "How many hiring locations?",
    sizeLabel: "Hiring locations",
    sizePlaceholder: "",
    uploadLabel: "Job descriptions (optional)",
    uploadHint: "Click to upload (PDF or images, 25MB total)",
    uploadLimitError: "Uploads exceed the 25MB total limit.",
  },
} as const;

const RECRUITING_SCHEDULE_FIELDS: { key: keyof RecruitingQualification; label: string; placeholder: string }[] = [
  { key: "roles", label: "Roles you are hiring for", placeholder: "e.g. RN, maintenance technician" },
  { key: "hiresNeeded", label: "Number of hires", placeholder: "e.g. 3" },
  { key: "targetStartDates", label: "Target start dates and urgency", placeholder: "e.g. by August 1" },
  { key: "skillsCredentials", label: "Required skills or credentials", placeholder: "Licenses, certifications" },
  { key: "shiftsLocations", label: "Shifts and locations", placeholder: "e.g. 2nd shift, Tulsa plant" },
  { key: "employmentType", label: "Employment type", placeholder: "Direct hire, temporary, contract" },
  { key: "compensation", label: "Compensation range (optional)", placeholder: "" },
  { key: "hiringChallenges", label: "Biggest hiring challenge", placeholder: "" },
  { key: "currentApproach", label: "How you recruit today", placeholder: "Internal team, job boards, referrals" },
  { key: "vendorRequirements", label: "Vendor requirements (optional)", placeholder: "Insurance, MSA, VMS" },
  { key: "decisionProcess", label: "Who decides on staffing vendors (optional)", placeholder: "" },
  { key: "agencyRenewalDates", label: "Existing agency agreement renewal dates (optional)", placeholder: "" },
];

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

type CalendarErrorReason = "widget_load_failed" | "widget_initialization_failed" | "missing_calendar_url";

function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Fire-and-forget telemetry. Never throws, never blocks booking, never sends PII.
function reportCalendarActivity(token: string, event: "click" | "error", reason?: CalendarErrorReason) {
  if (!token) return;
  try {
    const body: { eventId: string; event: "click" | "error"; reason?: CalendarErrorReason } = { eventId: newEventId(), event };
    if (event === "error" && reason) body.reason = reason;
    fetch(`/api/schedule/${encodeURIComponent(token)}/calendar-activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function CalendlyEmbed({ url, token }: { url: string; token: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetError, setWidgetError] = useState<CalendarErrorReason | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [canEmbed, setCanEmbed] = useState(() => window.matchMedia("(min-width: 380px)").matches);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 380px)");
    const update = () => setCanEmbed(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!canEmbed) return;
    let cancelled = false;
    const fail = (reason: CalendarErrorReason) => {
      if (cancelled) return;
      setWidgetError(reason);
      reportCalendarActivity(token, "error", reason);
    };
    const initialize = () => {
      if (cancelled) return;
      const calendly = (window as any).Calendly;
      if (!containerRef.current) return;
      if (!calendly?.initInlineWidget) {
        fail("widget_initialization_failed");
        return;
      }
      try {
        containerRef.current.replaceChildren();
        calendly.initInlineWidget({ url, parentElement: containerRef.current });
      } catch {
        fail("widget_initialization_failed");
      }
    };
    const onError = () => fail("widget_load_failed");

    const src = "https://assets.calendly.com/assets/external/widget.js";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing && (window as any).Calendly?.initInlineWidget) {
      initialize();
      return () => { cancelled = true; };
    }
    // A previously failed script tag would never fire load again; replace it on retry.
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", initialize, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.removeEventListener("load", initialize);
      script.removeEventListener("error", onError);
    };
  }, [url, canEmbed, attempt, token]);

  const openLink = (
    <a
      href={url}
      target={widgetError ? "_blank" : undefined}
      rel={widgetError ? "noopener noreferrer" : undefined}
      onClick={() => reportCalendarActivity(token, "click")}
      className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#234d73] px-4 py-3 font-semibold text-white transition hover:bg-[#183b59] focus:outline-none focus:ring-2 focus:ring-[#234d73]"
    >
      Open Calendly
      <ExternalLink className="h-4 w-4" />
    </a>
  );

  if (canEmbed && widgetError) {
    return (
      <div className="p-6 text-center" role="alert">
        <AlertTriangle className="mx-auto h-6 w-6 text-amber-600" />
        <p className="mt-2 font-semibold text-[#172b3a]">The booking calendar didn't load.</p>
        <p className="mt-1 text-sm leading-6 text-[#65727a]">
          This can happen with ad blockers or a flaky connection. Try again, or open Calendly directly.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => { setWidgetError(null); setAttempt((a) => a + 1); }}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#d8d6cf] bg-[#fffdfa] px-4 py-3 font-semibold text-[#234d73] transition hover:border-[#234d73] focus:outline-none focus:ring-2 focus:ring-[#234d73]"
          >
            <RotateCw className="h-4 w-4" />
            Try again
          </button>
          {openLink}
        </div>
      </div>
    );
  }

  if (!canEmbed) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm leading-6 text-[#65727a]">
          Calendly opens in its mobile booking page so every available time is easy to view.
        </p>
        {openLink}
      </div>
    );
  }

  return <div ref={containerRef} className="min-w-[320px]" style={{ height: "660px" }} />;
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
  const [recruitingQualification, setRecruitingQualification] = useState<RecruitingQualification>({});
  const [files, setFiles] = useState<PendingFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [calendlyUrl, setCalendlyUrl] = useState<string | null>(null);
  const [path, setPath] = useState<"choice" | "questionnaire" | "calendly">("choice");

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

  function chooseQuestionnaire() {
    setPath("questionnaire");
    fetch(`/api/schedule/${token}/questionnaire-opened`, { method: "POST" }).catch(() => {
      // Engagement tracking must never block the prospect from continuing.
    });
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
          ...(info?.vertical === "recruiting_staffing"
            ? { recruitingQualification: Object.fromEntries(
                Object.entries(recruitingQualification).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v),
              ) }
            : {}),
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
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f3e9]">
        <Loader2 className="h-8 w-8 animate-spin text-[#234d73]" />
      </div>
    );
  }

  if (loadError || !info) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f7f3e9] px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-[#172b3a]">Link unavailable</h1>
          <p className="mt-2 text-[#65727a]">{loadError ?? "This scheduling link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  const isIT = info.vertical === "it_services";
  const isRecruiting = info.vertical === "recruiting_staffing";
  const copy = info.vertical === "ai_sales_automation" ? SCHEDULE_COPY.ai_sales_automation : isRecruiting ? SCHEDULE_COPY.recruiting_staffing : isIT ? SCHEDULE_COPY.it_services : SCHEDULE_COPY.janitorial;

  const inputClass =
    "w-full rounded-lg border border-[#d8d6cf] bg-[#fffdfa] px-3 py-2 text-[#172b3a] placeholder-[#8a9295] focus:border-[#234d73] focus:outline-none focus:ring-2 focus:ring-[#234d73]/30";
  const labelClass = "block text-sm font-medium text-[#43545e] mb-1.5";

  return (
    <div className="min-h-[100dvh] bg-[#f7f3e9] py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#234d73]/10 ring-1 ring-[#234d73]/30">
            <Building2 className="h-6 w-6 text-[#234d73]" />
          </div>
          <h1 className="text-3xl font-bold tracking-[-.03em] text-[#172b3a]">{copy.headline}</h1>
          <p className="mt-2 text-[#65727a]">
            {path === "choice"
              ? `Choose the next step that works best for you and ${info.companyName}.`
              : path === "calendly"
                ? `Pick a time below for your ${copy.offerNoun} with ${info.businessName}.`
                : copy.intro(info.businessName, info.companyName)}
          </p>
        </div>

        {path === "choice" ? (
          <div className="grid gap-4 sm:grid-cols-2" role="group" aria-label="Choose how to schedule">
            <button
              type="button"
              onClick={chooseQuestionnaire}
              className="group rounded-2xl border border-[#d8d6cf] bg-[#fffdfa] p-6 text-left shadow-[0_10px_30px_rgba(30,45,53,.05)] transition hover:border-[#234d73]/60 hover:shadow-[0_12px_32px_rgba(30,45,53,.08)] focus:outline-none focus:ring-2 focus:ring-[#234d73]"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#234d73]/10 text-[#234d73] ring-1 ring-[#234d73]/30">
                <FileText className="h-5 w-5" />
              </span>
              <span className="block text-lg font-semibold text-[#172b3a]">Fill out the questionnaire</span>
              <span className="mt-2 block text-sm leading-6 text-[#65727a]">
                Share a few details first so {info.businessName} can prepare for your {copy.offerNoun}.
              </span>
              <span className="mt-5 block text-sm font-semibold text-[#234d73] group-hover:text-[#183b59]">
                Answer questions, then choose a time
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!calendlyUrl) return;
                reportCalendarActivity(token, "click");
                setPath("calendly");
              }}
              disabled={!calendlyUrl}
              className="group rounded-2xl border border-[#d8d6cf] bg-[#fffdfa] p-6 text-left shadow-[0_10px_30px_rgba(30,45,53,.05)] transition hover:border-[#315f86]/60 hover:shadow-[0_12px_32px_rgba(30,45,53,.08)] focus:outline-none focus:ring-2 focus:ring-[#315f86] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#315f86]/10 text-[#315f86] ring-1 ring-[#315f86]/30">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span className="block text-lg font-semibold text-[#172b3a]">Schedule a meeting now</span>
              <span className="mt-2 block text-sm leading-6 text-[#65727a]">
                Skip the questionnaire and choose an available meeting time immediately.
              </span>
              <span className="mt-5 block text-sm font-semibold text-[#315f86] group-hover:text-[#183b59]">
                {calendlyUrl ? "Choose a time now" : `Online booking isn't set up yet — fill out the questionnaire and ${info.businessName} will contact you`}
              </span>
            </button>
          </div>
        ) : path === "calendly" && calendlyUrl ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setPath("choice")}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#65727a] transition hover:text-[#172b3a] focus:outline-none focus:ring-2 focus:ring-[#234d73]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to scheduling options
            </button>
            <div className="overflow-hidden rounded-xl border border-[#d8d6cf] bg-[#fffdfa] p-2 shadow-[0_10px_30px_rgba(30,45,53,.05)]">
              <div className="mb-2 flex items-center gap-2 px-3 pt-3 text-[#43545e]">
                <CalendarDays className="h-5 w-5 text-[#315f86]" />
                <span className="font-semibold">Choose a time</span>
              </div>
              <CalendlyEmbed url={calendlyUrl} token={token} />
            </div>
          </div>
        ) : submitted ? (
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-700/30 bg-emerald-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-800">Thanks! Your details were sent.</p>
                <p className="text-sm text-emerald-800/80">
                  {calendlyUrl
                    ? `Pick a time below to lock in your ${copy.offerNoun}.`
                    : `${info.businessName} will reach out shortly to confirm your ${copy.offerNoun}.`}
                </p>
              </div>
            </div>

            {calendlyUrl && (
              <div className="rounded-xl border border-[#d8d6cf] bg-[#fffdfa] p-2 shadow-[0_10px_30px_rgba(30,45,53,.05)]">
                <div className="mb-2 flex items-center gap-2 px-3 pt-3 text-[#43545e]">
                  <CalendarDays className="h-5 w-5 text-[#234d73]" />
                  <span className="font-semibold">Choose a time</span>
                </div>
                <CalendlyEmbed url={calendlyUrl} token={token} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setPath("choice")}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to scheduling options
            </button>
            <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[#d8d6cf] bg-[#fffdfa] p-6 shadow-[0_10px_30px_rgba(30,45,53,.05)]">
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
                            ? "bg-[#234d73] text-white"
                            : "border border-[#d8d6cf] bg-[#f7f3e9] text-[#43545e] hover:border-[#234d73]"
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
                            ? "bg-[#234d73] text-white"
                            : "border border-[#d8d6cf] bg-[#f7f3e9] text-[#43545e] hover:border-[#234d73]"
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

            {isRecruiting && (
              <div className="space-y-3" data-testid="section-recruiting-qualification">
                <p className="text-sm font-medium text-[#43545e]">Hiring needs</p>
                <p className="text-xs text-slate-500">Share only what you are comfortable with. Every field is optional.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {RECRUITING_SCHEDULE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className={labelClass}>{f.label}</label>
                      <input
                        className={inputClass}
                        maxLength={2000}
                        value={recruitingQualification[f.key] ?? ""}
                        placeholder={f.placeholder}
                        onChange={(e) => setRecruitingQualification((q) => ({ ...q, [f.key]: e.target.value }))}
                        data-testid={`input-schedule-${f.key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isIT && !isRecruiting && (
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
                    <p className="text-sm text-amber-700">
                    You have more than 3 locations — list your first 3 here and we'll call to discuss the
                    rest.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>{copy.uploadLabel}</label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#c9c7bf] bg-[#f7f3e9] px-4 py-6 text-[#65727a] hover:border-[#234d73]/60 hover:text-[#43545e]">
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
                      className="flex items-center justify-between rounded-md bg-[#eef2f3] px-3 py-1.5 text-sm text-[#43545e]"
                    >
                      <span className="truncate">{f.filename}</span>
                      <button type="button" onClick={() => removeFile(idx)} className="text-[#748087] hover:text-red-500" aria-label={`Remove ${f.filename}`}>
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
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#234d73] px-4 py-3 font-semibold text-white transition hover:bg-[#183b59] focus:outline-none focus:ring-2 focus:ring-[#234d73] focus:ring-offset-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {submitting ? "Submitting…" : "Submit & pick a time"}
            </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

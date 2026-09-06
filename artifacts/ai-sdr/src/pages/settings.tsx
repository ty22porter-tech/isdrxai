import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useUpload } from "@workspace/object-storage-web";
import { Settings, Mail, Calendar, CheckCircle2, AlertCircle, Loader2, ExternalLink, Building2, Zap, User, Phone, MapPin, ShieldCheck, XCircle, MinusCircle, RefreshCw, Inbox, ImageIcon, Camera, Paperclip, Trash2, FileText, Upload, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CompanyIntelligenceEditor } from "@/components/company-intelligence-editor";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `API error ${res.status}`);
  return data;
}

const objectUrl = (path: string) => `/api/storage${path}`;

type Attachment = { path: string; name: string; size: number; contentType: string };

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function intelligenceFieldLabel(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function IntelligenceValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">Not available</span>;

  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-4">
        {value.map((item, index) => (
          <li key={index}>
            {typeof item === "object" && item !== null
              ? <IntelligenceValue value={item} />
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    return (
      <dl className="space-y-2">
        {Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => (
          <div key={key}>
            <dt className="font-medium text-foreground">{intelligenceFieldLabel(key)}</dt>
            <dd className="mt-0.5 text-muted-foreground"><IntelligenceValue value={nestedValue} /></dd>
          </div>
        ))}
      </dl>
    );
  }

  return <>{String(value)}</>;
}

function SingleFileCard({
  label,
  hint,
  accept,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  accept?: string;
  value: Attachment | null;
  onChange: (file: Attachment | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const pendingRef = useRef<File | null>(null);
  const { uploadFile, isUploading } = useUpload({
    basePath: `/api/storage`,
    onSuccess: (res) => {
      const f = pendingRef.current;
      onChange({ path: res.objectPath, name: f?.name ?? "file", size: f?.size ?? 0, contentType: f?.type || "application/octet-stream" });
      pendingRef.current = null;
    },
    onError: (e) => setErr(e.message),
  });

  const handleFile = async (file?: File) => {
    if (!file) return;
    setErr(null);
    if (file.size > 25 * 1024 * 1024) {
      setErr("File must be under 25 MB");
      return;
    }
    pendingRef.current = file;
    await uploadFile(file);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-2"><Paperclip className="w-4 h-4 text-primary" /> {label}</label>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate">{value.name}</div>
            {value.size > 0 && <div className="text-xs text-muted-foreground">{formatSize(value.size)}</div>}
          </div>
          <a href={objectUrl(value.path)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:text-primary/80 shrink-0">View</a>
          <button type="button" className="text-muted-foreground hover:text-red-400 shrink-0" onClick={() => onChange(null)} aria-label={`Remove ${value.name}`}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : null}
      <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => inputRef.current?.click()}>
        {isUploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> {value ? "Replace" : "Upload"}</>}
      </Button>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ImageUploadCard({
  label,
  hint,
  icon,
  value,
  rounded,
  onChange,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  value: string | null;
  rounded?: boolean;
  onChange: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const { uploadFile, isUploading } = useUpload({
    basePath: `/api/storage`,
    onSuccess: (res) => onChange(res.objectPath),
    onError: (e) => setErr(e.message),
  });

  const handleFile = async (file?: File) => {
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file (PNG, JPG, etc.)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("Image must be under 10 MB");
      return;
    }
    await uploadFile(file);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-2">{icon} {label}</label>
      <div className="flex items-center gap-4">
        <div className={`w-16 h-16 shrink-0 border border-border bg-background flex items-center justify-center overflow-hidden ${rounded ? "rounded-full" : "rounded-lg"}`}>
          {value ? (
            <img src={objectUrl(value)} alt={label} className="w-full h-full object-cover" />
          ) : (
            <span className="text-muted-foreground">{icon}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => inputRef.current?.click()}>
            {isUploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> {value ? "Replace" : "Upload"}</>}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-red-400" onClick={() => onChange(null)}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
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
  const [mobilePhone, setMobilePhone] = useState("");
  const [website, setWebsite] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [vertical, setVertical] = useState("janitorial");
  const [sellerDifferentiatorsInput, setSellerDifferentiatorsInput] = useState("");
  const [sellerServicePriorities, setSellerServicePriorities] = useState("");
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [step3CaseStudy, setStep3CaseStudy] = useState<Attachment | null>(null);
  const [step5CaseStudy, setStep5CaseStudy] = useState<Attachment | null>(null);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [intelligenceMsg, setIntelligenceMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const pendingFileRef = useRef<File | null>(null);
  const attachUpload = useUpload({
    basePath: `/api/storage`,
    onSuccess: (res) => {
      const f = pendingFileRef.current;
      setAttachments((prev) => [
        ...prev,
        { path: res.objectPath, name: f?.name ?? "file", size: f?.size ?? 0, contentType: f?.type || "application/octet-stream" },
      ]);
      pendingFileRef.current = null;
    },
    onError: (e) => setAttachErr(e.message),
  });

  const handleAttachFile = async (file?: File) => {
    if (!file) return;
    setAttachErr(null);
    if (attachments.length >= 10) {
      setAttachErr("You can attach up to 10 files.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setAttachErr("Files must be under 25 MB.");
      return;
    }
    pendingFileRef.current = file;
    await attachUpload.uploadFile(file);
  };

  useEffect(() => {
    if (me) {
      setBusinessName(me.businessName ?? "");
      setSenderName(me.senderName ?? "");
      setPhone(me.phone ?? "");
      setMobilePhone(me.mobilePhone ?? "");
      setWebsite(me.website ?? "");
      setBusinessAddress(me.businessAddress ?? "");
      setReplyEmail(me.outreachEmail ?? "");
      setCalendlyUrl(me.calendlyUrl ?? "");
      setVertical(me.vertical ?? "janitorial");
      setSellerDifferentiatorsInput(me.sellerDifferentiatorsInput ?? "");
      setSellerServicePriorities(me.sellerServicePriorities ?? "");
      setCompanyLogoPath(me.companyLogoPath ?? null);
      setProfilePhotoPath(me.profilePhotoPath ?? null);
      setAttachments(Array.isArray(me.attachments) ? me.attachments : []);
      setStep3CaseStudy(me.step3CaseStudy ?? null);
      setStep5CaseStudy(me.step5CaseStudy ?? null);
      if (me.engagementSettings) setEng(me.engagementSettings);
    }
  }, [me]);

  // ── Engagement Automation settings (saved via their own endpoint) ──────────
  const [eng, setEng] = useState<any>(null);
  const [engMsg, setEngMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const engMutation = useMutation({
    mutationFn: () =>
      apiFetch("/users/engagement-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eng),
      }),
    onSuccess: (data: any) => {
      setEng(data.engagementSettings);
      qc.invalidateQueries({ queryKey: ["me"] });
      setEngMsg({ type: "ok", text: "Engagement automation settings saved!" });
      setTimeout(() => setEngMsg(null), 3000);
    },
    onError: (err: Error) => setEngMsg({ type: "err", text: err.message }),
  });

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
          vertical,
          sellerDifferentiatorsInput: sellerDifferentiatorsInput || null,
          sellerServicePriorities: sellerServicePriorities || null,
          mobilePhone: mobilePhone || null,
          website: website || null,
          companyLogoPath,
          profilePhotoPath,
          attachments,
          step3CaseStudy,
          step5CaseStudy,
        }),
      }),
    onSuccess: () => {
      const websiteWasChanged = website.trim() !== (me?.website ?? "").trim();
      qc.invalidateQueries({ queryKey: ["me"] });
      setSaveMsg({
        type: "ok",
        text: websiteWasChanged
          ? "Settings saved. Company website analysis is complete."
          : "Settings saved!",
      });
      setTimeout(() => setSaveMsg(null), 3000);
    },
    onError: (err: Error) => {
      setSaveMsg({ type: "err", text: err.message });
    },
  });

  const refreshIntelligenceMutation = useMutation({
    mutationFn: () => apiFetch("/users/company-intelligence/refresh", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setIntelligenceMsg({ type: "ok", text: "Company intelligence refresh is complete." });
    },
    onError: (err: Error) => setIntelligenceMsg({ type: "err", text: err.message }),
  });

  const allSet = !!(me?.platformEmailReady && me?.outreachEmail);
  const savedWebsite = (me?.website ?? "").trim();
  const websiteChanged = website.trim() !== savedWebsite;
  const sellerIntelligenceProfile = me?.sellerIntelligenceProfile as Record<string, unknown> | null | undefined;
  const intelligenceStatus = String(
    sellerIntelligenceProfile?.status
      ?? sellerIntelligenceProfile?.analysisStatus
      ?? sellerIntelligenceProfile?.state
      ?? "",
  ).toLowerCase();
  const intelligenceIsAnalyzing = refreshIntelligenceMutation.isPending || /analy[sz]|pending|queued|processing|refresh/.test(intelligenceStatus);
  const intelligenceIsLimited = /limited|partial|fail|error|unavailable/.test(intelligenceStatus);
  const intelligenceNeedsReview = /review/.test(intelligenceStatus);
  const intelligenceIsReady = !!sellerIntelligenceProfile && !intelligenceIsAnalyzing && !intelligenceIsLimited && !intelligenceNeedsReview
    && !/not.?analy[sz]|missing|none/.test(intelligenceStatus);
  const intelligenceDisplayFields = sellerIntelligenceProfile
    ? Object.entries(sellerIntelligenceProfile).filter(([key]) => !["status", "analysisStatus", "state", "error", "lastError"].includes(key))
    : [];

  const {
    data: deliverability,
    isLoading: delivLoading,
    isFetching: delivFetching,
    refetch: refetchDeliv,
  } = useQuery({
    queryKey: ["deliverability"],
    queryFn: () => apiFetch("/deliverability"),
    enabled: isLoaded && !!user,
    refetchOnWindowFocus: false,
  });

  const { data: calendlySync } = useQuery({
    queryKey: ["calendly-status"],
    queryFn: () => apiFetch("/calendly/status"),
    enabled: isLoaded && !!user,
    refetchOnWindowFocus: false,
  });

  const checkIcon = (status: string) => {
    if (status === "pass") return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (status === "warn") return <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />;
    if (status === "fail") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
    return <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

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

        {/* Deliverability checklist */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Deliverability</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Whether your sending domain is set up to reach the inbox instead of spam.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={delivFetching}
              onClick={() => refetchDeliv()}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${delivFetching ? "animate-spin" : ""}`} /> Recheck
            </Button>
          </div>

          {delivLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking your sending setup…
            </div>
          ) : deliverability ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">{deliverability.score}/{deliverability.total} checks passing</span>
                <span className="text-muted-foreground">· sending from {deliverability.fromEmail}</span>
              </div>
              <div className="space-y-2.5">
                {deliverability.checks?.map((c: any) => (
                  <div key={c.id} className="flex items-start gap-2.5">
                    {checkIcon(c.status)}
                    <div className="min-w-0">
                      <div className="text-sm">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex gap-2.5">
                <Inbox className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {deliverability.summary} New sending domains commonly land in <span className="font-medium">Spam</span> or the{" "}
                  <span className="font-medium">Promotions</span> tab for the first week or two. Ask early recipients to mark your emails
                  “Not spam” and reply — this trains inbox providers to trust you and speeds up warm-up.
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-400 py-2">
              <AlertCircle className="w-4 h-4" /> Couldn’t load deliverability status.
            </div>
          )}
        </div>

        {/* Form */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Your Industry
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { value: "janitorial", label: "Janitorial", desc: "Commercial cleaning outreach" },
                { value: "it_services", label: "IT Services", desc: "Cybersecurity, MS365, Managed IT, MDM" },
                { value: "fleet_wraps", label: "Fleet & Vehicle Wraps", desc: "Commercial vehicle graphics and fleet branding" },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVertical(opt.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${vertical === opt.value ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}
                >
                  <div className={`text-sm font-medium ${vertical === opt.value ? "text-primary" : ""}`}>{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">All AI-generated emails, call scripts, and the prospect scheduling page use messaging tailored to this industry.</p>
          </div>

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
            <p className="text-xs text-muted-foreground">Shown as "Office Phone" in your email signature.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> Mobile / Fax Number <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={mobilePhone}
              onChange={e => setMobilePhone(e.target.value)}
              placeholder="e.g. (555) 987-6543"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">Shown as "Mobile" in your email signature when provided.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> Company Website <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="e.g. www.yourcompany.com"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-xs text-muted-foreground">Shown as "Website" in your email signature when provided.</p>

            <div className="grid gap-4 pt-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  What makes your company different? <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={sellerDifferentiatorsInput}
                  onChange={event => setSellerDifferentiatorsInput(event.target.value)}
                  placeholder="e.g. We provide 48-hour installation, handle design in-house, and use certified installers."
                  rows={4}
                  maxLength={4000}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground">
                  Tell iSDRX AI about strengths, guarantees, processes, services, experience, or advantages that may not be obvious from your website. This information will be used to improve prospect matching and email personalization.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  What services or solutions do you want iSDRX AI to prioritize? <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  value={sellerServicePriorities}
                  onChange={event => setSellerServicePriorities(event.target.value)}
                  placeholder="e.g. Managed IT, cybersecurity, cloud migration"
                  rows={4}
                  maxLength={2000}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the services you most want to sell. iSDRX AI will prioritize these when matching prospect needs and generating outreach.
                </p>
              </div>
            </div>

            <div
              className={`rounded-lg border p-3 space-y-3 ${
                intelligenceIsAnalyzing
                  ? "border-blue-500/30 bg-blue-500/10"
                  : intelligenceIsReady
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : intelligenceNeedsReview
                      ? "border-amber-500/30 bg-amber-500/10"
                      : intelligenceIsLimited
                        ? "border-amber-500/30 bg-amber-500/10"
                        : "border-border bg-card"
              }`}
              aria-live="polite"
            >
              <div className="flex items-start gap-2.5">
                {intelligenceIsAnalyzing ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-400" />
                ) : intelligenceIsReady ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : intelligenceNeedsReview ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                ) : intelligenceIsLimited ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                ) : (
                  <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${
                    intelligenceIsAnalyzing ? "text-blue-400" : intelligenceIsReady ? "text-emerald-400" : intelligenceNeedsReview || intelligenceIsLimited ? "text-amber-400" : "text-muted-foreground"
                  }`}>
                    {
                      intelligenceIsAnalyzing ? "Company Intelligence Analyzing"
                      : intelligenceIsReady ? "Company Intelligence Ready"
                      : intelligenceNeedsReview ? "Company Intelligence Needs Review"
                      : intelligenceIsLimited ? "Company Intelligence Limited"
                      : !savedWebsite ? "Company Website Not Added"
                      : "Company Intelligence Not Analyzed"
                    }
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {intelligenceIsAnalyzing
                      ? "Your website is being analyzed. This can take a few moments; the intelligence below will update when it is ready."
                      : intelligenceIsReady
                        ? "Your company profile is ready to help tailor prospect research and outreach."
                        : intelligenceNeedsReview
                          ? "Website was analyzed but important information may be incomplete or uncertain. Please review."
                          : intelligenceIsLimited
                            ? "We found limited company information. Refresh after updating your website for a more complete profile."
                            : savedWebsite
                              ? "Your saved website has not been analyzed yet. Refresh to create company intelligence."
                              : "Add and save your company website to create company intelligence."}
                  </p>
                </div>
              </div>

              {sellerIntelligenceProfile && (
                <Collapsible open={intelligenceOpen} onOpenChange={setIntelligenceOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 py-1 text-xs">
                      <ChevronDown className={`mr-1.5 h-3.5 w-3.5 transition-transform ${intelligenceOpen ? "rotate-180" : ""}`} />
                      {intelligenceOpen ? "Hide Company Intelligence" : "View Company Intelligence"}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="mb-2 text-[11px] text-muted-foreground">
                      {Boolean(sellerIntelligenceProfile.websiteLastAnalyzed) && (
                        <div>Last analyzed: {new Date(sellerIntelligenceProfile.websiteLastAnalyzed as string).toLocaleString()}</div>
                      )}
                      {Boolean(sellerIntelligenceProfile.userEditedAt) && (
                        <div>Last updated by user: {new Date(sellerIntelligenceProfile.userEditedAt as string).toLocaleString()}</div>
                      )}
                    </div>
                    <CompanyIntelligenceEditor profile={sellerIntelligenceProfile} />
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!savedWebsite || refreshIntelligenceMutation.isPending}
                  onClick={() => {
                    setIntelligenceMsg(null);
                    refreshIntelligenceMutation.mutate();
                  }}
                >
                  {refreshIntelligenceMutation.isPending ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Refreshing…</>
                  ) : (
                    <><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh Company Intelligence</>
                  )}
                </Button>
                {!savedWebsite && <span className="text-xs text-muted-foreground">Save a website first to refresh.</span>}
              </div>
              {intelligenceMsg && (
                <p className={`text-xs ${intelligenceMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                  {intelligenceMsg.text}
                </p>
              )}
            </div>
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
            <p className="text-xs text-muted-foreground">
              For better cold-outreach conversion, use a short 10–15 minute Calendly event with minimal required questions. iSDRX AI keeps the email wording duration-neutral so it always matches the event configured in your own account.
            </p>
            <p className="text-xs text-muted-foreground">
              Want bookings made directly on your Calendly page to show up here automatically? Ask your admin to add a Calendly API token
              (Calendly → Integrations → API &amp; Webhooks → Personal Access Token) as the <span className="font-mono">CALENDLY_API_TOKEN</span> secret —
              the app then registers a verified webhook on its own. Bookings made through emailed links are always tracked either way.
            </p>
            {calendlySync && (
              <div
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                  calendlySync.state === "connected"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : calendlySync.state === "failed"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-border bg-background"
                }`}
              >
                {calendlySync.state === "connected" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : calendlySync.state === "failed" ? (
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div
                    className={`text-xs font-semibold ${
                      calendlySync.state === "connected"
                        ? "text-emerald-400"
                        : calendlySync.state === "failed"
                          ? "text-red-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {calendlySync.state === "connected"
                      ? "Direct-booking sync connected"
                      : calendlySync.state === "failed"
                        ? "Direct-booking sync failed"
                        : "Direct-booking sync not configured"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{calendlySync.detail}</div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-5 space-y-5">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" /> Branding & Files
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add your company logo, a photo of yourself, and any files (like a flyer or capabilities sheet) to include with your outreach.
              </p>
            </div>

            <ImageUploadCard
              label="Company Logo"
              hint="Shown in your emails and on your scheduling page so prospects recognize your brand."
              icon={<Building2 className="w-4 h-4 text-primary" />}
              value={companyLogoPath}
              onChange={setCompanyLogoPath}
            />

            <ImageUploadCard
              label="Your Photo"
              hint="A friendly headshot builds trust — prospects like to see who's reaching out."
              icon={<Camera className="w-4 h-4 text-primary" />}
              value={profilePhotoPath}
              rounded
              onChange={setProfilePhotoPath}
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" /> Attached Files
              </label>
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((a, i) => (
                    <div key={a.path} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{a.name}</div>
                        {a.size > 0 && <div className="text-xs text-muted-foreground">{formatSize(a.size)}</div>}
                      </div>
                      <a
                        href={objectUrl(a.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:text-primary/80 shrink-0"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-red-400 shrink-0"
                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${a.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={attachUpload.isUploading || attachments.length >= 10}
                onClick={() => attachInputRef.current?.click()}
              >
                {attachUpload.isUploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5 mr-1.5" /> Attach a file</>}
              </Button>
              <input
                ref={attachInputRef}
                type="file"
                className="hidden"
                onChange={(e) => { handleAttachFile(e.target.files?.[0]); e.target.value = ""; }}
              />
              {attachErr && <p className="text-xs text-red-400">{attachErr}</p>}
              <p className="text-xs text-muted-foreground">
                Flyers, one-pagers, or anything with extra info about your business. Up to 10 files, 25 MB each. These are attached to the FIRST email only — follow-ups get the case studies below instead.
              </p>
            </div>

            <SingleFileCard
              label="Case Study — Step 3"
              hint="Attached to the third email in your campaign sequence. Fresh material keeps prospects engaged as the campaign advances."
              value={step3CaseStudy}
              onChange={setStep3CaseStudy}
            />

            <SingleFileCard
              label="Case Study or Audio (MP3) — Step 5"
              hint="Attached to the fifth email in your campaign sequence. A case study PDF or a short MP3 works well here."
              accept=".pdf,.doc,.docx,.mp3,audio/mpeg,application/pdf"
              value={step5CaseStudy}
              onChange={setStep5CaseStudy}
            />

            {/* Email signature preview */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Email Signature Preview
              </label>
              <div className="rounded-lg border border-border bg-card text-foreground p-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                <p className="text-[15px] mb-3 text-muted-foreground italic">…end of your email message…</p>
                <p className="text-[15px] mb-4">Best,</p>
                {(() => {
                  const raw = (senderName || businessName || "Your Name").trim();
                  const i = raw.indexOf(" - ");
                  const name = i > -1 ? raw.slice(0, i).trim() : raw;
                  const title = i > -1 ? raw.slice(i + 3).trim() : "";
                  return (
                    <div className="flex items-center justify-between gap-8">
                      <div className="min-w-0">
                        {profilePhotoPath && (
                          <img
                            src={objectUrl(profilePhotoPath)}
                            alt="Your photo"
                            className="w-[90px] h-[90px] object-cover mb-3"
                          />
                        )}
                        <div className="text-lg font-bold leading-snug">{name}</div>
                        {title && <div className="text-base leading-snug">{title}</div>}
                        {businessName && (
                          <div className="text-sm font-semibold tracking-wide text-primary uppercase mt-0.5">{businessName}</div>
                        )}
                        <div className="border-t border-red-600 w-64 max-w-full my-3.5" />
                        {phone && <div className="text-[13px] mb-1"><span className="font-bold">Office Phone:</span> <span className="underline">{phone}</span></div>}
                        {mobilePhone && <div className="text-[13px] mb-1"><span className="font-bold">Mobile:</span> <span className="underline">{mobilePhone}</span></div>}
                        {replyEmail && <div className="text-[13px] mb-1"><span className="font-bold">Email:</span> <span className="underline">{replyEmail}</span></div>}
                        {website && <div className="text-[13px]"><span className="font-bold">Website:</span> <span className="underline">{website}</span></div>}
                      </div>
                      {companyLogoPath && (
                        <img src={objectUrl(companyLogoPath)} alt="Company logo" className="w-[120px] h-auto shrink-0 self-center" />
                      )}
                    </div>
                  );
                })()}
              </div>
              <p className="text-xs text-muted-foreground">
                This is exactly how your signature will appear at the bottom of every outreach email, using your sender info, photo, and logo above. Tip: include your title in the Sender Name field (e.g. "Ty Porter, MBA - Director of Sales").
              </p>
            </div>
          </div>

          {/* ── Engagement Automation ─────────────────────────────────────── */}
          {eng && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Engagement Automation</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Score prospect interest from opens, clicks, and replies — and automatically send a 15-minute meeting request after the 3rd valid open (uses your Calendly link above).
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { key: "openTrackingEnabled", label: "Open tracking" },
                  { key: "attachmentTrackingEnabled", label: "Attachment tracking" },
                  { key: "autoFollowUpEnabled", label: "Auto meeting follow-up" },
                ].map(t => (
                  <label key={t.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!eng[t.key]}
                      onChange={e => setEng({ ...eng, [t.key]: e.target.checked })}
                      className="accent-primary"
                    />
                    {t.label}
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { key: "mediumMin", label: "Medium at ≥", hint: "points" },
                  { key: "hotMin", label: "Hot at ≥", hint: "points" },
                  { key: "dedupWindowMinutes", label: "Open dedup", hint: "minutes" },
                  { key: "followUpDelayMinutes", label: "Send delay", hint: "minutes" },
                  { key: "dailySendCap", label: "Daily cap", hint: "emails/day" },
                ].map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-medium">{f.label}</label>
                    <input
                      type="number"
                      value={eng[f.key] ?? ""}
                      onChange={e => setEng({ ...eng, [f.key]: e.target.value === "" ? "" : Number(e.target.value) })}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">{f.hint}</p>
                  </div>
                ))}
              </div>

              <details className="rounded-lg border border-border px-3 py-2">
                <summary className="text-sm font-medium cursor-pointer">Point values</summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                  {[
                    ["open1", "1st open"], ["open2", "2nd open"], ["open3", "3rd open"], ["openMore", "4th+ open"],
                    ["linkClick", "Link click"], ["attachmentView", "Attachment view"], ["attachmentViewRepeat", "Repeat attachment"], ["calendlyClick", "Calendly click"],
                    ["questionnaireOpened", "Questionnaire opened"], ["questionnaireSubmitted", "Questionnaire submitted"], ["positiveReply", "Positive reply"], ["meetingScheduled", "Meeting scheduled"],
                  ].map(([k, label]) => (
                    <div key={k} className="space-y-1">
                      <label className="text-xs">{label}</label>
                      <input
                        type="number"
                        value={eng.points?.[k] ?? ""}
                        onChange={e => setEng({ ...eng, points: { ...eng.points, [k]: e.target.value === "" ? "" : Number(e.target.value) } })}
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </details>

              <div className="space-y-3">
                <p className="text-sm font-medium">Repeated-Open Meeting Follow-Up template</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Subject</label>
                  <input
                    value={eng.template?.subject ?? ""}
                    onChange={e => setEng({ ...eng, template: { ...eng.template, subject: e.target.value } })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Body</label>
                  <textarea
                    rows={7}
                    value={eng.template?.body ?? ""}
                    onChange={e => setEng({ ...eng, template: { ...eng.template, body: e.target.value } })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Placeholders: {"{{contactName}} {{companyName}} {{city}} {{state}} {{industry}}"}. Your signature, Calendly button, and unsubscribe footer are added automatically. Per-campaign, you can switch between Option A (Calendly link) and Option B (questionnaire first) on the Campaigns page.
                  </p>
                </div>
              </div>

              {engMsg && (
                <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm ${engMsg.type === "ok" ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border border-red-500/30 text-red-400"}`}>
                  {engMsg.type === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {engMsg.text}
                </div>
              )}
              <Button variant="outline" className="w-full" disabled={engMutation.isPending} onClick={() => engMutation.mutate()}>
                {engMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save Engagement Automation Settings"}
              </Button>
            </div>
          )}

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
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {websiteChanged ? "Saving & starting analysis…" : "Saving…"}</>
            ) : "Save Settings"}
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

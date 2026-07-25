import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useUpload } from "@workspace/object-storage-web";
import { Settings, Mail, Calendar, CheckCircle2, AlertCircle, Loader2, ExternalLink, Building2, Zap, User, Phone, MapPin, ShieldCheck, XCircle, MinusCircle, RefreshCw, Inbox, ImageIcon, Camera, Paperclip, Trash2, FileText, Upload } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}/api${path}`, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `API error ${res.status}`);
  return data;
}

const objectUrl = (path: string) => `${BASE_URL}/api/storage${path}`;

type Attachment = { path: string; name: string; size: number; contentType: string };

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    basePath: `${BASE_URL}/api/storage`,
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
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const pendingFileRef = useRef<File | null>(null);
  const attachUpload = useUpload({
    basePath: `${BASE_URL}/api/storage`,
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
      setCompanyLogoPath(me.companyLogoPath ?? null);
      setProfilePhotoPath(me.profilePhotoPath ?? null);
      setAttachments(Array.isArray(me.attachments) ? me.attachments : []);
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
          vertical,
          mobilePhone: mobilePhone || null,
          website: website || null,
          companyLogoPath,
          profilePhotoPath,
          attachments,
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
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "janitorial", label: "Janitorial", desc: "Commercial cleaning outreach" },
                { value: "it_services", label: "IT Services", desc: "Cybersecurity, MS365, Managed IT, MDM" },
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
                Flyers, one-pagers, or anything with extra info about your business. Up to 10 files, 25 MB each. Attached files are sent alongside your emails — they are not part of the signature.
              </p>
            </div>

            {/* Email signature preview */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" /> Email Signature Preview
              </label>
              <div className="rounded-lg border border-border bg-white text-gray-900 p-4" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                <p className="text-[15px] mb-3 text-gray-500 italic">…end of your email message…</p>
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
                          <div className="text-sm font-semibold tracking-wide text-blue-600 uppercase mt-0.5">{businessName}</div>
                        )}
                        <div className="border-t border-red-600 w-64 max-w-full my-3.5" />
                        {phone && <div className="text-[15px] mb-1.5"><span className="font-bold">Office Phone:</span> <span className="underline">{phone}</span></div>}
                        {mobilePhone && <div className="text-[15px] mb-1.5"><span className="font-bold">Mobile:</span> <span className="underline">{mobilePhone}</span></div>}
                        {replyEmail && <div className="text-[15px] mb-1.5"><span className="font-bold">Email:</span> <span className="underline">{replyEmail}</span></div>}
                        {website && <div className="text-[15px]"><span className="font-bold">Website:</span> <span className="underline">{website}</span></div>}
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

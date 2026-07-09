import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListProspects, useCreateProspect, useBulkCreateProspects, useListCampaigns, useCreateEmail } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Building2, MapPin, Phone, Mail, Send, X, Eye, Upload, FileText, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

// ─── Merge template ───────────────────────────────────────────────────────────
function mergeTpl(tpl: string, prospect: any): string {
  return tpl
    .replace(/\{\{contactName\}\}/g, prospect.contactName ?? "")
    .replace(/\{\{companyName\}\}/g, prospect.companyName ?? "")
    .replace(/\{\{city\}\}/g, prospect.city ?? "")
    .replace(/\{\{state\}\}/g, prospect.state ?? "")
    .replace(/\{\{industry\}\}/g, prospect.industry ?? "");
}
function defaultSubject(campaignName: string, vertical: string = "janitorial") {
  const prefix = vertical === "it_services" ? "Managed IT Services" : "Janitorial Services";
  return `${prefix} for ${campaignName.split(" ").slice(0, 3).join(" ")}`;
}

function fallbackBody(p: any, vertical: string = "janitorial") {
  return vertical === "it_services"
    ? `Hi ${p.contactName},\n\nWe provide managed IT services — cybersecurity, MS365, managed security, and mobile device management — for ${p.industry} companies in ${p.city}. I'd love to schedule a free IT assessment for ${p.companyName}.`
    : `Hi ${p.contactName},\n\nWe provide janitorial services for ${p.industry} companies in ${p.city}. I'd love to schedule a walkthrough at ${p.companyName}.`;
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const values = line.match(/("(?:[^"]|"")*"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

// Column aliases (ZoomInfo, Apollo, generic)
const COLUMN_MAP: Record<string, string[]> = {
  companyName:  ["Company Name", "Company", "organization_name", "Account Name"],
  contactName:  ["Contact Name", "Full Name", "Name"],
  firstName:    ["First Name", "first_name"],
  lastName:     ["Last Name", "last_name"],
  email:        ["Email Address", "Email", "email", "Work Email"],
  phone:        ["Direct Phone Number", "Phone", "phone", "Mobile Phone", "Corporate Phone"],
  industry:     ["Industry", "industry", "Sector"],
  city:         ["City", "city"],
  state:        ["State", "State/Province", "state"],
};

function resolveColumn(headers: string[], key: string): string | undefined {
  const aliases = COLUMN_MAP[key] ?? [];
  return aliases.find(a => headers.includes(a));
}

function mapRow(row: Record<string, string>, headers: string[]): {
  companyName: string; contactName: string; email: string;
  phone: string; industry: string; city: string; state: string;
} | null {
  const get = (key: string) => {
    const col = resolveColumn(headers, key);
    return col ? row[col] ?? "" : "";
  };
  const firstName = get("firstName");
  const lastName = get("lastName");
  const fullName = get("contactName") || `${firstName} ${lastName}`.trim();
  const company = get("companyName");
  const email = get("email");
  if (!company && !email) return null;
  return {
    companyName: company,
    contactName: fullName || "Unknown",
    email: email,
    phone: get("phone"),
    industry: get("industry"),
    city: get("city"),
    state: get("state"),
  };
}

// ─── Status color ─────────────────────────────────────────────────────────────
function getStatusColor(status: string) {
  switch (status) {
    case "new": return "bg-blue-100 text-blue-800";
    case "contacted": return "bg-yellow-100 text-yellow-800";
    case "interested": return "bg-orange-100 text-orange-800";
    case "qualified": return "bg-purple-100 text-purple-800";
    case "appointment_set": return "bg-green-100 text-green-800";
    case "closed_won": return "bg-emerald-100 text-emerald-800";
    case "closed_lost": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

// ─── CSV Import Dialog ────────────────────────────────────────────────────────
function CSVImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ReturnType<typeof mapRow>[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedRows, setFailedRows] = useState<{ row: NonNullable<ReturnType<typeof mapRow>>; reason: string }[]>([]);
  const [retrying, setRetrying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkCreateProspects = useBulkCreateProspects();
  const { toast } = useToast();

  const handleFile = (file: File) => {
    setError(""); setRows([]); setDone(false); setProgress(0);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (!parsed.length) { setError("No data rows found. Make sure your CSV has a header row."); return; }
      const headers = Object.keys(parsed[0]);
      const mapped = parsed.map(r => mapRow(r, headers)).filter(Boolean) as ReturnType<typeof mapRow>[];
      if (!mapped.length) { setError("Couldn't map any rows. Make sure your CSV has Company Name and Email columns."); return; }
      setRows(mapped);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const importRows = async (toImport: NonNullable<ReturnType<typeof mapRow>>[]) => {
    let imported = 0;
    const failures: { row: NonNullable<ReturnType<typeof mapRow>>; reason: string }[] = [];
    const CHUNK_SIZE = 100;
    for (let start = 0; start < toImport.length; start += CHUNK_SIZE) {
      const chunk = toImport.slice(start, start + CHUNK_SIZE);
      try {
        const result = await bulkCreateProspects.mutateAsync({
          data: {
            prospects: chunk.map(row => ({
              companyName: row.companyName,
              contactName: row.contactName,
              email: row.email,
              phone: row.phone || "(000) 000-0000",
              industry: row.industry || "General",
              city: row.city || "",
              state: row.state || "",
            })),
          },
        });
        imported += result.added;
        result.results.forEach(r => {
          if (!r.success) failures.push({ row: chunk[r.index], reason: r.error || "Server error" });
        });
      } catch (err: any) {
        const reason = err?.data?.error || err?.message || "Server error";
        chunk.forEach(row => failures.push({ row, reason }));
      }
      setProgress(Math.round(Math.min(start + CHUNK_SIZE, toImport.length) / toImport.length * 100));
    }
    return { imported, failures };
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    setProgress(0);
    const { imported, failures } = await importRows(rows as NonNullable<ReturnType<typeof mapRow>>[]);
    setImporting(false);
    setDone(true);
    setImportedCount(imported);
    setFailedCount(failures.length);
    setFailedRows(failures);
    onImported();
    if (failures.length === 0) {
      toast({ title: `${imported} prospect${imported !== 1 ? "s" : ""} imported` });
    } else {
      toast({
        title: "Some prospects failed to import",
        description: `${imported} imported, ${failures.length} failed. Review the reasons below.`,
        variant: "destructive",
      });
    }
  };

  const handleRetryFailed = async () => {
    if (!failedRows.length) return;
    setRetrying(true);
    const { imported, failures } = await importRows(failedRows.map(f => f.row));
    setRetrying(false);
    setImportedCount(c => c + imported);
    setFailedCount(failures.length);
    setFailedRows(failures);
    onImported();
    if (failures.length === 0) {
      toast({ title: `${imported} prospect${imported !== 1 ? "s" : ""} imported on retry` });
    } else {
      toast({
        title: `${failures.length} still failing`,
        description: imported > 0 ? `${imported} imported on retry.` : "Fix the highlighted rows and retry.",
        variant: "destructive",
      });
    }
  };

  const updateFailedEmail = (i: number, email: string) => {
    setFailedRows(prev => prev.map((f, idx) => idx === i ? { ...f, row: { ...f.row, email } } : f));
  };

  const downloadFailedRows = () => {
    if (!failedRows.length) return;
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Company Name", "Contact Name", "Email", "Phone", "Industry", "City", "State", "Reason"];
    const lines = [
      header.join(","),
      ...failedRows.map(f => [
        f.row.companyName, f.row.contactName, f.row.email, f.row.phone,
        f.row.industry, f.row.city, f.row.state, f.reason,
      ].map(esc).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "failed-import-rows.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => { setRows([]); setError(""); setProgress(0); setDone(false); setImportedCount(0); setFailedCount(0); setFailedRows([]); setRetrying(false); };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Import Prospects from CSV</DialogTitle>
          <DialogDescription>
            Supports exports from <strong>ZoomInfo</strong>, <strong>Apollo</strong>, or any CSV with Company, Email, and Name columns.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-2 text-center">
              {failedCount > 0 ? (
                <AlertCircle className="h-10 w-10 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              )}
              <p className="font-semibold">{failedCount > 0 ? "Import finished with issues" : "Import complete!"}</p>
              <p className="text-sm text-muted-foreground">
                {importedCount} prospect{importedCount !== 1 ? "s" : ""} added to your database.
                {failedCount > 0 && ` ${failedCount} failed to import.`}
              </p>
            </div>

            {failedRows.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Failed rows — fix the email if needed, then retry:</p>
                <div className="rounded-lg border overflow-hidden max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Company</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedRows.map((f, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium py-2">{f.row.companyName || "(missing)"}</TableCell>
                          <TableCell className="py-2">
                            <Input
                              value={f.row.email}
                              onChange={e => updateFailedEmail(i, e.target.value)}
                              className="h-7 text-xs"
                              disabled={retrying}
                            />
                          </TableCell>
                          <TableCell className="text-xs py-2 text-red-600">{f.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-2">
              {failedRows.length > 0 && (
                <>
                  <Button onClick={handleRetryFailed} disabled={retrying}>
                    {retrying ? "Retrying…" : `Retry ${failedRows.length} Failed Row${failedRows.length !== 1 ? "s" : ""}`}
                  </Button>
                  <Button variant="outline" onClick={downloadFailedRows} disabled={retrying}>
                    <Download className="mr-2 h-4 w-4" /> Download Failed Rows
                  </Button>
                </>
              )}
              <Button variant={failedRows.length > 0 ? "outline" : "default"} onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </div>
          </div>
        ) : importing ? (
          <div className="py-8 space-y-4 text-center">
            <p className="text-sm font-medium">Importing {rows.length} prospects…</p>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          </div>
        ) : rows.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{rows.length} prospects ready to import</span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={reset}>Clear</Button>
            </div>
            <div className="rounded-lg border overflow-hidden max-h-56 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Company</TableHead>
                    <TableHead className="text-xs">Contact</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Industry</TableHead>
                    <TableHead className="text-xs">Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium py-2">{row!.companyName}</TableCell>
                      <TableCell className="text-xs py-2">{row!.contactName}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{row!.email}</TableCell>
                      <TableCell className="text-xs py-2">{row!.industry}</TableCell>
                      <TableCell className="text-xs py-2">{row!.city}{row!.city && row!.state ? ", " : ""}{row!.state}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 10 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-xs text-center text-muted-foreground py-2">
                        + {rows.length - 10} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={handleImport}>
                <Upload className="mr-2 h-4 w-4" /> Import {rows.length} Prospects
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors"
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Drop your CSV here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">CSV files from ZoomInfo, Apollo, or any spreadsheet export</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Format hints */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supported column names</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span><strong>Company:</strong> "Company Name", "Company"</span>
                <span><strong>Contact:</strong> "First Name" + "Last Name"</span>
                <span><strong>Email:</strong> "Email Address", "Work Email"</span>
                <span><strong>Phone:</strong> "Direct Phone Number", "Phone"</span>
                <span><strong>Industry:</strong> "Industry", "Sector"</span>
                <span><strong>Location:</strong> "City", "State"</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Prospects() {
  const [search, setSearch] = useState("");
  const { data: prospects, isLoading, refetch } = useListProspects({ search });
  const { data: campaigns } = useListCampaigns();
  const createProspect = useCreateProspect();
  const createEmail = useCreateEmail();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/users/me`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });
  const vertical: string = me?.vertical === "it_services" ? "it_services" : "janitorial";

  // create dialog
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "", contactName: "", email: "", phone: "",
    industry: "", city: "", state: "",
  });

  // selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allIds = (prospects ?? []).map(p => p.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleOne = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));

  // quick send
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [previewProspect, setPreviewProspect] = useState<any>(null);
  const [sending, setSending] = useState(false);

  const activeCampaigns = (campaigns ?? []).filter(c => c.status === "active");
  const selectedCampaign = activeCampaigns.find(c => c.id === parseInt(selectedCampaignId));
  const selectedProspects = (prospects ?? []).filter(p => selected.has(p.id));
  const preview = previewProspect ?? selectedProspects[0];

  const previewBody = selectedCampaign?.emailTemplate
    ? mergeTpl(selectedCampaign.emailTemplate, preview ?? {})
    : "";
  const previewSubject = selectedCampaign ? defaultSubject(selectedCampaign.name, vertical) : "";

  const handleSend = async () => {
    if (!selectedCampaign || selectedProspects.length === 0) return;
    setSending(true);
    let sent = 0;
    let firstError = "";
    for (const p of selectedProspects) {
      await new Promise<void>(resolve => {
        const body = selectedCampaign.emailTemplate
          ? mergeTpl(selectedCampaign.emailTemplate, p)
          : fallbackBody(p, vertical);
        const subject = defaultSubject(selectedCampaign.name, vertical);
        createEmail.mutate(
          { data: { prospectId: p.id, campaignId: selectedCampaign.id, subject, body, status: "sent" } },
          {
            onSuccess: () => { sent++; resolve(); },
            onError: (err: any) => {
              if (!firstError) firstError = err?.data?.error || err?.message || "Send failed";
              resolve();
            },
          }
        );
      });
    }
    setSending(false);
    setSendOpen(false);
    setSelected(new Set());
    if (sent > 0) {
      toast({ title: `${sent} email${sent !== 1 ? "s" : ""} sent`, description: `Via "${selectedCampaign.name}" campaign` });
    }
    if (firstError) {
      toast({ title: "Some emails were not sent", description: firstError, variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createProspect.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Prospect created" });
        setIsOpen(false);
        refetch();
        setFormData({ companyName: "", contactName: "", email: "", phone: "", industry: "", city: "", state: "" });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Prospects</h2>
            <p className="text-muted-foreground mt-1">
              {vertical === "it_services" ? "Manage your IT services prospects." : "Manage your janitorial commercial targets."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CSVImportDialog onImported={refetch} />
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" /> Add Prospect</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add New Prospect</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Company Name</label>
                      <Input required value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Contact Name</label>
                      <Input required value={formData.contactName} onChange={e => setFormData({...formData, contactName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Email</label>
                      <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Phone</label>
                      <Input required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Industry</label>
                      <Input required value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} placeholder="e.g. Office, Medical" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">City</label>
                        <Input required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">State</label>
                        <Input required value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createProspect.isPending}>Save Prospect</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-primary">
              {selected.size} prospect{selected.size !== 1 ? "s" : ""} selected
            </span>
            <div className="flex-1" />
            <Dialog open={sendOpen} onOpenChange={setSendOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={activeCampaigns.length === 0}>
                  <Send className="mr-2 h-4 w-4" />
                  {activeCampaigns.length === 0 ? "No active campaigns" : "Send Campaign Email"}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Send Campaign Email</DialogTitle>
                  <DialogDescription>
                    Choose an active campaign. Each prospect will receive a personalized version of the email template.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5 pt-2">
                  <div className="space-y-2">
                    <Label>Campaign</Label>
                    <Select value={selectedCampaignId} onValueChange={v => { setSelectedCampaignId(v); setPreviewProspect(null); }}>
                      <SelectTrigger><SelectValue placeholder="Select an active campaign…" /></SelectTrigger>
                      <SelectContent>
                        {activeCampaigns.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name} · {c.targetIndustry}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Recipients ({selected.size})</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProspects.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setPreviewProspect(p)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            preview?.id === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          <Eye className="h-3 w-3" />{p.companyName}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Click a company to preview their personalized email.</p>
                  </div>
                  {selectedCampaign && preview && (
                    <div className="space-y-3">
                      <Separator />
                      <div className="space-y-1">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preview — {preview.companyName}</Label>
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                          <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Subject</p><p className="text-sm font-medium">{previewSubject}</p></div>
                          <Separator />
                          <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Body</p>
                            <Textarea readOnly value={previewBody || `${fallbackBody(preview, vertical)}\n\nBest,\nYour SDR Team`} className="min-h-[160px] font-mono text-xs bg-background resize-none mt-1" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                    <Button onClick={handleSend} disabled={!selectedCampaign || sending}>
                      <Send className="mr-2 h-4 w-4" />
                      {sending ? "Sending…" : `Send to ${selected.size} Prospect${selected.size !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
          </div>
        )}

        <Card>
          <CardHeader className="py-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search prospects..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Contacted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : prospects?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No prospects found.</TableCell></TableRow>
                ) : (
                  prospects?.map(prospect => (
                    <TableRow
                      key={prospect.id}
                      className={`cursor-pointer hover:bg-muted/50 ${selected.has(prospect.id) ? "bg-primary/5" : ""}`}
                      onClick={e => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[role="checkbox"]') || target.tagName === "INPUT") return;
                        navigate(`/prospects/${prospect.id}`);
                      }}
                    >
                      <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selected.has(prospect.id)} onCheckedChange={() => toggleOne(prospect.id)} aria-label={`Select ${prospect.companyName}`} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-primary">{prospect.companyName}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {prospect.industry}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{prospect.contactName}</div>
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {prospect.email}</div>
                          <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {prospect.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3 text-muted-foreground" />{prospect.city}, {prospect.state}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(prospect.status)}>
                          {prospect.status.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {prospect.lastContactedAt ? new Date(prospect.lastContactedAt).toLocaleDateString() : "Never"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

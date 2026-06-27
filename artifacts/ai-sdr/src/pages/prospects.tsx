import { useState } from "react";
import { useListProspects, useCreateProspect, useListCampaigns, useCreateEmail } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Building2, MapPin, Phone, Mail, Send, X, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

function mergeTpl(tpl: string, prospect: any): string {
  return tpl
    .replace(/\{\{contactName\}\}/g, prospect.contactName ?? "")
    .replace(/\{\{companyName\}\}/g, prospect.companyName ?? "")
    .replace(/\{\{city\}\}/g, prospect.city ?? "")
    .replace(/\{\{state\}\}/g, prospect.state ?? "")
    .replace(/\{\{industry\}\}/g, prospect.industry ?? "");
}

function defaultSubject(campaignName: string) {
  return `Janitorial Services for ${campaignName.split(" ").slice(0, 3).join(" ")}`;
}

export default function Prospects() {
  const [search, setSearch] = useState("");
  const { data: prospects, isLoading, refetch } = useListProspects({ search });
  const { data: campaigns } = useListCampaigns();
  const createProspect = useCreateProspect();
  const createEmail = useCreateEmail();
  const { toast } = useToast();
  const [, navigate] = useLocation();

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
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

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
  const previewSubject = selectedCampaign
    ? defaultSubject(selectedCampaign.name)
    : "";

  const handleSend = async () => {
    if (!selectedCampaign || selectedProspects.length === 0) return;
    setSending(true);
    let sent = 0;
    for (const p of selectedProspects) {
      await new Promise<void>(resolve => {
        const body = selectedCampaign.emailTemplate
          ? mergeTpl(selectedCampaign.emailTemplate, p)
          : `Hi ${p.contactName},\n\nWe provide janitorial services for ${p.industry} companies in ${p.city}. I'd love to schedule a walkthrough at ${p.companyName}.\n\nBest,\nYour SDR Team`;
        const subject = defaultSubject(selectedCampaign.name);
        createEmail.mutate(
          { data: { prospectId: p.id, campaignId: selectedCampaign.id, subject, body, status: "sent" } },
          { onSuccess: () => { sent++; resolve(); }, onError: () => resolve() }
        );
      });
    }
    setSending(false);
    setSendOpen(false);
    setSelected(new Set());
    toast({
      title: `${sent} email${sent !== 1 ? "s" : ""} sent`,
      description: `Via "${selectedCampaign.name}" campaign`,
    });
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

  const getStatusColor = (status: string) => {
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
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Prospects</h2>
            <p className="text-muted-foreground mt-1">Manage your janitorial commercial targets.</p>
          </div>
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select an active campaign…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCampaigns.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name} · {c.targetIndustry}
                          </SelectItem>
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
                            preview?.id === p.id
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          <Eye className="h-3 w-3" />
                          {p.companyName}
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
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Subject</p>
                            <p className="text-sm font-medium">{previewSubject}</p>
                          </div>
                          <Separator />
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Body</p>
                            <Textarea
                              readOnly
                              value={previewBody || `Hi ${preview.contactName},\n\nWe provide janitorial services for ${preview.industry} companies in ${preview.city}. I'd love to schedule a walkthrough at ${preview.companyName}.\n\nBest,\nYour SDR Team`}
                              className="min-h-[160px] font-mono text-xs bg-background resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
                    <Button
                      onClick={handleSend}
                      disabled={!selectedCampaign || sending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {sending ? "Sending…" : `Send to ${selected.size} Prospect${selected.size !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="py-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search prospects..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
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
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('[role="checkbox"]') || target.tagName === "INPUT") return;
                        navigate(`/prospects/${prospect.id}`);
                      }}
                    >
                      <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(prospect.id)}
                          onCheckedChange={() => toggleOne(prospect.id)}
                          aria-label={`Select ${prospect.companyName}`}
                        />
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
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {prospect.city}, {prospect.state}
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

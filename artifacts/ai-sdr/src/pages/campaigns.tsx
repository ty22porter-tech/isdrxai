import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  getListCampaignsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreVertical,
  Play,
  Pause,
  CheckCircle2,
  Users,
  Mail,
  PhoneCall,
  Calendar,
  Send,
  Megaphone,
  Archive,
  Pencil,
  Trash2,
} from "lucide-react";

const INDUSTRIES = [
  "Healthcare", "Technology", "Legal", "Finance",
  "Commercial Real Estate", "Logistics & Warehousing", "Manufacturing", "Education",
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-gray-100 text-gray-700 border-gray-200" },
  active:    { label: "Active",    color: "bg-green-100 text-green-800 border-green-200" },
  paused:    { label: "Paused",    color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  completed: { label: "Completed", color: "bg-blue-100 text-blue-800 border-blue-200" },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  email: { label: "Email Sequence", icon: Mail,     color: "text-blue-600" },
  call:  { label: "Call Blitz",     icon: PhoneCall, color: "text-green-600" },
  mixed: { label: "Mixed Touches",  icon: Send,      color: "text-purple-600" },
};

const BLANK_FORM = {
  name: "", type: "email", targetIndustry: "", description: "", emailTemplate: "",
};

export default function Campaigns() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useListCampaigns();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [form, setForm] = useState(BLANK_FORM);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(
      { data: { ...form, targetIndustry: form.targetIndustry || "General" } },
      {
        onSuccess: () => {
          toast({ title: "Campaign created" });
          setCreateOpen(false);
          setForm(BLANK_FORM);
          invalidate();
        },
        onError: () => toast({ title: "Failed to create campaign", variant: "destructive" }),
      }
    );
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCampaign) return;
    updateCampaign.mutate(
      { id: editCampaign.id, data: form },
      {
        onSuccess: () => {
          toast({ title: "Campaign updated" });
          setEditCampaign(null);
          invalidate();
        },
        onError: () => toast({ title: "Failed to update campaign", variant: "destructive" }),
      }
    );
  };

  const handleStatusChange = (id: number, status: string) => {
    updateCampaign.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Campaign ${STATUS_CONFIG[status]?.label ?? status}` });
          invalidate();
        },
        onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number, name: string) => {
    deleteCampaign.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: `"${name}" deleted` });
          invalidate();
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  const openEdit = (c: any) => {
    setForm({
      name: c.name,
      type: c.type,
      targetIndustry: c.targetIndustry,
      description: c.description ?? "",
      emailTemplate: c.emailTemplate ?? "",
    });
    setEditCampaign(c);
  };

  const grouped = {
    active:    (campaigns ?? []).filter(c => c.status === "active"),
    draft:     (campaigns ?? []).filter(c => c.status === "draft"),
    paused:    (campaigns ?? []).filter(c => c.status === "paused"),
    completed: (campaigns ?? []).filter(c => c.status === "completed"),
  };

  const renderCard = (c: any) => {
    const type = TYPE_CONFIG[c.type] ?? TYPE_CONFIG.email;
    const status = STATUS_CONFIG[c.status] ?? { label: c.status, color: "bg-gray-100 text-gray-700 border-gray-200" };
    const TypeIcon = type.icon;

    return (
      <Card key={c.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">{c.name}</CardTitle>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <TypeIcon className={`h-3.5 w-3.5 ${type.color}`} />
                <span className={`text-xs font-medium ${type.color}`}>{type.label}</span>
                {c.targetIndustry && (
                  <>
                    <span className="text-muted-foreground text-xs">·</span>
                    <span className="text-xs text-muted-foreground">{c.targetIndustry}</span>
                  </>
                )}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEdit(c)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {c.status === "draft" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(c.id, "active")}>
                    <Play className="mr-2 h-4 w-4 text-green-600" /> Activate
                  </DropdownMenuItem>
                )}
                {c.status === "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(c.id, "paused")}>
                    <Pause className="mr-2 h-4 w-4 text-yellow-600" /> Pause
                  </DropdownMenuItem>
                )}
                {c.status === "paused" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(c.id, "active")}>
                    <Play className="mr-2 h-4 w-4 text-green-600" /> Resume
                  </DropdownMenuItem>
                )}
                {(c.status === "active" || c.status === "paused") && (
                  <DropdownMenuItem onClick={() => handleStatusChange(c.id, "completed")}>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-blue-600" /> Mark Complete
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => handleDelete(c.id, c.name)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {c.description && (
            <CardDescription className="mt-2 text-xs line-clamp-2">{c.description}</CardDescription>
          )}
        </CardHeader>

        <CardContent className="pt-0">
          <Separator className="mb-4" />
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Users className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold">{c.prospectCount ?? 0}</div>
              <div className="text-xs text-muted-foreground">Prospects</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Mail className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold">{c.emailsSent ?? 0}</div>
              <div className="text-xs text-muted-foreground">Emails</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <PhoneCall className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold">{c.callsMade ?? 0}</div>
              <div className="text-xs text-muted-foreground">Calls</div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 text-primary mb-1">
                <Calendar className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-bold text-primary">{c.appointmentsSet ?? 0}</div>
              <div className="text-xs text-muted-foreground">Booked</div>
            </div>
          </div>

          {c.status === "draft" && (
            <Button
              className="w-full mt-4"
              size="sm"
              onClick={() => handleStatusChange(c.id, "active")}
              disabled={updateCampaign.isPending}
            >
              <Play className="mr-2 h-3.5 w-3.5" /> Launch Campaign
            </Button>
          )}
          {c.status === "active" && (
            <Button
              className="w-full mt-4"
              size="sm"
              variant="outline"
              onClick={() => handleStatusChange(c.id, "paused")}
              disabled={updateCampaign.isPending}
            >
              <Pause className="mr-2 h-3.5 w-3.5" /> Pause
            </Button>
          )}
          {c.status === "paused" && (
            <Button
              className="w-full mt-4"
              size="sm"
              onClick={() => handleStatusChange(c.id, "active")}
              disabled={updateCampaign.isPending}
            >
              <Play className="mr-2 h-3.5 w-3.5" /> Resume
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  const CampaignForm = ({ onSubmit, isPending }: { onSubmit: (e: React.FormEvent) => void; isPending: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Campaign Name</Label>
        <Input
          required
          placeholder="e.g. Medical Offices Q3 Outreach"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email Sequence</SelectItem>
              <SelectItem value="call">Call Blitz</SelectItem>
              <SelectItem value="mixed">Mixed Touchpoints</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Target Industry</Label>
          <Select value={form.targetIndustry} onValueChange={v => setForm({ ...form, targetIndustry: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          rows={2}
          placeholder="Goal, target segment, notes..."
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Email Template <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          rows={4}
          placeholder={"Hi {{contactName}},\n\nI noticed {{companyName}} is a growing {{industry}} company in {{city}}..."}
          value={form.emailTemplate}
          onChange={e => setForm({ ...form, emailTemplate: e.target.value })}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Use &#123;&#123;contactName&#125;&#125;, &#123;&#123;companyName&#125;&#125;, &#123;&#123;city&#125;&#125;, &#123;&#123;industry&#125;&#125; as merge fields.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); setEditCampaign(null); }}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : editCampaign ? "Save Changes" : "Create Campaign"}
        </Button>
      </div>
    </form>
  );

  const sectionOrder = ["active", "draft", "paused", "completed"] as const;
  const sectionLabels: Record<string, string> = {
    active: "Active", draft: "Drafts", paused: "Paused", completed: "Completed",
  };
  const sectionIcons: Record<string, any> = {
    active: Play, draft: Megaphone, paused: Pause, completed: Archive,
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Campaigns</h2>
            <p className="text-muted-foreground mt-1">
              Create and manage outreach campaigns. Track emails, calls, and appointments per campaign.
            </p>
          </div>
          <Button onClick={() => { setForm(BLANK_FORM); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="h-44 animate-pulse bg-muted rounded-xl mt-4" /></Card>
            ))}
          </div>
        ) : (campaigns ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <Megaphone className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-muted-foreground">No campaigns yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Create your first campaign to start tracking outreach across a group of prospects.
            </p>
            <Button className="mt-2" onClick={() => { setForm(BLANK_FORM); setCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> New Campaign
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {sectionOrder.map(status => {
              const items = grouped[status];
              if (!items.length) return null;
              const SectionIcon = sectionIcons[status];
              return (
                <section key={status} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <SectionIcon className={`h-4 w-4 ${status === "active" ? "text-green-600" : status === "paused" ? "text-yellow-600" : "text-muted-foreground"}`} />
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                      {sectionLabels[status]} ({items.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map(renderCard)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Set up an outreach campaign and start tracking results.</DialogDescription>
          </DialogHeader>
          <CampaignForm onSubmit={handleCreate} isPending={createCampaign.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCampaign} onOpenChange={o => !o && setEditCampaign(null)}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>Update campaign details and templates.</DialogDescription>
          </DialogHeader>
          <CampaignForm onSubmit={handleEdit} isPending={updateCampaign.isPending} />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

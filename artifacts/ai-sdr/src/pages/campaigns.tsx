import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { generateEmailForStep, type ClientVertical } from "@/lib/email-ai";
import { trackEvent } from "@/lib/analytics";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function aiGenerateEmail(step: number, industry: string): Promise<{ subject: string; body: string } | null> {
  try {
    const res = await fetch("/api/openai/generate-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, industry: industry || undefined }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
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
import { EmailPreview } from "@/components/email-preview";
import { mergeEmailTemplate } from "@/lib/email-template";
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
  Wand2,
  Eye,
} from "lucide-react";

const INDUSTRIES = [
  "Healthcare", "Technology", "Legal", "Finance",
  "Commercial Real Estate", "Logistics & Warehousing", "Manufacturing", "Education",
];

const FLEET_INDUSTRIES = [
  "Home Services", "Roofing", "HVAC", "Plumbing", "Electrical", "Landscaping",
  "Pest Control", "Car Dealerships", "Construction", "Delivery & Logistics",
  "Municipal", "Higher Education", "Commercial",
];

const RECRUITING_CAMPAIGN_INDUSTRIES = [
  "Healthcare", "Oil & Gas", "Technology", "Financial Services",
  "Engineering", "Manufacturing", "Logistics & Warehousing",
];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "bg-muted text-muted-foreground border-border" },
  active:    { label: "Active",    color: "bg-blue-100 text-blue-800 border-blue-200" },
  paused:    { label: "Paused",    color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  completed: { label: "Completed", color: "bg-accent text-accent-foreground border-accent" },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  email: { label: "Email Sequence", icon: Mail,     color: "text-primary" },
  call:  { label: "Call Blitz",     icon: PhoneCall, color: "text-primary" },
  mixed: { label: "Mixed Touches",  icon: Send,      color: "text-primary" },
};

interface SequenceStep {
  dayDelay: number;
  subject: string;
  body: string;
}

interface CampaignForm {
  name: string;
  type: string;
  targetIndustry: string;
  description: string;
  emailTemplate: string;
  followUp1: SequenceStep;
  followUp2: SequenceStep;
  followUp3: SequenceStep;
  followUp4: SequenceStep;
  followUp5: SequenceStep;
  followUp6: SequenceStep;
}

const IT_FORM_OVERRIDES: Partial<Record<typeof FOLLOW_UP_KEYS[number], SequenceStep>> = {
  followUp1: {
    dayDelay: 3,
    subject: "Following up — {{companyName}}",
    body: "Hi {{contactName}},\n\nFor {{industry}} organizations in {{city}}, technology reliability and security can be worth reviewing. Whether that applies to {{companyName}} is something to confirm rather than assume.\n\nWould a brief discovery conversation be useful?\n\nBest,\nYour SDR Team",
  },
  followUp2: {
    dayDelay: 4,
    subject: "Quick question for {{companyName}}",
    body: "Hi {{contactName}},\n\n{{industry}} organizations sometimes review licensing costs and security together, but {{companyName}}'s current environment is unverified.\n\nWould it be useful to compare notes on the current approach?\n\nBest,\nYour SDR Team",
  },
  followUp3: {
    dayDelay: 5,
    subject: "{{companyName}} — a thought",
    body: "Hi {{contactName}},\n\n{{industry}} organizations often balance support responsiveness with security risk. I don't want to assume either is a current issue for {{companyName}}.\n\nIs there an IT priority worth discussing?\n\nBest,\nYour SDR Team",
  },
  followUp4: {
    dayDelay: 7,
    subject: "Still thinking about {{companyName}}",
    body: "Hi {{contactName}},\n\nI'll keep this short. If technology reliability or security is a current priority for {{companyName}}, a discovery conversation may be useful.\n\nWould you like to compare notes on the current approach?\n\nBest,\nYour SDR Team",
  },
  followUp5: {
    dayDelay: 10,
    subject: "One more thought for {{companyName}}",
    body: "Hi {{contactName}},\n\nI'll keep this brief. If technology reliability, licensing, or security is a current priority for {{companyName}}, a discovery conversation may be useful.\n\nIf now isn't the right time, just let me know.\n\nBest,\nYour SDR Team",
  },
  followUp6: {
    dayDelay: 14,
    subject: "Closing the loop — {{companyName}}",
    body: "Hi {{contactName}},\n\nI'll stop reaching out after this — I don't want to be a nuisance. If managed IT services for {{companyName}} ever become a priority, we'd love to help.\n\nWishing you a great week.\n\nBest,\nYour SDR Team",
  },
};

function blankForm(vertical: ClientVertical): CampaignForm {
  if (vertical === "it_services") return { ...BLANK_FORM, ...IT_FORM_OVERRIDES } as CampaignForm;
  if (vertical === "fleet_wraps") {
    return {
      ...BLANK_FORM,
      followUp1: { dayDelay: 3, subject: "Following up on {{companyName}}'s vehicle branding", body: "Hi {{contactName}},\n\nFor {{industry}} organizations, customer-facing vehicles can support recognition throughout {{city}}. Whether that opportunity applies to {{companyName}} is still unverified.\n\nWould a quick conversation about how {{companyName}} currently handles vehicle branding be useful?" },
      followUp2: { dayDelay: 4, subject: "A mobile-visibility question for {{companyName}}", body: "Hi {{contactName}},\n\nCommercial vehicles can sometimes keep a {{industry}} brand visible while crews, technicians, or drivers are already on the road. Before suggesting a solution, it would be useful to understand whether {{companyName}} operates customer-facing vehicles.\n\nIs vehicle branding something {{companyName}} is reviewing?" },
      followUp3: { dayDelay: 5, subject: "{{companyName}} — a fleet-branding question", body: "Hi {{contactName}},\n\nConsistent vehicle branding can matter when an organization has multiple customer-facing vehicle types, but I don't want to assume that applies to {{companyName}}.\n\nWould it help to compare notes on your current approach?" },
      followUp4: { dayDelay: 7, subject: "A practical branding question for {{companyName}}", body: "Hi {{contactName}},\n\nFor {{industry}} businesses in {{city}}, recognizable commercial vehicles can support both professional arrival and local visibility. That is an industry-fit hypothesis, not a claim about {{companyName}}.\n\nDoes {{companyName}} operate customer-facing vehicles today?" },
      followUp5: { dayDelay: 10, subject: "Keeping vehicle branding repeatable", body: "Hi {{contactName}},\n\nWhen a vehicle is replaced or added, reproducing approved graphics can become an operational challenge. If that need applies to {{companyName}}, it may be worth reviewing the current process without assuming a particular fleet size or growth plan.\n\nWorth a brief conversation?" },
      followUp6: { dayDelay: 14, subject: "Closing the loop — {{companyName}}", body: "Hi {{contactName}},\n\nI'll close the loop after this. If vehicle branding becomes a priority for {{companyName}}, a short discovery conversation can clarify the vehicles, brand standards, and business outcome involved before any solution is recommended.\n\nWould a future conversation be useful?" },
    };
  }
  if (vertical === "recruiting_staffing") {
    // Grounded in hiring evidence and the seller's confirmed services only;
    // never claims candidates, placements, or delivery guarantees.
    return {
      ...BLANK_FORM,
      followUp1: { dayDelay: 3, subject: "Following up on hiring at {{companyName}}", body: "Hi {{contactName}},\n\nI’m following up about hiring priorities at {{companyName}} in {{city}}. Whether outside recruiting support would help is something only your team can say.\n\nWould a short hiring-needs discovery call be useful?" },
      followUp2: { dayDelay: 4, subject: "A hiring question for {{companyName}}", body: "Hi {{contactName}},\n\nFor {{industry}} employers, filling specialized roles while keeping current teams productive can be a challenge. That is an industry hypothesis, not an assumption about {{companyName}}.\n\nHow is {{companyName}} approaching its current openings?" },
      followUp3: { dayDelay: 5, subject: "{{companyName}} — staffing for growth", body: "Hi {{contactName}},\n\nIf {{companyName}} has new locations or added capacity coming, it may be worth comparing notes on the roles, timing, and hiring approach involved.\n\nWould a staffing consultation be helpful?" },
      followUp4: { dayDelay: 7, subject: "Current recruiting approach at {{companyName}}", body: "Hi {{contactName}},\n\nSome employers handle hiring fully in-house; others use agencies for specific roles. I do not want to assume which applies to {{companyName}}.\n\nWould it help to talk through your current approach?" },
      followUp5: { dayDelay: 10, subject: "Open roles at {{companyName}}", body: "Hi {{contactName}},\n\nIf any openings at {{companyName}} have been hard to fill, a brief conversation can clarify the roles, start dates, and requirements before any service is recommended.\n\nWorth 15 minutes?" },
      followUp6: { dayDelay: 14, subject: "Closing the loop — {{companyName}}", body: "Hi {{contactName}},\n\nI will close the loop after this. If hiring support becomes a priority for {{companyName}}, a short discovery call can clarify needs first.\n\nWould a future conversation be useful?" },
    };
  }
  return BLANK_FORM;
}

const BLANK_FORM: CampaignForm = {
  name: "", type: "email", targetIndustry: "", description: "", emailTemplate: "",
  followUp1: {
    dayDelay: 3,
    subject: "Following up — {{companyName}}",
    body: "Hi {{contactName}},\n\nFor {{industry}} organizations in {{city}}, facility consistency can be worth reviewing. Whether that applies to {{companyName}} is something to confirm rather than assume.\n\nWould a brief discovery conversation be useful?\n\nBest,\nYour SDR Team",
  },
  followUp2: {
    dayDelay: 4,
    subject: "Quick question for {{companyName}}",
    body: "Hi {{contactName}},\n\n{{industry}} organizations sometimes review cleaning consistency and vendor responsiveness together, but {{companyName}}'s current situation is unverified.\n\nWould it be useful to compare notes on the current approach?\n\nBest,\nYour SDR Team",
  },
  followUp3: {
    dayDelay: 5,
    subject: "{{companyName}} — a thought",
    body: "Hi {{contactName}},\n\n{{industry}} organizations often manage service consistency and vendor responsiveness. I don't want to assume either is a current issue for {{companyName}}.\n\nIs there a facility-service priority worth discussing?\n\nBest,\nYour SDR Team",
  },
  followUp4: {
    dayDelay: 7,
    subject: "Still thinking about {{companyName}}",
    body: "Hi {{contactName}},\n\nI'll keep this short. If facility consistency or vendor responsiveness is a current priority for {{companyName}}, a discovery conversation may be useful.\n\nWould you like to compare notes on the current approach?\n\nBest,\nYour SDR Team",
  },
  followUp5: {
    dayDelay: 10,
    subject: "One more thought for {{companyName}}",
    body: "Hi {{contactName}},\n\nI'll keep this brief. If facility service becomes a priority for {{companyName}}, a discovery conversation may be useful.\n\nIf now isn't the right time, just let me know.\n\nBest,\nYour SDR Team",
  },
  followUp6: {
    dayDelay: 14,
    subject: "Closing the loop — {{companyName}}",
    body: "Hi {{contactName}},\n\nI'll stop reaching out after this — I don't want to be a nuisance. If janitorial services for {{companyName}} ever become a priority, we'd love to help.\n\nWishing you a great week.\n\nBest,\nYour SDR Team",
  },
};

function parseFormFromCampaign(c: any): CampaignForm {
  let followUp1 = BLANK_FORM.followUp1;
  let followUp2 = BLANK_FORM.followUp2;
  let followUp3 = BLANK_FORM.followUp3;
  let followUp4 = BLANK_FORM.followUp4;
  let followUp5 = BLANK_FORM.followUp5;
  let followUp6 = BLANK_FORM.followUp6;
  if (c.callScript) {
    try {
      const parsed = JSON.parse(c.callScript);
      if (parsed.followUp1) followUp1 = parsed.followUp1;
      if (parsed.followUp2) followUp2 = parsed.followUp2;
      if (parsed.followUp3) followUp3 = parsed.followUp3;
      if (parsed.followUp4) followUp4 = parsed.followUp4;
      if (parsed.followUp5) followUp5 = parsed.followUp5;
      if (parsed.followUp6) followUp6 = parsed.followUp6;
    } catch {}
  }
  return {
    name: c.name,
    type: c.type,
    targetIndustry: c.targetIndustry,
    description: c.description ?? "",
    emailTemplate: c.emailTemplate ?? "",
    followUp1, followUp2, followUp3, followUp4, followUp5, followUp6,
  };
}

function buildCallScript(form: CampaignForm): string {
  return JSON.stringify({
    followUp1: form.followUp1,
    followUp2: form.followUp2,
    followUp3: form.followUp3,
    followUp4: form.followUp4,
    followUp5: form.followUp5,
    followUp6: form.followUp6,
  });
}

const STEP_META = [
  { num: 1, label: "Step 1 — Intro Email", sublabel: "sent immediately", color: "bg-primary text-primary-foreground" },
  { num: 2, label: "Step 2 — First Follow-up",  sublabel: "if no reply", color: "bg-primary text-primary-foreground" },
  { num: 3, label: "Step 3 — Value Add",         sublabel: "if no reply", color: "bg-[#315f86] text-white" },
  { num: 4, label: "Step 4 — Case Study",        sublabel: "if no reply", color: "bg-[#4f7395] text-white" },
  { num: 5, label: "Step 5 — New Angle",         sublabel: "if no reply", color: "bg-amber-500 text-white" },
  { num: 6, label: "Step 6 — Last Attempt",      sublabel: "if no reply", color: "bg-orange-500 text-white" },
  { num: 7, label: "Step 7 — Breakup Email",     sublabel: "final touch", color: "bg-red-500 text-white" },
];

const GIFT_STEP_META = [
  { num: 1, label: "Step 1 — Intro Email", sublabel: "sent immediately", color: "bg-primary text-primary-foreground", isLegacy: false },
  { num: 2, label: "Step 2 — Professional Gift", sublabel: "if no reply (Gift Engine)", color: "bg-amber-500 text-white", isGift: true },
  { num: 3, label: "Step 3 — Package Follow-up", sublabel: "after delivery", color: "bg-[#315f86] text-white", isLegacy: true, legacyNum: 2 },
  { num: 4, label: "Step 4 — Value Add",         sublabel: "if no reply", color: "bg-[#4f7395] text-white", isLegacy: true, legacyNum: 3 },
  { num: 5, label: "Step 5 — Case Study",        sublabel: "if no reply", color: "bg-amber-500 text-white", isLegacy: true, legacyNum: 4 },
  { num: 6, label: "Step 6 — New Angle",         sublabel: "if no reply", color: "bg-orange-500 text-white", isLegacy: true, legacyNum: 5 },
  { num: 7, label: "Step 7 — Last Attempt",      sublabel: "if no reply", color: "bg-red-500 text-white", isLegacy: true, legacyNum: 6 },
  { num: 8, label: "Step 8 — Breakup Email",     sublabel: "final touch", color: "bg-red-700 text-white", isLegacy: true, legacyNum: 7 },
];

const FOLLOW_UP_KEYS = ["followUp1", "followUp2", "followUp3", "followUp4", "followUp5", "followUp6"] as const;

const CAMPAIGN_PREVIEW_PROSPECT = {
  contactName: "Angela Morris",
  companyName: "Lone Star Facility Solutions",
  city: "Dallas",
  state: "TX",
};

function mergePreviewTemplate(template: string, industry: string): string {
  return mergeEmailTemplate(template, {
    ...CAMPAIGN_PREVIEW_PROSPECT,
    industry: industry || "your industry",
  });
}

function introPreviewSubject(campaignName: string, vertical: ClientVertical): string {
  const prefix = vertical === "it_services" ? "Managed IT Services" : vertical === "fleet_wraps" ? "Fleet Graphics" : vertical === "recruiting_staffing" ? "Recruiting & Staffing" : "Janitorial Services";
  return `${prefix} for ${campaignName.split(" ").slice(0, 3).join(" ")}`;
}

export default function Campaigns() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: giftSettings } = useQuery({
    queryKey: ["gift-outreach-settings"],
    queryFn: async () => {
      const res = await fetch("/api/gift-outreach/settings");
      if (!res.ok) return null;
      return res.json();
    }
  });
  const isGiftMode = giftSettings?.enabled === true;
  const activeMeta = isGiftMode ? GIFT_STEP_META : STEP_META;

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/users/me`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });
  const vertical: ClientVertical = me?.vertical === "it_services"
    ? "it_services"
    : me?.vertical === "fleet_wraps"
      ? "fleet_wraps"
      : me?.vertical === "recruiting_staffing"
        ? "recruiting_staffing"
        : "janitorial";
  const campaignIndustries = vertical === "fleet_wraps" ? FLEET_INDUSTRIES : vertical === "recruiting_staffing" ? RECRUITING_CAMPAIGN_INDUSTRIES : INDUSTRIES;

  const { data: campaigns, isLoading } = useListCampaigns();
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [launchPreviewCampaign, setLaunchPreviewCampaign] = useState<any>(null);
  const [launchPreviewStep, setLaunchPreviewStep] = useState(1);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCampaign.mutate(
      { data: {
          name: form.name,
          type: form.type,
          targetIndustry: form.targetIndustry || "General",
          description: form.description,
          emailTemplate: form.emailTemplate,
          callScript: buildCallScript(form),
        }
      },
      {
        onSuccess: (_data, variables) => {
          trackEvent("campaign_created", {
            campaign_type: variables.data.type,
            vertical,
          });
          toast({ title: "Campaign created" });
          setCreateOpen(false);
          setForm(blankForm(vertical));
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
      { id: editCampaign.id, data: {
          name: form.name,
          type: form.type,
          targetIndustry: form.targetIndustry,
          description: form.description,
          emailTemplate: form.emailTemplate,
          callScript: buildCallScript(form),
        }
      },
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

  // followUpMode is not in the generated API client's schema, so send it with
  // a plain fetch — the server validates and applies it manually.
  const handleFollowUpModeChange = async (id: number, mode: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followUpMode: mode }),
      });
      if (!res.ok) throw new Error();
      toast({ title: mode === "questionnaire_first" ? "Follow-up set to Option B (questionnaire first)" : "Follow-up set to Option A (meeting request)" });
      invalidate();
    } catch {
      toast({ title: "Failed to update follow-up mode", variant: "destructive" });
    }
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
    setForm(parseFormFromCampaign(c));
    setEditCampaign(c);
  };

  const openLaunchPreview = (campaign: any) => {
    setLaunchPreviewCampaign(campaign);
    setLaunchPreviewStep(1);
  };

  const grouped = {
    active:    (campaigns ?? []).filter(c => c.status === "active"),
    draft:     (campaigns ?? []).filter(c => c.status === "draft"),
    paused:    (campaigns ?? []).filter(c => c.status === "paused"),
    completed: (campaigns ?? []).filter(c => c.status === "completed"),
  };

  const renderCard = (c: any) => {
    const type = TYPE_CONFIG[c.type] ?? TYPE_CONFIG.email;
    const status = STATUS_CONFIG[c.status] ?? { label: c.status, color: "bg-muted text-muted-foreground border-border" };
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
                  <DropdownMenuItem onClick={() => openLaunchPreview(c)}>
                    <Eye className="mr-2 h-4 w-4 text-primary" /> Preview &amp; launch
                  </DropdownMenuItem>
                )}
                {c.status === "active" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(c.id, "paused")}>
                    <Pause className="mr-2 h-4 w-4 text-yellow-600" /> Pause
                  </DropdownMenuItem>
                )}
                {c.status === "paused" && (
                  <DropdownMenuItem onClick={() => handleStatusChange(c.id, "active")}>
                    <Play className="mr-2 h-4 w-4 text-primary" /> Resume
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
              onClick={() => openLaunchPreview(c)}
              disabled={updateCampaign.isPending}
            >
              <Eye className="mr-2 h-3.5 w-3.5" /> Preview &amp; Launch
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

          {/* Repeated-open follow-up: Option A (meeting request) vs Option B (questionnaire first) */}
          {(c.type === "email" || c.type === "mixed") && (
            <div className="mt-4 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Repeated-Open Follow-Up</label>
              <Select
                value={c.followUpMode ?? "meeting_request"}
                onValueChange={v => handleFollowUpModeChange(c.id, v)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting_request">Option A — Meeting request (Calendly link)</SelectItem>
                  <SelectItem value="questionnaire_first">Option B — Questionnaire first, then Calendly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const [aiGenerating, setAiGenerating] = useState<Record<number, boolean>>({});

  const handleAiGenerate = async (stepNum: number) => {
    setAiGenerating(prev => ({ ...prev, [stepNum]: true }));
    const result = await aiGenerateEmail(stepNum, form.targetIndustry);
    setAiGenerating(prev => ({ ...prev, [stepNum]: false }));

    const applyResult = (subject: string, body: string) => {
      if (stepNum === 1) {
        setForm(f => ({ ...f, emailTemplate: body }));
      } else {
        const key = FOLLOW_UP_KEYS[stepNum - 2];
        if (key) setForm(f => ({ ...f, [key]: { ...f[key], subject, body } }));
      }
    };

    if (result?.body) {
      applyResult(result.subject, result.body);
      trackEvent("ai_email_generated", {
        sequence_step: stepNum,
        vertical,
        source: "ai",
      });
    } else {
      const fallback = generateEmailForStep(stepNum, {
        industry: form.targetIndustry,
        companyName: "{{companyName}}",
        contactName: "{{contactName}}",
        city: "{{city}}",
      }, vertical, me?.sellerIntelligenceProfile);
      applyResult(fallback.subject, fallback.body);
      trackEvent("ai_email_generated", {
        sequence_step: stepNum,
        vertical,
        source: "fallback",
      });
    }
  };

  const showEmailSteps = form.type === "email" || form.type === "mixed";
  const launchPreviewForm = launchPreviewCampaign ? parseFormFromCampaign(launchPreviewCampaign) : null;
  const launchStep = launchPreviewStep === 1
    ? {
        subject: launchPreviewCampaign ? introPreviewSubject(launchPreviewCampaign.name, vertical) : "",
        body: launchPreviewForm?.emailTemplate ?? "",
      }
    : (() => {
        const key = FOLLOW_UP_KEYS[launchPreviewStep - 2];
        return key && launchPreviewForm
          ? launchPreviewForm[key]
          : { subject: "", body: "" };
      })();
  const launchPreviewSubject = mergePreviewTemplate(
    "subject" in launchStep ? launchStep.subject : "",
    launchPreviewCampaign?.targetIndustry ?? "",
  );
  const launchPreviewBody = mergePreviewTemplate(
    "body" in launchStep ? launchStep.body : "",
    launchPreviewCampaign?.targetIndustry ?? "",
  );

  const renderStepEditor = (
    stepMeta: any,
    isIntro: boolean,
  ) => {
    if (stepMeta.isGift) {
      return (
        <div key={stepMeta.num} className="space-y-3">
          <Separator />
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${stepMeta.color}`}>
              {stepMeta.num}
            </div>
            <Label className="text-sm font-semibold">{stepMeta.label}</Label>
            <span className="text-xs text-muted-foreground">({stepMeta.sublabel})</span>
          </div>
          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-dashed">
            This step is managed automatically by the Professional Gift Outreach engine. The prospect will receive the physical gift and wait for delivery confirmation.
          </div>
        </div>
      );
    }
    
    // For legacy meta mapping, followUpKey needs to align with legacyNum if present
    const legacyNum = stepMeta.legacyNum || stepMeta.num;
    const followUpKey = isIntro ? null : (FOLLOW_UP_KEYS[legacyNum - 2] as keyof CampaignForm);
    const stepData = isIntro ? null : (form[followUpKey!] as SequenceStep);

    return (
      <div key={stepMeta.num} className="space-y-3">
        <Separator />
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`h-5 w-5 rounded-full text-xs flex items-center justify-center font-bold shrink-0 ${stepMeta.color}`}>
            {stepMeta.num}
          </div>
          <Label className="text-sm font-semibold">{stepMeta.label}</Label>
          <span className="text-xs text-muted-foreground">({stepMeta.sublabel})</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 ml-auto"
            disabled={aiGenerating[stepMeta.num]}
            onClick={() => handleAiGenerate(stepMeta.num)}
          >
            <Wand2 className="h-3 w-3" />
            {aiGenerating[stepMeta.num] ? "Generating…" : "AI Generate"}
          </Button>
          {!isIntro && (
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">Send after</Label>
              <Input
                type="number"
                min={1}
                max={90}
                className="w-16 h-7 text-xs"
                value={stepData!.dayDelay}
                onChange={e => {
                  const key = followUpKey!;
                  setForm(f => ({ ...f, [key]: { ...(f[key] as SequenceStep), dayDelay: parseInt(e.target.value) || 3 } }));
                }}
              />
              <Label className="text-xs text-muted-foreground">days</Label>
            </div>
          )}
        </div>

        {isIntro ? (
          <Textarea
            rows={4}
            placeholder={vertical === "recruiting_staffing"
              ? "Hi {{contactName}},\n\nI noticed {{companyName}} is hiring in {{city}}. Would a short hiring-needs discovery call be useful?..."
              : vertical === "fleet_wraps"
              ? "Hi {{contactName}},\n\nFor {{industry}} organizations, customer-facing vehicles can create ongoing visibility throughout {{city}}..."
              : "Hi {{contactName}},\n\nFor {{industry}} organizations in {{city}}, an operational challenge may be worth reviewing..."}
            value={form.emailTemplate}
            onChange={e => setForm({ ...form, emailTemplate: e.target.value })}
            className="font-mono text-xs"
          />
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Subject line…"
              value={stepData!.subject}
              onChange={e => {
                const key = followUpKey!;
                setForm(f => ({ ...f, [key]: { ...(f[key] as SequenceStep), subject: e.target.value } }));
              }}
              className="text-sm"
            />
            <Textarea
              rows={3}
              value={stepData!.body}
              onChange={e => {
                const key = followUpKey!;
                setForm(f => ({ ...f, [key]: { ...(f[key] as SequenceStep), body: e.target.value } }));
              }}
              className="font-mono text-xs"
            />
          </div>
        )}
      </div>
    );
  };

  const renderCampaignForm = (onSubmit: (e: React.FormEvent) => void, isPending: boolean) => (
    <form onSubmit={onSubmit} className="space-y-5 pt-2">
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
            <SelectTrigger><SelectValue /></SelectTrigger>
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
            <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
            <SelectContent>
              {campaignIndustries.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
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

      {showEmailSteps && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">{isGiftMode ? "8-Step Gift Sequence" : "7-Step Sequence"}</p>
            <div className="flex flex-wrap gap-1">
              {activeMeta.map(s => (
                <span key={s.num} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>
                  {s.num}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Merge fields: <code className="bg-muted rounded px-1">&#123;&#123;contactName&#125;&#125;</code> <code className="bg-muted rounded px-1">&#123;&#123;companyName&#125;&#125;</code> <code className="bg-muted rounded px-1">&#123;&#123;city&#125;&#125;</code> <code className="bg-muted rounded px-1">&#123;&#123;industry&#125;&#125;</code>
            </p>
          </div>

          {renderStepEditor(activeMeta[0], true)}
          {activeMeta.slice(1).map(meta => renderStepEditor(meta, false))}
        </div>
      )}

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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Campaigns</h2>
            <p className="text-muted-foreground mt-1">
              Build 7-step outreach sequences for each industry segment.
            </p>
          </div>
          <Button onClick={() => { setForm(blankForm(vertical)); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="h-52 animate-pulse bg-muted rounded-xl mt-4" /></Card>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {sectionOrder.map(section => {
              const items = grouped[section];
              if (items.length === 0) return null;
              const Icon = sectionIcons[section];
              return (
                <div key={section}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {sectionLabels[section]}
                    </h3>
                    <span className="text-xs text-muted-foreground">({items.length})</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {items.map(renderCard)}
                  </div>
                </div>
              );
            })}
            {Object.values(grouped).every(g => g.length === 0) && (
              <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                <Megaphone className="h-12 w-12 text-muted-foreground/40" />
                <p className="font-semibold text-muted-foreground">No campaigns yet</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Create your first campaign to start building 7-step outreach sequences.
                </p>
                <Button onClick={() => { setForm(blankForm(vertical)); setCreateOpen(true); }}>
                  <Plus className="mr-2 h-4 w-4" /> New Campaign
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Build a 7-step email sequence for your outreach campaign.</DialogDescription>
          </DialogHeader>
          {renderCampaignForm(handleCreate, createCampaign.isPending)}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCampaign} onOpenChange={open => { if (!open) setEditCampaign(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>Update your sequence steps and templates.</DialogDescription>
          </DialogHeader>
          {renderCampaignForm(handleEdit, updateCampaign.isPending)}
        </DialogContent>
      </Dialog>

      {/* Campaign launch preview */}
      <Dialog
        open={!!launchPreviewCampaign}
        onOpenChange={open => { if (!open) setLaunchPreviewCampaign(null); }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Preview campaign before launch</DialogTitle>
            <DialogDescription>
              Review each personalized email as a prospect will see it. Nothing is sent from this preview.
            </DialogDescription>
          </DialogHeader>

          {launchPreviewCampaign && (
            <div className="space-y-5">
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Campaign email steps">
                {activeMeta.map(step => (
                  <Button
                    key={step.num}
                    type="button"
                    size="sm"
                    variant={launchPreviewStep === step.num ? "default" : "outline"}
                    className="shrink-0 rounded-full"
                    onClick={() => setLaunchPreviewStep(step.num)}
                  >
                    {(step as any).isGift ? `Step ${step.num} (Gift)` : `Email ${step.num}`}
                  </Button>
                ))}
              </div>

              <EmailPreview
                subject={launchPreviewSubject}
                body={launchPreviewBody}
                recipientName={CAMPAIGN_PREVIEW_PROSPECT.contactName}
                recipientCompany={CAMPAIGN_PREVIEW_PROSPECT.companyName}
                senderName={me?.senderName}
                senderCompany={me?.businessName}
                senderWebsite={me?.website}
                senderPhone={me?.phone}
                senderMobilePhone={me?.mobilePhone}
                senderEmail={me?.outreachEmail}
                statusLabel="Draft"
                eyebrow={`Email preview · Step ${launchPreviewStep} of 7`}
              />

              <p className="text-xs text-muted-foreground">
                Sample merge data is shown for preview. Each real recipient will receive their own company, contact, city, and industry details.
              </p>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setLaunchPreviewCampaign(null)}>
                  Keep as Draft
                </Button>
                <Button
                  onClick={() => {
                    handleStatusChange(launchPreviewCampaign.id, "active");
                    setLaunchPreviewCampaign(null);
                  }}
                  disabled={updateCampaign.isPending}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {updateCampaign.isPending ? "Launching…" : "Launch Campaign"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

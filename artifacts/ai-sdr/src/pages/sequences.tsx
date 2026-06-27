import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmails,
  useListCampaigns,
  useListProspects,
  useCreateEmail,
  useUpdateEmail,
  getListEmailsQueryKey,
  getListCampaignsQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

function parseSequenceSteps(callScript?: string | null): SequenceStep[] {
  if (!callScript) return [];
  try {
    const data = JSON.parse(callScript);
    const steps: SequenceStep[] = [];
    const keys = ["followUp1","followUp2","followUp3","followUp4","followUp5","followUp6"] as const;
    keys.forEach((key, idx) => {
      if (data[key]?.body) steps.push({ ...data[key], stepNumber: idx + 2 });
    });
    return steps;
  } catch {
    return [];
  }
}

interface SequenceStep {
  stepNumber: number;
  dayDelay: number;
  subject: string;
  body: string;
}

function mergeTpl(tpl: string, prospect: any): string {
  return tpl
    .replace(/\{\{contactName\}\}/g, prospect.contactName ?? "")
    .replace(/\{\{companyName\}\}/g, prospect.companyName ?? "")
    .replace(/\{\{city\}\}/g, prospect.city ?? "")
    .replace(/\{\{state\}\}/g, prospect.state ?? "")
    .replace(/\{\{industry\}\}/g, prospect.industry ?? "");
}

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

interface QueueEntry {
  prospect: any;
  campaign: any;
  step: SequenceStep;
  daysSinceLast: number;
  lastEmailId: number;
}

export default function Sequences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: emails, isLoading: emailsLoading } = useListEmails();
  const { data: campaigns, isLoading: campaignsLoading } = useListCampaigns();
  const { data: prospects, isLoading: prospectsLoading } = useListProspects();
  const createEmail = useCreateEmail();
  const updateEmail = useUpdateEmail();

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState<Set<string>>(new Set());

  const isLoading = emailsLoading || campaignsLoading || prospectsLoading;

  const prospectMap = useMemo(() => {
    const m: Record<number, any> = {};
    (prospects ?? []).forEach(p => { m[p.id] = p; });
    return m;
  }, [prospects]);

  const campaignMap = useMemo(() => {
    const m: Record<number, any> = {};
    (campaigns ?? []).forEach(c => { m[c.id] = c; });
    return m;
  }, [campaigns]);

  const queue = useMemo((): QueueEntry[] => {
    if (!emails || !campaigns) return [];

    // Group emails by prospectId+campaignId
    const groups: Record<string, any[]> = {};
    for (const email of emails) {
      if (!email.campaignId) continue;
      const key = `${email.prospectId}:${email.campaignId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(email);
    }

    const results: QueueEntry[] = [];

    for (const [key, emailGroup] of Object.entries(groups)) {
      const [prospectIdStr, campaignIdStr] = key.split(":");
      const campaignId = parseInt(campaignIdStr);
      const prospectId = parseInt(prospectIdStr);

      const campaign = campaignMap[campaignId];
      if (!campaign || campaign.status !== "active") continue;

      const steps = parseSequenceSteps(campaign.callScript);
      if (steps.length === 0) continue;

      const prospect = prospectMap[prospectId];
      if (!prospect) continue;

      // Sort emails oldest → newest
      const sorted = [...emailGroup].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );
      const latest = sorted[sorted.length - 1];

      // If latest is replied, no follow-up needed
      if (latest.status === "replied") continue;

      // Determine next step (step 1 = intro, step 2 = followUp1, etc.)
      const stepsSent = sorted.length; // 1 = sent intro, 2 = sent follow-up, etc.
      const nextStep = steps.find(s => s.stepNumber === stepsSent + 1);
      if (!nextStep) continue;

      const days = daysSince(latest.sentAt);
      if (days >= nextStep.dayDelay) {
        results.push({
          prospect,
          campaign,
          step: nextStep,
          daysSinceLast: Math.floor(days),
          lastEmailId: latest.id,
        });
      }
    }

    return results.sort((a, b) => b.daysSinceLast - a.daysSinceLast);
  }, [emails, campaigns, prospectMap, campaignMap]);

  const byCampaign = useMemo(() => {
    const m: Record<number, QueueEntry[]> = {};
    for (const entry of queue) {
      const id = entry.campaign.id;
      if (!m[id]) m[id] = [];
      m[id].push(entry);
    }
    return m;
  }, [queue]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListEmailsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
  };

  const sendFollowUp = async (entry: QueueEntry) => {
    const key = `${entry.prospect.id}:${entry.campaign.id}`;
    setSending(prev => new Set(prev).add(key));

    let subject = mergeTpl(entry.step.subject, entry.prospect);
    let body = mergeTpl(entry.step.body, entry.prospect);

    // Try to get a personalized email from OpenAI
    try {
      const res = await fetch("/api/openai/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: entry.prospect.id, step: entry.step.stepNumber }),
      });
      if (res.ok) {
        const generated = await res.json();
        if (generated.body) {
          subject = generated.subject;
          body = generated.body;
        }
      }
    } catch {
      // fall through to template-merged version
    }

    await new Promise<void>(resolve => {
      createEmail.mutate(
        { data: { prospectId: entry.prospect.id, campaignId: entry.campaign.id, subject, body, status: "sent" } },
        {
          onSuccess: () => { resolve(); },
          onError: () => { resolve(); },
        }
      );
    });
    setSending(prev => { const n = new Set(prev); n.delete(key); return n; });
    invalidate();
  };

  const sendAllForCampaign = async (campaignId: number) => {
    const entries = byCampaign[campaignId] ?? [];
    for (const entry of entries) {
      await sendFollowUp(entry);
    }
    toast({ title: `${entries.length} follow-up${entries.length !== 1 ? "s" : ""} sent`, description: campaignMap[campaignId]?.name });
  };

  const markReplied = (emailId: number, prospectName: string) => {
    updateEmail.mutate(
      { id: emailId, data: { status: "replied", repliedAt: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast({ title: `${prospectName} marked as replied` });
          invalidate();
        },
      }
    );
  };

  const toggleCampaign = (id: number) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const STEP_LABELS: Record<number, string> = {
    2: "Follow-up #1",
    3: "Value Add",
    4: "Case Study",
    5: "New Angle",
    6: "Last Attempt",
    7: "Breakup Email",
  };
  const STEP_COLORS: Record<number, string> = {
    2: "bg-blue-100 text-blue-800 border-blue-200",
    3: "bg-indigo-100 text-indigo-800 border-indigo-200",
    4: "bg-violet-100 text-violet-800 border-violet-200",
    5: "bg-amber-100 text-amber-800 border-amber-200",
    6: "bg-orange-100 text-orange-800 border-orange-200",
    7: "bg-red-100 text-red-800 border-red-200",
  };
  const stepLabel = (n: number) => STEP_LABELS[n] ?? `Step ${n}`;
  const stepColor = (n: number) => STEP_COLORS[n] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Follow-up Sequences</h2>
          <p className="text-muted-foreground mt-1">
            Prospects overdue for their next email step. Send follow-ups with one click.
          </p>
        </div>

        {/* How it works */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-900">How sequences work</p>
                <p className="text-sm text-blue-800">
                  Each active campaign has a 7-step email sequence. When a prospect doesn't reply within the configured days, they appear here for the next step. Use the Campaigns page to edit each step's script and timing.
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs text-blue-700 font-medium">
                  <span>Step 1: Intro</span><span>→</span>
                  <span>Step 2: Follow-up</span><span>→</span>
                  <span>Step 3: Value Add</span><span>→</span>
                  <span>Step 4: Case Study</span><span>→</span>
                  <span>Step 5: New Angle</span><span>→</span>
                  <span>Step 6: Last Attempt</span><span>→</span>
                  <span>Step 7: Breakup</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Card key={i}><CardContent className="h-24 animate-pulse bg-muted rounded-xl mt-4" /></Card>)}
          </div>
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500/60" />
            <p className="font-semibold text-muted-foreground">All caught up!</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              No prospects are overdue for a follow-up right now. Check back after your campaigns are running.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byCampaign).map(([campaignIdStr, entries]) => {
              const campaignId = parseInt(campaignIdStr);
              const campaign = campaignMap[campaignId];
              const isCollapsed = collapsed.has(campaignId);

              return (
                <Card key={campaignId}>
                  <CardHeader
                    className="pb-3 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors"
                    onClick={() => toggleCampaign(campaignId)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div>
                          <CardTitle className="text-base">{campaign?.name}</CardTitle>
                          <CardDescription className="mt-0.5">
                            {entries.length} prospect{entries.length !== 1 ? "s" : ""} overdue for follow-up
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={e => { e.stopPropagation(); sendAllForCampaign(campaignId); }}
                        disabled={createEmail.isPending}
                      >
                        <Send className="mr-2 h-3.5 w-3.5" />
                        Send All ({entries.length})
                      </Button>
                    </div>
                  </CardHeader>

                  {!isCollapsed && (
                    <CardContent className="pt-0">
                      <Separator className="mb-3" />
                      <div className="space-y-2">
                        {entries.map(entry => {
                          const key = `${entry.prospect.id}:${entry.campaign.id}`;
                          const isSending = sending.has(key);

                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="min-w-0">
                                  <div className="font-medium text-sm">{entry.prospect.companyName}</div>
                                  <div className="text-xs text-muted-foreground">{entry.prospect.contactName} · {entry.prospect.city}</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${stepColor(entry.step.stepNumber)}`}>
                                  {stepLabel(entry.step.stepNumber)}
                                </span>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {entry.daysSinceLast}d ago
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => markReplied(entry.lastEmailId, entry.prospect.companyName)}
                                  disabled={updateEmail.isPending}
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3 text-green-600" />
                                  Replied
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => sendFollowUp(entry)}
                                  disabled={isSending}
                                >
                                  {isSending ? (
                                    <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="mr-1 h-3 w-3" />
                                  )}
                                  Send
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

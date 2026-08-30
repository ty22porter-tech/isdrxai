import { useState } from "react";
import { useParams } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { 
  useGetProspect,
  useUpdateProspect,
  useListEmails, 
  useListCalls, 
  useListAppointments,
  useGenerateEmail,
  useCreateEmail,
  useGenerateCallScript,
  useCreateCall,
  useCreateAppointment,
  getGetProspectQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, MapPin, Phone, Mail, Globe, Users, Maximize, 
  Sparkles, Send, PhoneCall, Calendar, ChevronRight,
  Eye, EyeOff, MousePointerClick, Paperclip, Flame, AlertTriangle,
  CalendarCheck, MessageSquare, Lightbulb, FileQuestion
} from "lucide-react";
import { InterestBadge } from "@/components/interest-badge";
import { EmailPreview } from "@/components/email-preview";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TimelineItem {
  ts: string;
  type: string;
  title: string;
  detail: string | null;
  source: string;
}

interface TimelineResponse {
  interestLevel: "low" | "medium" | "hot";
  systemInterestLevel: string;
  manualInterestLevel: string | null;
  engagementScore: number;
  nextAction: string;
  nextActionReason: string;
  items: TimelineItem[];
}

const TIMELINE_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }> = {
  email_sent:                  { icon: Send,              bg: "bg-blue-100 dark:bg-blue-950",     fg: "text-blue-600 dark:text-blue-400" },
  email_delivered:             { icon: Mail,              bg: "bg-green-100 dark:bg-green-950",   fg: "text-green-600 dark:text-green-400" },
  email_bounced:               { icon: AlertTriangle,     bg: "bg-red-100 dark:bg-red-950",       fg: "text-red-600 dark:text-red-400" },
  reply:                       { icon: MessageSquare,     bg: "bg-emerald-100 dark:bg-emerald-950", fg: "text-emerald-600 dark:text-emerald-400" },
  open:                        { icon: Eye,               bg: "bg-blue-100 dark:bg-blue-950",     fg: "text-blue-600 dark:text-blue-400" },
  open_filtered:               { icon: EyeOff,            bg: "bg-muted",                          fg: "text-muted-foreground" },
  click_filtered:              { icon: MousePointerClick, bg: "bg-muted",                          fg: "text-muted-foreground" },
  link_click:                  { icon: MousePointerClick, bg: "bg-green-100 dark:bg-green-950",   fg: "text-green-600 dark:text-green-400" },
  calendly_click:              { icon: Calendar,          bg: "bg-primary/10",                     fg: "text-primary" },
  attachment_view:             { icon: Paperclip,         bg: "bg-purple-100 dark:bg-purple-950", fg: "text-purple-600 dark:text-purple-400" },
  attachment_download:         { icon: Paperclip,         bg: "bg-purple-100 dark:bg-purple-950", fg: "text-purple-600 dark:text-purple-400" },
  interest_change:             { icon: Flame,             bg: "bg-orange-100 dark:bg-orange-950", fg: "text-orange-600 dark:text-orange-400" },
  meeting_request_sent:        { icon: Send,              bg: "bg-primary/10",                     fg: "text-primary" },
  meeting_request_queued:      { icon: Send,              bg: "bg-muted",                          fg: "text-muted-foreground" },
  meeting_request_suppressed:  { icon: AlertTriangle,     bg: "bg-muted",                          fg: "text-muted-foreground" },
  meeting_scheduled:           { icon: CalendarCheck,     bg: "bg-emerald-100 dark:bg-emerald-950", fg: "text-emerald-600 dark:text-emerald-400" },
  questionnaire_opened:        { icon: FileQuestion,      bg: "bg-blue-100 dark:bg-blue-950",     fg: "text-blue-600 dark:text-blue-400" },
  questionnaire_submitted:     { icon: FileQuestion,      bg: "bg-emerald-100 dark:bg-emerald-950", fg: "text-emerald-600 dark:text-emerald-400" },
  positive_reply:              { icon: MessageSquare,     bg: "bg-emerald-100 dark:bg-emerald-950", fg: "text-emerald-600 dark:text-emerald-400" },
};

function useProspectTimeline(prospectId: number) {
  return useQuery<TimelineResponse>({
    queryKey: ["prospect-timeline", prospectId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/engagement/prospects/${prospectId}/timeline`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!prospectId,
    staleTime: 30_000,
  });
}

const PIPELINE_STAGES = [
  { value: "new",               label: "New",               color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "contacted",         label: "Contacted",         color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "interested",        label: "Interested",        color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "qualified",         label: "Qualified",         color: "bg-purple-100 text-purple-800 border-purple-200" },
  { value: "appointment_set",   label: "Appointment Set",   color: "bg-green-100 text-green-800 border-green-200" },
  { value: "closed_won",        label: "Closed Won",        color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "closed_lost",       label: "Closed Lost",       color: "bg-red-100 text-red-800 border-red-200" },
];

export default function ProspectDetail() {
  const { id } = useParams<{ id: string }>();
  const prospectId = parseInt(id, 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: prospect, isLoading } = useGetProspect(prospectId, { query: { queryKey: getGetProspectQueryKey(prospectId), enabled: !!prospectId } });
  const { data: timeline, isLoading: timelineLoading } = useProspectTimeline(prospectId);
  const { data: emails } = useListEmails({ prospectId });
  const { data: calls } = useListCalls({ prospectId });
  const { data: appointments } = useListAppointments({ status: "scheduled" });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/users/me`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load profile");
      return res.json();
    },
  });

  const updateProspect = useUpdateProspect();
  const generateEmail = useGenerateEmail();
  const createEmail = useCreateEmail();
  const generateCallScript = useGenerateCallScript();
  const createCall = useCreateCall();

  const handleStatusChange = (newStatus: string) => {
    updateProspect.mutate(
      { id: prospectId, data: { status: newStatus } },
      {
        onSuccess: () => {
          const stage = PIPELINE_STAGES.find(s => s.value === newStatus);
          toast({ title: `Status updated to "${stage?.label ?? newStatus}"` });
          queryClient.invalidateQueries({ queryKey: getGetProspectQueryKey(prospectId) });
        },
        onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
      }
    );
  };

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [callNotes, setCallNotes] = useState("");

  const createAppointment = useCreateAppointment();
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughDate, setWalkthroughDate] = useState("");
  const [walkthroughTime, setWalkthroughTime] = useState("10:00");
  const [walkthroughLocation, setWalkthroughLocation] = useState("");
  const [walkthroughNotes, setWalkthroughNotes] = useState("");

  const handleBookWalkthrough = (e: React.FormEvent) => {
    e.preventDefault();
    const scheduledAt = new Date(`${walkthroughDate}T${walkthroughTime}`).toISOString();
    createAppointment.mutate(
      {
        data: {
          prospectId,
          type: "walkthrough",
          scheduledAt,
          location: walkthroughLocation || undefined,
          notes: walkthroughNotes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Walkthrough booked!", description: `Scheduled for ${new Date(scheduledAt).toLocaleString()}` });
          setWalkthroughOpen(false);
          setWalkthroughDate("");
          setWalkthroughTime("10:00");
          setWalkthroughLocation("");
          setWalkthroughNotes("");
          updateProspect.mutate({ id: prospectId, data: { status: "appointment_set" } }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetProspectQueryKey(prospectId) }),
          });
        },
        onError: () => toast({ title: "Failed to book walkthrough", variant: "destructive" }),
      }
    );
  };

  const handleGenerateEmail = () => {
    setIsGeneratingEmail(true);
    generateEmail.mutate(
      { data: { prospectId, tone: "professional" } },
      {
        onSuccess: (data) => {
          setEmailSubject(data.subject);
          setEmailBody(data.body);
          setIsGeneratingEmail(false);
        },
        onError: () => {
          setIsGeneratingEmail(false);
          toast({ title: "Failed to generate email", variant: "destructive" });
        }
      }
    );
  };

  const handleSendEmail = () => {
    createEmail.mutate(
      { data: { prospectId, subject: emailSubject, body: emailBody, status: "sent" } },
      {
        onSuccess: () => {
          toast({ title: "Email sent successfully" });
          setEmailModalOpen(false);
        },
        onError: (err: any) => {
          toast({
            title: "Email not sent",
            description: err?.data?.error || err?.message || "Send failed",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleGenerateScript = () => {
    setIsGeneratingScript(true);
    generateCallScript.mutate(
      { data: { prospectId, objective: "Book Walkthrough" } },
      {
        onSuccess: (data) => {
          setGeneratedScript(data);
          setIsGeneratingScript(false);
        },
        onError: () => {
          setIsGeneratingScript(false);
          toast({ title: "Failed to generate script", variant: "destructive" });
        }
      }
    );
  };

  const handleLogCall = () => {
    createCall.mutate(
      { data: { prospectId, status: "completed", notes: callNotes, callScript: generatedScript?.script } },
      {
        onSuccess: () => {
          toast({ title: "Call logged successfully" });
          setScriptModalOpen(false);
          setCallNotes("");
          setGeneratedScript(null);
        }
      }
    );
  };

  if (isLoading) return <Layout><div className="p-8">Loading prospect data...</div></Layout>;
  if (!prospect) return <Layout><div className="p-8">Prospect not found.</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-card p-6 rounded-lg border shadow-sm">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-bold tracking-tight">{prospect.companyName}</h2>
              <div className="flex items-center gap-2">
                <Select value={prospect.status} onValueChange={handleStatusChange} disabled={updateProspect.isPending}>
                  <SelectTrigger className={`h-7 text-xs font-semibold border px-2.5 py-0 rounded-full w-auto gap-1.5 ${PIPELINE_STAGES.find(s => s.value === prospect.status)?.color ?? ""}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((stage, i) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        <div className="flex items-center gap-2">
                          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${stage.color}`}>
                            {stage.label}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {updateProspect.isPending && (
                  <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>
                )}
                <InterestBadge prospect={prospect} showLabel />
              </div>
            </div>
            {timeline && (
              <div className="mt-4 flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 max-w-xl">
                <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium">Recommended next action: </span>
                  {timeline.nextAction}
                  <p className="text-xs text-muted-foreground mt-0.5">{timeline.nextActionReason}</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /> {prospect.contactName}</div>
              <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /> {prospect.email}</div>
              <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /> {prospect.phone}</div>
              <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> {prospect.city}, {prospect.state}</div>
              <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /> {prospect.industry}</div>
              {prospect.website && <div className="flex items-center gap-2 text-muted-foreground"><Globe className="h-4 w-4" /> {prospect.website}</div>}
              {prospect.employeeCount && <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /> {prospect.employeeCount} Employees</div>}
              {prospect.squareFootage && <div className="flex items-center gap-2 text-muted-foreground"><Maximize className="h-4 w-4" /> {prospect.squareFootage.toLocaleString()} sqft</div>}
            </div>
          </div>
          
          <div className="flex flex-col gap-2 shrink-0">
            <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
              <DialogTrigger asChild>
                <Button className="w-full" onClick={() => {if (!emailSubject) handleGenerateEmail()}}><Sparkles className="mr-2 h-4 w-4" /> Generate AI Email</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[980px]">
                <DialogHeader>
                  <DialogTitle>AI Email Generator</DialogTitle>
                  <DialogDescription>Personalized outreach for {prospect.companyName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {isGeneratingEmail ? (
                    <div className="py-8 text-center text-muted-foreground animate-pulse">Analyzing prospect data & generating email...</div>
                  ) : (
                    <>
                      <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Subject Line</label>
                            <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Email Body</label>
                            <Textarea className="min-h-[300px] text-sm leading-relaxed" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
                          </div>
                        </div>
                        <EmailPreview
                          subject={emailSubject}
                          body={emailBody}
                          recipientName={prospect.contactName}
                          recipientCompany={prospect.companyName}
                          recipientEmail={prospect.email}
                          senderName={me?.senderName}
                          senderCompany={me?.businessName}
                          senderWebsite={me?.website}
                          senderPhone={me?.phone}
                          senderMobilePhone={me?.mobilePhone}
                          senderEmail={me?.outreachEmail}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={handleGenerateEmail}><Sparkles className="mr-2 h-4 w-4" /> Regenerate</Button>
                        <Button onClick={handleSendEmail}><Send className="mr-2 h-4 w-4" /> Send Email</Button>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={scriptModalOpen} onOpenChange={setScriptModalOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="w-full" onClick={() => {if (!generatedScript) handleGenerateScript()}}>
                  <PhoneCall className="mr-2 h-4 w-4" /> AI Call Script
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Smart Call Script</DialogTitle>
                  <DialogDescription>Talk track optimized for {prospect.industry} cleaning needs</DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {isGeneratingScript ? (
                    <div className="py-8 text-center text-muted-foreground animate-pulse">Synthesizing talk track...</div>
                  ) : generatedScript ? (
                    <>
                      <Card className="bg-primary/5 border-primary/20">
                        <CardHeader className="pb-2"><CardTitle className="text-base text-primary">The Script</CardTitle></CardHeader>
                        <CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{generatedScript.script}</p></CardContent>
                      </Card>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-base">Key Points</CardTitle></CardHeader>
                          <CardContent>
                            <ul className="list-disc pl-4 space-y-1 text-sm text-muted-foreground">
                              {generatedScript.keyPoints.map((kp: string, i: number) => <li key={i}>{kp}</li>)}
                            </ul>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-base">Objection Handling</CardTitle></CardHeader>
                          <CardContent className="space-y-3">
                            {generatedScript.objectionHandlers.map((obj: any, i: number) => (
                              <div key={i} className="text-sm">
                                <span className="font-semibold block text-red-600/80 dark:text-red-400">"{obj.objection}"</span>
                                <span className="text-muted-foreground">→ {obj.response}</span>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      </div>

                      <div className="border-t pt-4 space-y-3">
                        <h4 className="font-medium text-sm">Log Call Outcome</h4>
                        <Textarea placeholder="Notes from the call..." value={callNotes} onChange={e => setCallNotes(e.target.value)} />
                        <div className="flex justify-end">
                          <Button onClick={handleLogCall}>Save Call Log</Button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={walkthroughOpen} onOpenChange={setWalkthroughOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full"><Calendar className="mr-2 h-4 w-4" /> Book Walkthrough</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Book a Walkthrough</DialogTitle>
                  <DialogDescription>Schedule an on-site visit with {prospect.companyName}. The prospect status will be automatically updated to "Appointment Set".</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleBookWalkthrough} className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date</label>
                      <Input
                        type="date"
                        required
                        value={walkthroughDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={e => setWalkthroughDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Time</label>
                      <Input
                        type="time"
                        required
                        value={walkthroughTime}
                        onChange={e => setWalkthroughTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Location <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input
                      placeholder={`e.g. ${prospect.city} office, Suite 200`}
                      value={walkthroughLocation}
                      onChange={e => setWalkthroughLocation(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Textarea
                      placeholder="What to bring, parking info, who to ask for..."
                      rows={3}
                      value={walkthroughNotes}
                      onChange={e => setWalkthroughNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setWalkthroughOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createAppointment.isPending}>
                      <Calendar className="mr-2 h-4 w-4" />
                      {createAppointment.isPending ? "Booking…" : "Confirm Walkthrough"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="timeline">Activity</TabsTrigger>
            <TabsTrigger value="emails">Emails</TabsTrigger>
            <TabsTrigger value="calls">Calls</TabsTrigger>
          </TabsList>
          
          <TabsContent value="timeline" className="pt-6">
            <Card>
              <CardHeader>
                <CardTitle>Engagement Timeline</CardTitle>
                <CardDescription>
                  Every event in chronological order — sends, deliveries, opens (estimated), clicks, interest changes, and meetings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <p className="text-sm text-muted-foreground animate-pulse">Loading timeline…</p>
                ) : (
                  <div className="space-y-6">
                    {(() => {
                      const events: { key: string; ts: string; icon: React.ReactNode; title: string; detail?: string | null; source: string }[] = [
                        ...(timeline?.items ?? []).map((it, i) => {
                          const cfg = TIMELINE_ICONS[it.type] ?? TIMELINE_ICONS.email_sent;
                          const Icon = cfg.icon;
                          return {
                            key: `t-${i}`,
                            ts: it.ts,
                            icon: <div className={`mt-1 h-8 w-8 rounded-full ${cfg.bg} flex items-center justify-center shrink-0`}><Icon className={`h-4 w-4 ${cfg.fg}`} /></div>,
                            title: it.title,
                            detail: it.detail,
                            source: it.source,
                          };
                        }),
                        ...(calls ?? []).map(c => ({
                          key: `c-${c.id}`,
                          ts: c.createdAt,
                          icon: <div className="mt-1 h-8 w-8 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0"><PhoneCall className="h-4 w-4 text-green-600 dark:text-green-400" /></div>,
                          title: `Call logged: ${c.status.replace(/_/g, " ")}`,
                          detail: c.notes ?? null,
                          source: "Calls",
                        })),
                      ].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
                      if (!events.length) return <p className="text-muted-foreground text-sm">No activity recorded yet.</p>;
                      return events.map(ev => (
                        <div key={ev.key} className="flex gap-4">
                          {ev.icon}
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{ev.title}</p>
                            {ev.detail && <p className="text-sm text-muted-foreground mt-0.5 break-words">{ev.detail}</p>}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(ev.ts).toLocaleString()} · {ev.source}
                            </p>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="emails" className="pt-6">
            <Card>
              <CardContent className="p-0">
                {emails?.length ? (
                  <div className="divide-y">
                    {emails.map(e => (
                      <div key={e.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm">{e.subject}</h4>
                          <Badge variant="outline">{e.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(e.sentAt).toLocaleString()}</p>
                        <div className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">{e.body}</div>
                      </div>
                    ))}
                  </div>
                ) : <div className="p-8 text-center text-muted-foreground">No emails sent.</div>}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="calls" className="pt-6">
            <Card>
              <CardContent className="p-0">
                {calls?.length ? (
                  <div className="divide-y">
                    {calls.map(c => (
                      <div key={c.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm capitalize">{c.status.replace(/_/g, " ")}</h4>
                          <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                        </div>
                        {c.outcome && <p className="text-sm font-medium text-primary">Outcome: {c.outcome}</p>}
                        {c.notes && <div className="bg-muted p-3 rounded text-sm">{c.notes}</div>}
                      </div>
                    ))}
                  </div>
                ) : <div className="p-8 text-center text-muted-foreground">No calls logged.</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

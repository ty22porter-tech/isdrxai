import { useState } from "react";
import { useParams } from "wouter";
import { 
  useGetProspect, 
  useListEmails, 
  useListCalls, 
  useListAppointments,
  useGenerateEmail,
  useCreateEmail,
  useGenerateCallScript,
  useCreateCall
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, MapPin, Phone, Mail, Globe, Users, Maximize, 
  Sparkles, Send, PhoneCall, Calendar
} from "lucide-react";

export default function ProspectDetail() {
  const { id } = useParams<{ id: string }>();
  const prospectId = parseInt(id, 10);
  const { toast } = useToast();

  const { data: prospect, isLoading } = useGetProspect(prospectId, { query: { enabled: !!prospectId } });
  const { data: emails } = useListEmails({ prospectId });
  const { data: calls } = useListCalls({ prospectId });
  const { data: appointments } = useListAppointments({ status: "scheduled" });

  const generateEmail = useGenerateEmail();
  const createEmail = useCreateEmail();
  const generateCallScript = useGenerateCallScript();
  const createCall = useCreateCall();

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [callNotes, setCallNotes] = useState("");

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
        }
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
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight">{prospect.companyName}</h2>
              <Badge className="uppercase tracking-widest">{prospect.status.replace(/_/g, " ")}</Badge>
            </div>
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
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>AI Email Generator</DialogTitle>
                  <DialogDescription>Personalized outreach for {prospect.companyName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {isGeneratingEmail ? (
                    <div className="py-8 text-center text-muted-foreground animate-pulse">Analyzing prospect data & generating email...</div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Subject Line</label>
                        <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Email Body</label>
                        <Textarea className="min-h-[250px] font-mono text-sm" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
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
            
            <Button variant="outline" className="w-full"><Calendar className="mr-2 h-4 w-4" /> Book Walkthrough</Button>
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
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-8">
                  {/* Mocked timeline for demo completeness. In reality, would fetch merged activity feed */}
                  {emails?.map(e => (
                    <div key={`e-${e.id}`} className="flex gap-4">
                      <div className="mt-1 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <Mail className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Email Sent: {e.subject}</p>
                        <p className="text-xs text-muted-foreground">{new Date(e.sentAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  {calls?.map(c => (
                    <div key={`c-${c.id}`} className="flex gap-4">
                      <div className="mt-1 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <PhoneCall className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Call Logged: {c.status}</p>
                        {c.notes && <p className="text-sm text-muted-foreground mt-1">{c.notes}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(c.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                  {(!emails?.length && !calls?.length) && <p className="text-muted-foreground text-sm">No activity recorded yet.</p>}
                </div>
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

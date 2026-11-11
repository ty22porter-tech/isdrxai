import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const examples = ["What does Possible Fit mean?", "How do I create a Recruiting campaign?", "Does Gift Suggestions send a gift?", "What is the difference between Calls and Caller Workspace?"];
const sectionNames: Record<string, string> = { dashboard: "Overview", leadership: "Leadership", autopilot: "Autopilot", prospecting: "Prospect Search", prospects: "Prospects", campaigns: "Campaigns", "gift-outreach": "Gift Outreach", sequences: "Sequences", emails: "Emails", calls: "Calls", appointments: "Appointments", caller: "Caller Workspace", billing: "Billing", pricing: "Billing", settings: "Settings", help: "Help & Training", admin: "Administrator sections" };
async function request(path: string, body: object) {
  const res = await fetch(`/api/help/${path}`, { method: "POST", credentials: "include", signal: AbortSignal.timeout(50_000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(typeof data?.error === "string" ? data.error : "We couldn’t complete that request. Please retry or contact support.");
  return data;
}
type Answer = { answered: boolean; answer: string; sources: Array<{ title: string; href: string }> };

export function AskIsdrxAI({ email = "", location = "/help" }: { email?: string; location?: string }) {
  const page = sectionNames[location.split("/").filter(Boolean)[0]] ?? "Help & Training";
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportEmail, setSupportEmail] = useState(email);
  const [supportQuestion, setSupportQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const inFlight = useRef(false);
  const sendInFlight = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  useEffect(() => { if (email) setSupportEmail(current => current || email); }, [email]);

  const ask = async (value = question) => {
    const text = value.trim();
    if (inFlight.current || text.length < 3) return;
    inFlight.current = true;
    setBusy(true); setError(""); setAnswer(null); setLastQuestion(text);
    setSupportOpen(false); setConfirmation(""); setSupportError(""); setSupportQuestion(text);
    requestKey.current = crypto.randomUUID();
    try {
      const result = await request("answer", { question: text, page });
      if (typeof result.answered !== "boolean" || typeof result.answer !== "string" || !Array.isArray(result.sources) || !result.sources.every((source: any) => typeof source?.title === "string" && typeof source?.href === "string")) throw new Error("The help answer could not be loaded. Please contact support below.");
      setAnswer(result); setQuestion("");
      if (!result.answered) setSupportOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Help is unavailable. Please contact support below."); setSupportOpen(true); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const openSupport = () => { if (!supportQuestion) setSupportQuestion(lastQuestion || question); setSupportOpen(true); };
  const submitSupport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sendInFlight.current || confirmation) return;
    sendInFlight.current = true; setSending(true); setSupportError("");
    try {
      const result = await request("support", { email: supportEmail.trim(), question: supportQuestion.trim(), page, requestKey: requestKey.current });
      if (result.ok !== true || typeof result.message !== "string" || !result.message.trim()) throw new Error("The support submission was not confirmed. Please retry.");
      setConfirmation(result.message);
    } catch (err) { setSupportError(err instanceof Error ? err.message : "Your question could not be sent. Please retry."); }
    finally { sendInFlight.current = false; setSending(false); }
  };

  return <Sheet open={open} onOpenChange={setOpen}>
    <div className="fixed bottom-20 right-4 z-40 sm:right-6"><SheetTrigger asChild><Button className="gap-2 rounded-full shadow-lg" aria-label="Ask iSDRX AI"><MessageCircle className="h-4 w-4" />Ask iSDRX AI</Button></SheetTrigger></div>
    <SheetContent side="right" className="flex h-[100dvh] w-full flex-col gap-0 p-0 sm:max-w-lg">
      <SheetHeader className="border-b p-5 pr-12 text-left"><SheetTitle>Ask iSDRX AI</SheetTitle><SheetDescription>Get help with features, buttons, and fit scores.</SheetDescription><p className="text-xs text-muted-foreground">Current section: {page}</p></SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">Ask how to use the app. Answers are grounded in Help &amp; Training; private account status and actions aren’t available here.</p>
        {!lastQuestion && <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Try a question</p>{examples.map(example => <Button key={example} variant="outline" className="h-auto w-full justify-start whitespace-normal py-3 text-left text-sm" onClick={() => void ask(example)} disabled={busy}>{example}</Button>)}</div>}
        {lastQuestion && <div className="rounded-xl bg-primary/10 p-4 text-sm"><p className="mb-1 text-xs font-semibold text-primary">Your question</p><p className="whitespace-pre-wrap break-words">{lastQuestion}</p></div>}
        {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking the app guide…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {answer && <div className="space-y-3" aria-live="polite"><p className="whitespace-pre-line break-words text-sm leading-relaxed">{answer.answer}</p>{answer.sources.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground">From the app guide</p>{answer.sources.filter(source => /^\/help#[a-z0-9-]+$/.test(source.href)).map(source => <a key={source.href} href={`${BASE}${source.href}`} className="flex items-center gap-2 text-sm text-primary underline underline-offset-4"><BookOpen className="h-4 w-4" />{source.title}</a>)}</div>}</div>}
        {!supportOpen && <Button variant="outline" className="w-full gap-2" onClick={openSupport}><Mail className="h-4 w-4" />Contact Support</Button>}
        {supportOpen && <section className="space-y-3 rounded-xl border bg-muted/20 p-4" aria-label="Contact support">
          <h3 className="font-semibold">Contact Support</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">Review your email and question before sending. Only this submission and the app section are sent to support—not an automatic chat transcript.</p>
          {confirmation ? <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{confirmation}</p> : <form onSubmit={submitSupport} className="space-y-3">
            <div><label htmlFor="help-reply-email" className="text-sm font-medium">Your reply email</label><Input id="help-reply-email" type="email" required maxLength={320} value={supportEmail} onChange={event => { setSupportEmail(event.target.value); requestKey.current = crypto.randomUUID(); }} disabled={sending} className="mt-1" /></div>
            <div><label htmlFor="help-support-question" className="text-sm font-medium">Your question for support</label><Textarea id="help-support-question" required minLength={3} maxLength={2000} rows={5} value={supportQuestion} onChange={event => { setSupportQuestion(event.target.value); requestKey.current = crypto.randomUUID(); }} disabled={sending} className="mt-1" /></div>
            {supportError && <p role="alert" className="text-sm text-destructive">{supportError}</p>}
            <Button type="submit" disabled={sending || supportQuestion.trim().length < 3} className="w-full gap-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "Sending…" : "Send to Support"}</Button>
          </form>}
          <p className="text-xs text-muted-foreground">Support inbox: <a href="mailto:info@isdrxai.com" className="text-primary underline">info@isdrxai.com</a></p>
          <Button variant="ghost" size="sm" onClick={() => setSupportOpen(false)}>Back to help</Button>
        </section>}
        <a href={`${BASE}/help`} className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4"><BookOpen className="h-4 w-4" />Browse the full Help &amp; Training guide</a>
      </div>
      <form onSubmit={event => { event.preventDefault(); void ask(); }} className="shrink-0 space-y-2 border-t bg-card p-4">
        <label htmlFor="help-question" className="text-sm font-medium">Ask about iSDRX AI</label>
        <Textarea id="help-question" rows={2} minLength={3} maxLength={2000} required value={question} onChange={event => setQuestion(event.target.value)} placeholder="How do I use this section?" disabled={busy} />
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{question.length}/2,000</span><Button type="submit" disabled={busy || question.trim().length < 3} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Ask</Button></div>
      </form>
    </SheetContent>
  </Sheet>;
}

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Maximize2, Play, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getConversionVisitorId, getLastConversionLocation, trackEvent } from "@/lib/analytics";
import { activityLinkingAllowed } from "@/lib/visitor-activity";

const APP_ORIGIN = window.location.origin;
const VIDEOS = [
  { id: "trade-services", analyticsId: "trade_services", label: "Commercial Trade Services", url: `${APP_ORIGIN}/ai-sdr-video/` },
  { id: "it-services", analyticsId: "it_services", label: "IT Services / MSP", url: `${APP_ORIGIN}/ai-sdr-video-it/` },
] as const;

export default function BookDemoPage() {
  const [activeVideo, setActiveVideo] = useState<(typeof VIDEOS)[number]>(VIDEOS[0]);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", industry: "trade-services", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const videoBoxRef = useRef<HTMLDivElement>(null);
  const goFullscreen = () => {
    const el = videoBoxRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    // iOS Safari doesn't support fullscreen on non-video elements — fall back
    // to opening the video in its own tab, which fills the screen.
    if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => window.open(activeVideo.url, "_blank"));
    } else if (el?.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else {
      window.open(activeVideo.url, "_blank");
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          visitorId: getConversionVisitorId(),
          sourceLocation: getLastConversionLocation(),
          activityConsent: activityLinkingAllowed(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      trackEvent("demo_request_completed", {
        location: getLastConversionLocation(),
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-center mt-8 mb-12">
          <h1 className="text-4xl md:text-5xl font-bold">
            See iSDRX AI <span className="text-accent">in action</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Watch the product tour for your industry, then tell us how to reach you — our team will set up a personal walkthrough.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Product videos */}
          <div>
            <div className="flex gap-2 mb-4">
              {VIDEOS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setActiveVideo(v);
                    trackEvent("product_video_selected", { video_id: v.analyticsId });
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                    activeVideo.id === v.id
                      ? "bg-primary text-white border-primary"
                      : "bg-card text-muted-foreground border-white/10 hover:text-white"
                  }`}
                >
                  <Play className="w-3.5 h-3.5" /> {v.label}
                </button>
              ))}
            </div>
            <div ref={videoBoxRef} className="relative rounded-2xl overflow-hidden border border-white/10 bg-card aspect-video group">
              <iframe
                key={activeVideo.id}
                src={activeVideo.url}
                title={`iSDRX AI product video — ${activeVideo.label}`}
                className="w-full h-full"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
              <button
                onClick={goFullscreen}
                aria-label="Expand video to full screen"
                title="Full screen"
                className="absolute top-3 right-3 p-2 rounded-lg bg-black/60 text-white border border-white/20 hover:bg-black/80 transition-colors"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Now playing: <span className="text-white">{activeVideo.label}</span> — use the <Maximize2 className="inline w-3.5 h-3.5" /> button for full screen
            </p>
          </div>

          {/* Contact form */}
          <div className="rounded-2xl bg-card border border-white/10 p-8">
            {status === "sent" ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-14 h-14 text-accent mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Request received!</h2>
                <p className="text-muted-foreground">
                  Thanks, {form.name.split(" ")[0] || "there"} — our team will reach out shortly to schedule your demo.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <h2 className="text-2xl font-semibold">Book your demo</h2>
                {/* Honeypot: hidden from real users; bots that fill it are silently dropped */}
                <input
                  type="text"
                  name="website"
                  value={form.website}
                  onChange={set("website")}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute -left-[9999px] top-auto h-px w-px opacity-0"
                />
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name *</Label>
                    <Input id="name" required value={form.name} onChange={set("name")} placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company *</Label>
                    <Input id="company" required value={form.company} onChange={set("company")} placeholder="Acme Commercial Services" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email *</Label>
                    <Input id="email" type="email" required value={form.email} onChange={set("email")} placeholder="jane@acme.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="(555) 123-4567" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Your industry</Label>
                  <select
                    id="industry"
                    value={form.industry}
                    onChange={set("industry")}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="trade-services">Commercial Trade Services</option>
                    <option value="it-services">IT Services / MSP</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Anything we should know?</Label>
                  <Textarea id="message" rows={4} value={form.message} onChange={set("message")} placeholder="Territory, team size, current outreach process…" />
                </div>
                {status === "error" && <p className="text-sm text-destructive">{errorMsg}</p>}
                <Button type="submit" size="lg" disabled={status === "sending"} className="w-full bg-primary hover:bg-primary/90 text-white">
                  {status === "sending" ? "Sending…" : (<><Send className="mr-2 w-4 h-4" /> Request my demo</>)}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  If you've turned on Activity privacy, a successful request links this browser's site activity to the details you submit, visible to iSDRX administrators. It's off by default and you can turn it off any time. See our <Link href="/privacy#activity-linking" className="text-accent hover:underline">Privacy Policy</Link>.
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Prefer email? Reach us any time at <a href="mailto:info@isdrxai.com" className="text-accent hover:underline">info@isdrxai.com</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

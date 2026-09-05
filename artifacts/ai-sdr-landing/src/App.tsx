import React, { useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { 
  ArrowRight, 
  Bot, 
  Briefcase, 
  Building2, 
  CalendarCheck, 
  Check,
  ChevronRight, 
  Database,
  Download,
  Filter,
  Mail, 
  MailCheck,
  MapPin, 
  Menu,
  MessageSquare, 
  Play, 
  RefreshCw,
  Sparkles, 
  Target, 
  TrendingUp, 
  Users,
  X,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Route, Router, Switch, Link, Redirect } from "wouter";
import VerticalPage, { TRADE_SERVICES_CONFIG, IT_SERVICES_CONFIG } from "@/pages/vertical";
import NotFound from "@/pages/not-found";
import BookDemoPage from "@/pages/book-demo";

const APP_ORIGIN = window.location.origin;
const SIGN_IN_URL = `${APP_ORIGIN}/app/sign-in`;
const SIGN_UP_URL = `${APP_ORIGIN}/app/sign-up`;
const VIDEO_URL = `${APP_ORIGIN}/ai-sdr-video/`;

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Plans", href: "#plans" },
  { label: "Results", href: "#results" },
];

function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">iSDRX AI</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <div className="flex gap-6">
            {navItems.map((item) => (
              <a 
                key={item.label} 
                href={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <a href={SIGN_IN_URL} className="text-sm font-medium text-white hover:text-accent transition-colors">Log in</a>
            <Button asChild className="bg-primary hover:bg-primary/90 text-white font-medium shadow-[0_0_20px_rgba(37,99,235,0.4)]"><Link href="/book-demo">Book a Demo</Link></Button>
          </div>
        </div>

        <button 
          className="md:hidden text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card border-b border-white/5 px-6 py-4 flex flex-col gap-4 overflow-hidden"
          >
            {navItems.map((item) => (
              <a 
                key={item.label} 
                href={item.href}
                className="text-lg font-medium text-muted-foreground hover:text-white transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="h-px w-full bg-border my-2" />
            <a href={SIGN_IN_URL} className="text-lg font-medium text-white">Log in</a>
            <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white font-medium mt-2"><Link href="/book-demo" className="w-full">Book a Demo</Link></Button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
      {/* Background with abstract AI texture */}
      <div 
        className="absolute top-0 left-0 right-0 bottom-0 opacity-20 pointer-events-none bg-cover bg-center"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/ai-bg.png)` }}
      />
      <div className="absolute top-0 left-0 right-0 bottom-0 bg-gradient-to-b from-transparent via-background to-background pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-accent mb-8"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">The first AI outbound tool built for the trades</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold font-display tracking-tight text-white mb-6 max-w-4xl mx-auto leading-[1.1]"
        >
          Book commercial service contracts{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">while you sleep.</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
        >
          Stop cold calling. Let AI prospect local businesses, write personalized outreach, and book walkthroughs for your commercial services company automatically.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a href={SIGN_UP_URL} className="w-full sm:w-auto">
            <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)] w-full sm:w-auto">
              Start Prospecting Now <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </a>
          <Button asChild size="lg" variant="outline" className="h-14 px-8 text-lg border-white/10 hover:bg-white/5 hover:text-white w-full sm:w-auto">
            <Link href="/book-demo" className="w-full sm:w-auto">
              <Play className="mr-2 w-5 h-5" /> Watch Demo
            </Link>
          </Button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-20 relative mx-auto max-w-5xl"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-xl blur opacity-20"></div>
          <HeroMockup />
        </motion.div>
      </div>
    </section>
  );
}

function Logos() {
  return (
    <section className="py-10 border-y border-white/5 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <p className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">Trusted by 500+ commercial service & IT companies</p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
          {/* Faux logos representing facility management / commercial service companies */}
          <div className="flex items-center gap-2 font-display font-bold text-xl"><Building2 className="w-6 h-6" /> APEX FACILITY</div>
          <div className="flex items-center gap-2 font-display font-bold text-xl"><Briefcase className="w-6 h-6" /> PRO-CLEAN CORP</div>
          <div className="flex items-center gap-2 font-display font-bold text-xl"><Target className="w-6 h-6" /> VANGUARD</div>
          <div className="flex items-center gap-2 font-display font-bold text-xl"><MapPin className="w-6 h-6" /> REGIONAL MAINT</div>
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: <Target className="w-6 h-6 text-accent" />,
    title: "Hyper-Local Prospecting",
    description: "Draw a radius around your current accounts. The AI finds every medical office, car dealership, and corporate HQ in that zone."
  },
  {
    icon: <Mail className="w-6 h-6 text-accent" />,
    title: "Personalized Outreach",
    description: "No generic templates. The AI researches the prospect and writes a custom email referencing their exact business."
  },
  {
    icon: <MessageSquare className="w-6 h-6 text-accent" />,
    title: "Smart Follow-ups",
    description: "If they don't reply, the system follows up intelligently until they book a walkthrough or opt out."
  },
  {
    icon: <CalendarCheck className="w-6 h-6 text-accent" />,
    title: "Walkthrough Booking",
    description: "We handle the back-and-forth. You just get calendar notifications when a decision maker is ready for a quote."
  }
];

function FeaturesGrid() {
  return (
    <section id="features" className="py-24 md:py-32 relative">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">Built for the trades, not tech companies.</h2>
          <p className="text-lg text-muted-foreground">
            You don't need a complex CRM. You need a machine that goes out, finds businesses that need your services, and puts the owner on your calendar.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="p-8 rounded-2xl bg-card border border-white/5 hover:border-primary/50 transition-colors group"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroMockup() {
  const bars = [42, 68, 50, 82, 60, 92, 74];
  const prospects = [
    { name: "Metro Financial Partners", status: "Replied", tone: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    { name: "Pinnacle Law Group", status: "Meeting set", tone: "text-accent bg-accent/10 border-accent/20" },
    { name: "Apex Medical Center", status: "Contacted", tone: "text-muted-foreground bg-white/5 border-white/10" },
  ];
  return (
    <div className="relative rounded-xl border border-white/10 shadow-2xl bg-[#0b1220] overflow-hidden text-left">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-white/[0.03]">
        <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-display font-bold text-sm text-white">iSDRX AI</span>
        <span className="ml-3 text-xs text-muted-foreground">Dashboard</span>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
          <Bot className="w-3 h-3" /> Autopilot on
        </div>
      </div>

      <div className="p-5 grid grid-cols-3 gap-3">
        {[
          { label: "Open Rate", value: "68%", delta: "+12% this week" },
          { label: "Reply Rate", value: "24%", delta: "+6% this week" },
          { label: "Meetings Booked", value: "41", delta: "+9 this month" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
            <div className="text-xl md:text-2xl font-bold text-white mt-1">{s.value}</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> {s.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-3">
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white">Outreach Performance</span>
            <span className="text-[10px] text-muted-foreground">Last 7 days</span>
          </div>
          <div className="flex items-end gap-2 h-24">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary to-accent" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
          <span className="text-xs font-medium text-white">Recent Prospects</span>
          <div className="mt-3 space-y-2.5">
            {prospects.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-300 truncate">{p.name}</span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${p.tone}`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignMockup() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-xl bg-card border border-white/10 p-5 shadow-xl">
        <div className="text-sm text-muted-foreground mb-1">Prospects Reached</div>
        <div className="text-3xl font-bold text-white mb-4">545</div>
        <div className="flex items-end gap-1.5 h-12">
          {[35, 50, 40, 65, 55, 85, 70].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-primary to-accent" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-card border border-white/10 p-5 shadow-xl">
        <div className="text-sm text-muted-foreground mb-1">Outreach Campaign</div>
        <div className="text-3xl font-bold text-white mb-1">$15K</div>
        <div className="text-xs text-muted-foreground mb-3">Pipeline value</div>
        <div className="flex items-end gap-1.5 h-10">
          {[50, 70, 45, 80, 60, 90].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-accent/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-card border border-white/10 p-5 shadow-xl">
        <div className="text-sm text-muted-foreground mb-1">Emails Sent</div>
        <div className="text-3xl font-bold text-white mb-4">3,295</div>
        <div className="space-y-3">
          {[
            { label: "Delivered", pct: 98, color: "bg-primary" },
            { label: "Opened", pct: 62, color: "bg-accent" },
          ].map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                <span>{r.label}</span><span>{r.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-card border border-white/10 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-muted-foreground">Meetings Booked</span>
          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">On track</span>
        </div>
        <div className="text-3xl font-bold text-white mb-3">44%</div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-4">
          <div className="h-full rounded-full bg-emerald-400" style={{ width: "44%" }} />
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Replied</span>
            <span className="text-white font-medium">128</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5" /> Walkthroughs</span>
            <span className="text-white font-medium">41</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailMockup() {
  return (
    <div className="relative rounded-2xl border border-white/10 shadow-2xl bg-[#0d1829] w-full overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/[0.03]">
        <div className="w-3 h-3 rounded-full bg-red-500/70" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <div className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-xs text-muted-foreground font-medium">New Message — AI Personalized</span>
        <div className="ml-auto flex items-center gap-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
          <Sparkles className="w-3 h-3" /> AI Generated
        </div>
      </div>

      {/* Email headers */}
      <div className="px-5 py-4 space-y-2 border-b border-white/5 text-sm">
        <div className="flex gap-3">
          <span className="text-muted-foreground w-10 shrink-0">To:</span>
          <span className="text-white font-medium">sarah.kim@peakstonerealty.com</span>
        </div>
        <div className="flex gap-3">
          <span className="text-muted-foreground w-10 shrink-0">From:</span>
          <span className="text-white">Mike Torres &lt;mike@apexclean.com&gt;</span>
        </div>
        <div className="flex gap-3">
          <span className="text-muted-foreground w-10 shrink-0">Re:</span>
          <span className="text-white font-semibold">Keeping Peakstone's offices spotless</span>
        </div>
      </div>

      {/* Email body */}
      <div className="px-5 py-5 text-sm text-gray-300 leading-relaxed space-y-3">
        <p>Hi Sarah,</p>
        <p>
          I noticed Peakstone Realty recently expanded to your new Riverside office — congratulations on the growth.
          Managing cleanliness across multiple locations can get complicated fast, especially with client-facing spaces.
        </p>
        <p>
          We specialize in commercial trade services for property management firms in the Denver metro. We currently handle
          three office complexes on the same block as your downtown location, so scheduling and access are never an issue.
        </p>
        <p>Would a 15-minute call this week make sense to see if we're a fit?</p>
        <p className="text-white font-medium">— Mike Torres, Apex Facility Services</p>
      </div>

      {/* AI badge strip */}
      <div className="px-5 py-3 bg-primary/5 border-t border-primary/10 flex items-center gap-3">
        <Bot className="w-4 h-4 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="text-primary font-medium">AI research used:</span> LinkedIn expansion announcement · Google Maps office locations · Yelp reviews
        </p>
      </div>
    </div>
  );
}

function CrmIntegrationMockup() {
  return (
    <div className="relative rounded-2xl border border-white/10 shadow-2xl bg-[#0b1220] p-6 w-full flex flex-col overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-r from-primary/10 via-transparent to-emerald-400/5 blur-[80px] pointer-events-none"></div>

      <div className="flex flex-col sm:flex-row items-stretch gap-6 relative z-10">

        {/* Left: iSDRX AI */}
        <div className="flex-1 rounded-xl bg-[#080d18] border border-white/5 p-5 flex flex-col relative shadow-xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-400"></div>

          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-primary flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-display font-bold text-white text-sm leading-tight">iSDRX AI</div>
                <div className="text-[10px] text-primary uppercase tracking-wider font-semibold">Prospecting Activity</div>
              </div>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 text-xs bg-white/5 border border-white/5 rounded-lg p-2.5">
              <Database className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-gray-300">Early-stage research</span>
            </div>
            <div className="flex items-center gap-3 text-xs bg-white/5 border border-white/5 rounded-lg p-2.5">
              <MailCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="text-gray-300">Personalized outreach</span>
            </div>
            <div className="flex items-center gap-3 text-xs bg-white/5 border border-white/5 rounded-lg p-2.5">
              <XCircle className="w-4 h-4 text-muted-foreground opacity-50 shrink-0" />
              <span className="text-gray-500 line-through">Bounces & Disqualified</span>
            </div>
            <div className="flex items-center gap-3 text-xs bg-primary/10 border border-primary/20 rounded-lg p-2.5 relative overflow-hidden">
              <div className="absolute inset-0 bg-primary/5 animate-pulse"></div>
              <Filter className="w-4 h-4 text-primary relative z-10 shrink-0" />
              <span className="text-primary font-medium relative z-10">Buying-signal detection</span>
            </div>
          </div>
        </div>

        {/* Middle Sync / Export */}
        <div className="flex sm:flex-col items-center justify-center gap-4 py-2 sm:py-0 shrink-0 relative">
          {/* Connecting dashed line */}
          <div className="hidden sm:block absolute top-1/2 -translate-y-1/2 left-[-100px] right-[-100px] h-px border-t border-dashed border-white/20 -z-10"></div>
          <div className="sm:hidden absolute left-1/2 -translate-x-1/2 top-[-100px] bottom-[-100px] w-px border-l border-dashed border-white/20 -z-10"></div>

          <div className="relative z-10 flex items-center gap-1.5 bg-card border border-white/10 px-3 py-2 rounded-full text-[10px] font-medium text-white shadow-xl whitespace-nowrap cursor-default">
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            CSV Export
          </div>

          <div className="relative z-10 flex items-center gap-1.5 bg-[#0b1220] border border-primary/30 px-3 py-2 rounded-full text-[10px] font-medium text-primary shadow-xl whitespace-nowrap shadow-[0_0_15px_rgba(37,99,235,0.2)]">
            <RefreshCw className="w-3.5 h-3.5 text-primary" />
            Optional Sync
          </div>

          <ArrowRight className="w-5 h-5 text-muted-foreground/50 hidden sm:block mt-1" />
        </div>

        {/* Right: CRM */}
        <div className="flex-1 rounded-xl bg-gradient-to-b from-[#0d1522] to-[#080d18] border border-white/10 p-5 flex flex-col relative shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-white/5 border border-white/10 flex items-center justify-center">
                <Database className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-display font-bold text-white text-sm leading-tight">Your CRM</div>
                <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Qualified Pipeline</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center flex-1 space-y-3 relative">
            <div className="absolute inset-0 bg-emerald-400/5 blur-xl rounded-full pointer-events-none"></div>

            <div className="flex items-center gap-3 text-xs bg-emerald-400/10 border border-emerald-400/30 rounded-lg p-4 relative z-10 shadow-[0_0_20px_rgba(52,211,153,0.1)]">
              <div className="w-8 h-8 rounded-full bg-emerald-400/20 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-emerald-400 font-bold text-sm">Qualified Opportunities</div>
                <div className="text-[10px] text-emerald-400/70 mt-0.5">Appointments Booked</div>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-dashed border-white/10 flex items-center justify-center text-center relative z-10 bg-white/[0.01]">
              <span className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                Zero clutter.<br />100% trustworthy pipeline.
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function DeepDiveSection({ id, reversed, imageSrc, graphic, pretitle, title, description, items }: any) {
  return (
    <section id={id} className="py-24 overflow-hidden scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className={`flex flex-col ${reversed ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-16`}>
          
          <motion.div 
            initial={{ opacity: 0, x: reversed ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex-1"
          >
            <div className="text-accent font-medium mb-4 uppercase tracking-wider text-sm">{pretitle}</div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">{title}</h2>
            <p className="text-lg text-muted-foreground mb-8">{description}</p>
            
            <div className="space-y-6">
              {items.map((item: any, idx: number) => (
                <div key={idx} className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-lg">{item.title}</h4>
                    <p className="text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex-1 relative"
          >
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-accent/20 rounded-[2rem] blur-2xl opacity-50"></div>
            {graphic ?? (
              <img 
                src={imageSrc} 
                alt={title} 
                className="relative rounded-2xl border border-white/10 shadow-2xl bg-card w-full"
              />
            )}
          </motion.div>

        </div>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section id="results" className="py-24 bg-card border-y border-white/5 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
          <div className="py-6">
            <div className="text-5xl font-display font-bold text-white mb-2">4.2x</div>
            <div className="text-muted-foreground font-medium uppercase tracking-wide">Increase in Meetings Booked</div>
          </div>
          <div className="py-6">
            <div className="text-5xl font-display font-bold text-white mb-2">12hrs</div>
            <div className="text-muted-foreground font-medium uppercase tracking-wide">Saved per week on prospecting</div>
          </div>
          <div className="py-6">
            <div className="text-5xl font-display font-bold text-accent mb-2">100%</div>
            <div className="text-muted-foreground font-medium uppercase tracking-wide">Done-for-you automation</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section className="py-32 relative">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <Bot className="w-12 h-12 text-primary mx-auto mb-8" />
        <h2 className="text-3xl md:text-5xl font-display font-medium text-white mb-10 leading-snug">
          "We used to rely entirely on word-of-mouth. Last month, iSDRX AI booked us 15 walkthroughs with medical facilities without us making a single cold call."
        </h2>
        <div className="flex items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white font-bold text-xl">
            JD
          </div>
          <div className="text-left">
            <div className="text-white font-bold text-lg">James Davies</div>
            <div className="text-muted-foreground">Owner, Apex Facility Services</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-primary/10"></div>
      <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 font-display">Ready to dominate your territory?</h2>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Stop letting your competitors out-prospect you. Get an unfair advantage with the AI outreach engine built for commercial cleaners.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button asChild size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]"><Link href="/book-demo">Book a Demo</Link></Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">No credit card required. See it work live on your territory.</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-background border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-white">iSDRX AI</span>
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <a href={SIGN_IN_URL} className="hover:text-white transition-colors">Privacy Policy</a>
          <a href={SIGN_IN_URL} className="hover:text-white transition-colors">Terms of Service</a>
          <a href={SIGN_IN_URL} className="hover:text-white transition-colors">Contact</a>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} iSDRX AI Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function ServiceTiers() {
  return (
    <section id="plans" className="py-24 relative overflow-hidden bg-[#0b1220] border-y border-white/5">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/20 to-transparent blur-3xl rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-accent mb-6"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Support options</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-bold mb-6 text-white"
          >
            Choose the Support That Fits Your Business
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            Start with automated prospecting and scheduling, or add professional follow-through for prospects who show interest but do not book.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* iSDRX AI */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-white/10 bg-card p-8 md:p-10 flex flex-col relative hover:border-white/20 transition-colors"
          >
            <div className="mb-8">
              <h3 className="text-3xl font-display font-bold text-white mb-2">iSDRX AI</h3>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent mb-5">
                Automated Prospecting and Scheduling
              </p>
              <p className="text-muted-foreground leading-relaxed">
                iSDRX AI researches high-fit prospects, identifies buying signals, delivers personalized outreach, and monitors engagement. When a prospect responds with interest, the platform automatically guides them to schedule an appointment or walkthrough directly on your calendar.
              </p>
            </div>

            <div className="mb-8 rounded-xl border border-primary/30 bg-primary/10 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-2">
                Standard iSDRX AI
              </div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-display font-bold text-white">$499</span>
                <span className="text-muted-foreground mb-1">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Automated prospect research, personalized outreach, engagement monitoring, and appointment guidance for 1 user.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Includes capacity for up to 1,000 personalized AI emails per month.
              </p>
            </div>

            <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/10">
              {[
                { name: "iSDRX AI Starter", price: "$249/month" },
                { name: "iSDRX AI Growth", price: "$799/month" },
                { name: "Enterprise", price: "Contact Sales" },
              ].map((tier) => (
                <div key={tier.name} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="text-gray-300">{tier.name}</span>
                  <span className="font-semibold text-white whitespace-nowrap">{tier.price}</span>
                </div>
              ))}
            </div>

            <div className="space-y-4 mb-10 flex-1">
              {[
                "High-fit prospect research and buying-signal identification",
                "Personalized outreach and engagement monitoring",
                "Automatic guidance to your calendar",
                "Dashboard follow-up for engaged prospects who did not select a meeting time",
                "Visibility into prospect activity that was previously unknown"
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-gray-300">{feature}</span>
                </div>
              ))}
            </div>

            <Button asChild size="lg" variant="outline" className="w-full h-14 text-lg border-white/10 hover:bg-white/5 hover:text-white">
              <Link href="/book-demo">Start Automating</Link>
            </Button>
          </motion.div>

          {/* iSDRX AI+ */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl border border-primary bg-card p-8 md:p-10 flex flex-col relative shadow-[0_0_40px_rgba(37,99,235,0.1)]"
          >
            <div className="absolute top-0 right-8 -translate-y-1/2">
              <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-white bg-primary px-4 py-1.5 rounded-full shadow-lg">
                <Sparkles className="w-3.5 h-3.5" /> Premium Support
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-3xl font-display font-bold text-white mb-2 flex items-center gap-1">
                iSDRX AI<span className="text-primary">+</span>
              </h3>
              <p className="text-sm font-semibold uppercase tracking-wider text-accent mb-5">
                Complete Engagement and Follow-Through
              </p>
              <p className="text-muted-foreground leading-relaxed">
                iSDRX AI+ adds a live, trained professional caller who follows up with prospects who show interest but do not complete the scheduling process—including those who repeatedly open emails, view attachments, or click the calendar link without booking.
              </p>
            </div>

            <div className="mb-6 rounded-xl border border-primary/30 bg-primary/10 p-5">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    One-time setup
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Scripting, caller training, CRM configuration, and campaign preparation.
                  </p>
                </div>
                <span className="text-3xl font-display font-bold text-white">$1,000</span>
              </div>
            </div>

            <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/10">
              {[
                {
                  name: "Engagement Follow-Up",
                  price: "$750/month",
                  detail: "Calls to hot and highly engaged prospects who have not scheduled",
                },
                {
                  name: "Outbound Calling",
                  price: "$1,500/month",
                  detail: "Approximately 20–30 calling hours per month",
                },
                {
                  name: "Dedicated Caller",
                  price: "$3,000/month",
                  detail: "Dedicated or near-full-time caller with live transfers",
                },
                {
                  name: "Additional Caller",
                  price: "$2,500–$3,500 each/month",
                  detail: "Additional capacity for expanded territories or higher call volume",
                },
              ].map((level) => (
                <div key={level.name} className="px-4 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-4">
                    <span className="font-semibold text-white">{level.name}</span>
                    <span className="font-semibold text-primary whitespace-nowrap">{level.price}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{level.detail}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4 mb-10 flex-1">
              <div className="text-sm font-semibold text-white uppercase tracking-wider mb-2">Everything in AI, plus:</div>
              {[
                "A live, trained professional caller",
                "Interest confirmation and opportunity qualification",
                "Hands-on appointment or walkthrough scheduling",
                "Calls, outcomes, notes, transfers, and bookings tracked in the dashboard",
                "Follow-through for engaged prospects who do not book"
              ].map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-gray-300">{feature}</span>
                </div>
              ))}
            </div>

            <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-sm text-gray-300 leading-relaxed">
                All call attempts, outcomes, notes, live transfers, and appointments or walkthroughs are tracked through the iSDRX AI dashboard.
              </p>
              <p className="text-sm font-semibold text-white mt-3">
                AI+ pricing is added to the monthly cost of your selected iSDRX AI package.
              </p>
            </div>

            <Button asChild size="lg" className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]">
              <Link href="/book-demo">Upgrade to AI+</Link>
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 text-center max-w-2xl mx-auto p-6 rounded-xl bg-white/[0.02] border border-white/5"
        >
          <p className="text-lg text-white font-medium">
            iSDRX AI automates prospecting and scheduling.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            iSDRX AI+ adds the professional follow-through that helps prevent interested prospects from being missed.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function LandingPage() {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -50]);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Navbar />
      <main>
        <Hero />
        <VerticalChooser />
        <Logos />
        <FeaturesGrid />
        
        <DeepDiveSection
          id="how-it-works"
          graphic={<EmailMockup />}
          pretitle="Personalized Pitch"
          title="Emails so good, they think you hand-wrote them."
          description="Our engine analyzes the prospect's website, recent news, and business type to write a highly contextual opening that proves you aren't just spamming them."
          items={[
            { title: "Deep Research", description: "Mentions their specific services or locations." },
            { title: "Value Prop Matching", description: "Pairs their pain points with your specific service capabilities." }
          ]}
        />

        <DeepDiveSection 
          reversed={true}
          graphic={<CampaignMockup />}
          pretitle="Multi-Step Campaigns"
          title="Relentless follow-up, zero effort."
          description="It takes 7-12 touches to book a commercial contract. The AI handles the entire cadence—spacing out touches and replying appropriately when they answer."
          items={[
            { title: "Smart Sequencing", description: "Pauses automatically if they reply or book." },
            { title: "Objection Handling", description: "AI categorizes replies ('Not right now', 'Who currently handles this for you?') and flags them for you." }
          ]}
        />

        <DeepDiveSection
          reversed={false}
          graphic={<CrmIntegrationMockup />}
          pretitle="Clean CRM"
          title="A Cleaner CRM and a More Accurate Sales Pipeline."
          description="iSDRX AI is the working area for early-stage research, personalized outreach, engagement monitoring, buying-signal detection, and qualification. Your CRM should only receive legitimate, qualified opportunities after an appointment is booked."
          items={[
            { title: "CSV Export", description: "Export selected prospects, qualified opportunities, or all campaign records at any time." },
            { title: "Optional CRM Synchronization", description: "CRM integration can be provided to automatically synchronize selected prospects, qualified opportunities, or all campaign records." },
            { title: "Perfect Clarity", description: "iSDRX AI manages the prospecting activity. Your CRM manages the qualified pipeline." }
          ]}
        />

        <ServiceTiers />

        <Stats />
        <Testimonial />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

function VerticalChooser() {
  const verticals = [
    {
      href: "/TradeServices",
      title: "Commercial Trade Services",
      description: "Book walkthroughs and win commercial service contracts with AI-powered local outreach.",
      cta: "Explore Trade Services",
    },
    {
      href: "/ITServices",
      title: "IT Services & MSPs",
      description: "Book free IT assessments pitching cybersecurity, MS365, managed IT, managed security, and MDM.",
      cta: "Explore IT Services",
    },
  ];
  return (
    <section className="py-20 border-y border-white/5 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Built for your industry.</h2>
          <p className="text-lg text-muted-foreground">Pick your business type to see how iSDRX AI fills your pipeline.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {verticals.map((v) => (
            <Link key={v.href} href={v.href} className="block p-8 rounded-2xl bg-card border border-white/5 hover:border-primary/50 transition-colors group text-left">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Building2 className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{v.title}</h3>
              <p className="text-muted-foreground leading-relaxed mb-5">{v.description}</p>
              <span className="inline-flex items-center gap-1 text-accent font-medium">
                {v.cta} <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROUTER_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Old app links (schedule/unsubscribe links already emailed to prospects,
// bookmarks) used to live at the site root before the app moved to /app.
// Forward them so nothing already sent ever breaks.
function RedirectToApp() {
  window.location.replace(`/app${window.location.pathname}${window.location.search}`);
  return null;
}

export default function App() {
  return (
    <Router base={ROUTER_BASE}>
      <Switch>
        <Route path="/" component={LandingPage} />
        {/* Old vertical URL — keep redirect so bookmarks and indexed links still work */}
        <Route path="/Janitorial">
          <Redirect to="/TradeServices" replace />
        </Route>
        <Route path="/TradeServices">
          <VerticalPage config={TRADE_SERVICES_CONFIG} />
        </Route>
        <Route path="/ITServices">
          <VerticalPage config={IT_SERVICES_CONFIG} />
        </Route>
        <Route path="/book-demo" component={BookDemoPage} />
        <Route path="/schedule/:token" component={RedirectToApp} />
        <Route path="/unsubscribe/:token" component={RedirectToApp} />
        <Route path="/prospects" component={RedirectToApp} />
        <Route path="/prospects/:id" component={RedirectToApp} />
        <Route path="/dashboard" component={RedirectToApp} />
        <Route path="/sign-in" component={RedirectToApp} nest />
        <Route path="/sign-up" component={RedirectToApp} nest />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  ChevronRight,
  Mail,
  Menu,
  MessageSquare,
  Play,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const APP_ORIGIN = window.location.origin;
const SIGN_IN_URL = `${APP_ORIGIN}/app/sign-in`;
const SIGN_UP_URL = `${APP_ORIGIN}/app/sign-up`;
const VIDEO_URL = `${APP_ORIGIN}/ai-sdr-video/`;

export interface VerticalPageConfig {
  videoUrl: string;
  badge: string;
  headlineStart: string;
  headlineAccent: string;
  subheadline: string;
  primaryCta: string;
  painTitle: string;
  painIntro: string;
  painPoints: { title: string; description: string }[];
  features: { icon: "target" | "mail" | "message" | "calendar"; title: string; description: string }[];
  testimonialQuote: string;
  testimonialName: string;
  testimonialRole: string;
  ctaHeadline: string;
  ctaBody: string;
}

export const TRADE_SERVICES_CONFIG: VerticalPageConfig = {
  videoUrl: VIDEO_URL,
  badge: "AI outbound for commercial trade services",
  headlineStart: "Book commercial service contracts",
  headlineAccent: "while you sleep.",
  subheadline:
    "Stop cold calling. Let AI prospect local businesses, write personalized outreach, and book walkthroughs for your commercial services company automatically.",
  primaryCta: "Start Prospecting Now",
  painTitle: "Winning commercial contracts shouldn't mean endless cold calls.",
  painIntro:
    "Most commercial services companies grow on word-of-mouth alone — and hit a ceiling. iSDRX AI fixes the three things that keep trade businesses stuck:",
  painPoints: [
    { title: "No time to prospect", description: "You're running crews and doing site visits. The AI prospects for you, every day." },
    { title: "Generic outreach gets ignored", description: "Facility managers delete template emails. Ours reference their building, industry, and city." },
    { title: "Follow-up falls through the cracks", description: "It takes 7–12 touches to win a contract. The AI never forgets a follow-up." },
  ],
  features: [
    { icon: "target", title: "Hyper-Local Prospecting", description: "Draw a radius around your current accounts. The AI finds every medical office, law firm, and corporate HQ in that zone." },
    { icon: "mail", title: "Personalized Outreach", description: "No generic templates. The AI researches the prospect and writes a custom email referencing their exact business." },
    { icon: "message", title: "Smart Follow-ups", description: "If they don't reply, the system follows up intelligently until they book a walkthrough or opt out." },
    { icon: "calendar", title: "Walkthrough Booking", description: "We handle the back-and-forth. You just get calendar notifications when a decision maker is ready for a quote." },
  ],
  testimonialQuote:
    "\"We used to rely entirely on word-of-mouth. Last month, iSDRX AI booked us 15 walkthroughs with medical facilities without us making a single cold call.\"",
  testimonialName: "James Davies",
  testimonialRole: "Owner, Apex Facility Services",
  ctaHeadline: "Ready to dominate your territory?",
  ctaBody:
    "Stop letting your competitors out-prospect you. Get an unfair advantage with the AI outreach engine built for commercial service providers.",
};

export const IT_SERVICES_CONFIG: VerticalPageConfig = {
  videoUrl: `${APP_ORIGIN}/ai-sdr-video-it/`,
  badge: "AI outbound for IT service providers",
  headlineStart: "Book managed IT clients",
  headlineAccent: "on autopilot.",
  subheadline:
    "Stop chasing referrals. Let AI prospect local businesses, pitch your full stack — cybersecurity, MS365 licensing, managed IT, managed security, and mobile device management — and book free IT assessments automatically.",
  primaryCta: "Start Prospecting Now",
  painTitle: "Growing an MSP shouldn't depend on referrals alone.",
  painIntro:
    "Most IT providers are too busy fixing tickets to fill the pipeline. iSDRX AI fixes the three things that keep MSPs stuck:",
  painPoints: [
    { title: "No time for sales", description: "You're resolving tickets and managing networks. The AI prospects for you, every day." },
    { title: "One-note pitches get ignored", description: "The AI rotates your offerings — cybersecurity, MS365, managed IT, managed security, MDM — so every touch lands a new angle." },
    { title: "Deals die from silence", description: "IT contracts take months of touches. The AI keeps every prospect warm until they book or opt out." },
  ],
  features: [
    { icon: "target", title: "Hyper-Local Prospecting", description: "Draw a radius around your current clients. The AI finds every medical office, law firm, and manufacturer that needs IT help." },
    { icon: "mail", title: "Five-Offering Rotation", description: "Each email in the sequence pitches a different service — security risks one week, license savings the next — so nothing feels repetitive." },
    { icon: "message", title: "Smart Follow-ups", description: "If they don't reply, the system follows up intelligently until they book an assessment or opt out." },
    { icon: "calendar", title: "Assessment Booking", description: "We handle the back-and-forth. You just get calendar notifications when a decision maker wants a free IT assessment." },
  ],
  testimonialQuote:
    "\"We went from zero outbound to 11 booked IT assessments in our first month. The rotating pitch is genius — one prospect replied about MS365 savings after ignoring three security emails.\"",
  testimonialName: "Priya Natarajan",
  testimonialRole: "CEO, Northline Technology Group",
  ctaHeadline: "Ready to fill your MSP pipeline?",
  ctaBody:
    "Stop letting bigger MSPs out-prospect you. Get an unfair advantage with the AI outreach engine built for IT service providers.",
};

const ICONS = {
  target: Target,
  mail: Mail,
  message: MessageSquare,
  calendar: CalendarCheck,
};

function VerticalNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">iSDRX AI</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <div className="flex gap-6">
            <Link href="/TradeServices" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">Trade Services</Link>
            <Link href="/ITServices" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">IT Services</Link>
          </div>
          <div className="flex items-center gap-4">
            <a href={SIGN_IN_URL} className="text-sm font-medium text-white hover:text-accent transition-colors">Log in</a>
            <Button asChild className="bg-primary hover:bg-primary/90 text-white font-medium shadow-[0_0_20px_rgba(37,99,235,0.4)]"><Link href="/book-demo">Book a Demo</Link></Button>
          </div>
        </div>
        <button className="md:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
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
            <Link href="/TradeServices" className="text-lg font-medium text-muted-foreground hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>Trade Services</Link>
            <Link href="/ITServices" className="text-lg font-medium text-muted-foreground hover:text-white transition-colors" onClick={() => setMobileMenuOpen(false)}>IT Services</Link>
            <div className="h-px w-full bg-border my-2" />
            <a href={SIGN_IN_URL} className="text-lg font-medium text-white">Log in</a>
            <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white font-medium mt-2"><Link href="/book-demo" className="w-full">Book a Demo</Link></Button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

export default function VerticalPage({ config }: { config: VerticalPageConfig }) {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <VerticalNavbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 md:pt-48 md:pb-28 overflow-hidden">
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
              <span className="text-sm font-medium">{config.badge}</span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl md:text-7xl font-bold font-display tracking-tight text-white mb-6 max-w-4xl mx-auto leading-[1.1]"
            >
              {config.headlineStart}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">{config.headlineAccent}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            >
              {config.subheadline}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <a href={SIGN_UP_URL} className="w-full sm:w-auto">
                <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)] w-full sm:w-auto">
                  {config.primaryCta} <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </a>
              <Button asChild size="lg" variant="outline" className="h-14 px-8 text-lg border-white/10 hover:bg-white/5 hover:text-white w-full sm:w-auto">
                <Link href="/book-demo" className="w-full sm:w-auto">
                  <Play className="mr-2 w-5 h-5" /> Watch Demo
                </Link>
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Pain points */}
        <section className="py-24 border-y border-white/5 bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">{config.painTitle}</h2>
              <p className="text-lg text-muted-foreground">{config.painIntro}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {config.painPoints.map((p, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="p-8 rounded-2xl bg-card border border-white/5"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mb-5">
                    <ChevronRight className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{p.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{p.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-24 md:py-32 relative">
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid md:grid-cols-2 gap-8">
              {config.features.map((feature, idx) => {
                const Icon = ICONS[feature.icon];
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-8 rounded-2xl bg-card border border-white/5 hover:border-primary/50 transition-colors group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <Icon className="w-6 h-6 text-accent" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Testimonial */}
        <section className="py-24 relative border-y border-white/5 bg-white/[0.02]">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <Bot className="w-12 h-12 text-primary mx-auto mb-8" />
            <h2 className="text-2xl md:text-4xl font-display font-medium text-white mb-10 leading-snug">
              {config.testimonialQuote}
            </h2>
            <div className="flex items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white font-bold text-xl">
                {config.testimonialName.split(" ").map((n) => n[0]).join("")}
              </div>
              <div className="text-left">
                <div className="text-white font-bold text-lg">{config.testimonialName}</div>
                <div className="text-muted-foreground">{config.testimonialRole}</div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/10"></div>
          <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 font-display">{config.ctaHeadline}</h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">{config.ctaBody}</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button asChild size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]"><Link href="/book-demo">Book a Demo</Link></Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">No credit card required. See it work live on your territory.</p>
          </div>
        </section>
      </main>
      <footer className="bg-background border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-white">iSDRX AI</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <Link href="/TradeServices" className="hover:text-white transition-colors">Trade Services</Link>
            <Link href="/ITServices" className="hover:text-white transition-colors">IT Services</Link>
            <a href="mailto:info@isdrxai.com" className="hover:text-white transition-colors">info@isdrxai.com</a>
            <a href="tel:+14693229056" className="hover:text-white transition-colors">+1 (469) 322-9056</a>
            <a
              href="https://wa.me/14693229056"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              Chat with us on WhatsApp
            </a>
          </div>
          <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} iSDRX AI Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

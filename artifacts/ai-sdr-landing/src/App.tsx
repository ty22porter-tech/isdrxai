import React, { useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { 
  ArrowRight, 
  Bot, 
  Briefcase, 
  Building2, 
  CalendarCheck, 
  ChevronRight, 
  Mail, 
  MapPin, 
  Menu,
  MessageSquare, 
  Play, 
  Sparkles, 
  Target, 
  TrendingUp, 
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
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
          <span className="font-display font-bold text-xl tracking-tight">AI SDR</span>
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
            <a href="#" className="text-sm font-medium text-white hover:text-accent transition-colors">Log in</a>
            <Button className="bg-primary hover:bg-primary/90 text-white font-medium shadow-[0_0_20px_rgba(37,99,235,0.4)]">
              Book a Demo
            </Button>
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
            <a href="#" className="text-lg font-medium text-white">Log in</a>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white font-medium mt-2">
              Book a Demo
            </Button>
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
          Book commercial cleaning contracts{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">while you sleep.</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
        >
          Stop cold calling. Let AI prospect local businesses, write personalized outreach, and book walkthroughs for your janitorial business automatically.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)] w-full sm:w-auto">
            Start Prospecting Now <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-white/10 hover:bg-white/5 hover:text-white w-full sm:w-auto">
            <Play className="mr-2 w-5 h-5" /> Watch Demo
          </Button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-20 relative mx-auto max-w-5xl"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-xl blur opacity-20"></div>
          <img 
            src={`${import.meta.env.BASE_URL}images/hero-mockup.png`} 
            alt="AI SDR Dashboard" 
            className="relative rounded-xl border border-white/10 shadow-2xl bg-card"
          />
        </motion.div>
      </div>
    </section>
  );
}

function Logos() {
  return (
    <section className="py-10 border-y border-white/5 bg-white/[0.02]">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <p className="text-sm font-medium text-muted-foreground mb-6 uppercase tracking-wider">Trusted by 500+ commercial cleaning businesses</p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale">
          {/* Faux logos representing facility management / cleaning companies */}
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
            You don't need a complex CRM. You need a machine that goes out, finds buildings that need cleaning, and puts the owner on your calendar.
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

function DeepDiveSection({ reversed, imageSrc, pretitle, title, description, items }: any) {
  return (
    <section className="py-24 overflow-hidden">
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
            <img 
              src={imageSrc} 
              alt={title} 
              className="relative rounded-2xl border border-white/10 shadow-2xl bg-card w-full"
            />
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
          "We used to rely entirely on word-of-mouth. Last month, AI SDR booked us 15 walkthroughs with medical facilities without us making a single cold call."
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
          <Button size="lg" className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(37,99,235,0.4)]">
            Book a Demo
          </Button>
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
          <span className="font-display font-bold text-lg tracking-tight text-white">AI SDR</span>
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-white transition-colors">Contact</a>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} AI SDR Inc. All rights reserved.
        </p>
      </div>
    </footer>
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
        <Logos />
        <FeaturesGrid />
        
        <DeepDiveSection 
          imageSrc={`${import.meta.env.BASE_URL}images/email-feature.png`}
          pretitle="Personalized Pitch"
          title="Emails so good, they think you hand-wrote them."
          description="Our engine analyzes the prospect's website, recent news, and business type to write a highly contextual opening that proves you aren't just spamming them."
          items={[
            { title: "Deep Research", description: "Mentions their specific services or locations." },
            { title: "Value Prop Matching", description: "Pairs their pain points with your specific cleaning capabilities." }
          ]}
        />

        <DeepDiveSection 
          reversed={true}
          imageSrc={`${import.meta.env.BASE_URL}images/campaigns-feature.png`}
          pretitle="Multi-Step Campaigns"
          title="Relentless follow-up, zero effort."
          description="It takes 7-12 touches to book a commercial contract. The AI handles the entire cadence—spacing out touches and replying appropriately when they answer."
          items={[
            { title: "Smart Sequencing", description: "Pauses automatically if they reply or book." },
            { title: "Objection Handling", description: "AI categorizes replies ('Not right now', 'Who currently does your cleaning?') and flags them for you." }
          ]}
        />

        <Stats />
        <Testimonial />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return <LandingPage />;
}

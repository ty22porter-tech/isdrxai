import { STARTER_INTRO_OFFER } from "@workspace/api-client-react/marketing-plans";
import { Link } from "wouter";
import { Bot, Zap, BarChart3, Users } from "lucide-react";
import { trackConversionClick } from "@/lib/analytics";

export default function Home() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#050f1e] flex flex-col items-center justify-center px-5 py-10 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(42,91,133,.38),transparent_42%)]" />
      <div className="max-w-3xl mx-auto space-y-9">
        <div className="flex justify-center">
          <div className="relative w-16 h-16 bg-[#275b85] border border-[#71a7ce]/25 rounded-[18px] flex items-center justify-center shadow-[0_12px_30px_rgba(0,0,0,.34)]">
            <Bot className="w-9 h-9 text-white" />
          </div>
        </div>

        <div className="relative space-y-4">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-[#80b2d7]">The Fastest Way to Grow</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-[-.04em] text-white">
            iSDRX AI to Build Pipeline for <span className="text-[#7eb4dc]">Commercial Companies</span>
          </h1>
          <p className="text-[#a9bbca] text-lg max-w-xl mx-auto leading-8">
            Automate your outreach, manage prospects, and book more appointments — powered by AI.
          </p>
        </div>

        <Link href="/pricing" className="relative block rounded-xl border border-[#7eb4dc]/40 bg-[#0d1d31] px-5 py-4 text-sm font-semibold text-[#7eb4dc]">{STARTER_INTRO_OFFER}<span className="mt-1 block font-normal text-[#d5e0e9]">View plans, features, and Enterprise options →</span></Link>

        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { icon: Zap, label: "AI-Generated Emails" },
            { icon: Users, label: "Prospect Management" },
            { icon: BarChart3, label: "Real-Time Analytics" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="bg-[#0d1d31]/90 border border-white/10 rounded-[14px] p-4 flex flex-col items-center gap-2 shadow-[0_10px_28px_rgba(0,0,0,.2)]">
              <Icon className="w-5 h-5 text-[#7eb4dc]" />
              <span className="text-[#d5e0e9] font-medium">{label}</span>
            </div>
          ))}
        </div>

        <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/sign-up"
            onClick={() => trackConversionClick("get_started", "logged_out_home")}
            className="px-8 py-3 bg-[#2d6a9b] hover:bg-[#377caf] text-white font-semibold rounded-lg transition-colors shadow-[0_6px_18px_rgba(0,0,0,.28)]"
          >
            Get Started Free
          </Link>
          <Link href="/sign-in" className="px-8 py-3 border border-white/25 bg-white/[.03] text-[#d5e0e9] hover:border-[#7eb4dc] hover:bg-white/[.07] hover:text-white font-semibold rounded-lg transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

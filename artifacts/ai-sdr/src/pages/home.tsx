import { Link } from "wouter";
import { Bot, Zap, BarChart3, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-[#f7f3e9] flex flex-col items-center justify-center px-5 py-10 text-center text-[#172b3a]">
      <div className="max-w-3xl mx-auto space-y-9">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-[#234d73] rounded-[18px] flex items-center justify-center shadow-[0_10px_22px_rgba(35,77,115,.18)]">
            <Bot className="w-9 h-9 text-[#fffdfa]" />
          </div>
        </div>

        <div className="space-y-4">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-[#315f86]">A quieter way to grow</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-[-.04em]">
            iSDRX AI for <span className="text-[#234d73]">Janitorial Companies</span>
          </h1>
          <p className="text-[#65727a] text-lg max-w-xl mx-auto leading-8">
            Automate your outreach, manage prospects, and book more appointments — powered by AI.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            { icon: Zap, label: "AI-Generated Emails" },
            { icon: Users, label: "Prospect Management" },
            { icon: BarChart3, label: "Real-Time Analytics" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="bg-[#fffdfa] border border-[#d8d6cf] rounded-[14px] p-4 flex flex-col items-center gap-2 shadow-[0_8px_24px_rgba(30,45,53,.035)]">
              <Icon className="w-5 h-5 text-[#315f86]" />
              <span className="text-[#43545e] font-medium">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/sign-up" className="px-8 py-3 bg-[#234d73] hover:bg-[#183b59] text-white font-semibold rounded-lg transition-colors shadow-[0_4px_12px_rgba(35,77,115,.18)]">
            Get Started Free
          </Link>
          <Link href="/sign-in" className="px-8 py-3 border border-[#c9c7bf] text-[#43545e] hover:border-[#234d73] hover:text-[#172b3a] font-semibold rounded-lg transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

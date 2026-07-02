import { Link } from "wouter";
import { Bot, Zap, BarChart3, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-slate-950 flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Bot className="w-9 h-9 text-white" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-white">
            iSDRX AI for <span className="text-sky-400">Janitorial Companies</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Automate your outreach, manage prospects, and book more appointments — powered by AI.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          {[
            { icon: Zap, label: "AI-Generated Emails" },
            { icon: Users, label: "Prospect Management" },
            { icon: BarChart3, label: "Real-Time Analytics" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-col items-center gap-2">
              <Icon className="w-5 h-5 text-sky-400" />
              <span className="text-slate-300 font-medium">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/sign-up" className="px-8 py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-sky-500/20">
            Get Started Free
          </Link>
          <Link href="/sign-in" className="px-8 py-3 border border-slate-600 text-slate-200 hover:border-slate-400 hover:text-white font-semibold rounded-xl transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

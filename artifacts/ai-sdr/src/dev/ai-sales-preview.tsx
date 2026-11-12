/** Isolated development fixture; no auth bypass and no requests to live APIs. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VerticalOnboardingDialog } from "@/components/layout";
import { AI_SALES_BUYER_INDUSTRIES, AI_SALES_DESCRIPTION } from "@workspace/db/ai-sales-automation";
import { generateIntroEmail } from "@/lib/email-ai";
import { VERTICAL_LABELS, type SellerVertical } from "@/lib/recruiting";
import "@/index.css";

if (!import.meta.env.DEV) throw new Error("This fixture is only available in development.");
const queryClient = new QueryClient();
function Preview() {
  const [open, setOpen] = useState(true);
  const [vertical, setVertical] = useState<SellerVertical>("ai_sales_automation");
  const [industry, setIndustry] = useState("Recruiting & Staffing");
  const [draft, setDraft] = useState(() => generateIntroEmail({ contactName: "Pat Taylor", companyName: "Example Staffing Agency", industry }, "ai_sales_automation", { sellerCompanyName: "iSDRX AI" }));
  // Only this development entry replaces fetch. The normal app and server are untouched.
  window.fetch = async (input, init) => {
    if (input === "/api/users/settings" && init?.method === "PUT") {
      setVertical(JSON.parse(String(init.body)).vertical);
      setOpen(false);
      return new Response("{}", { status: 200 });
    }
    throw new Error("Network calls are disabled in the development fixture.");
  };
  return <main className="min-h-screen bg-background text-foreground p-8">
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="rounded-lg border bg-muted p-3 text-sm">Development Preview · Fixture data · No live account changes, publishing, or outreach</p>
      <h1 className="text-3xl font-bold">AI Sales Automation</h1>
      <p className="text-muted-foreground">{AI_SALES_DESCRIPTION}</p>
      <section className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-xl font-semibold">Seller onboarding</h2>
        <p>Selected seller industry: <strong data-testid="selected-industry">{VERTICAL_LABELS[vertical]}</strong></p>
        <button className="rounded-md bg-primary text-primary-foreground px-4 py-2" onClick={() => setOpen(true)}>Review industry choices</button>
      </section>
      <section className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-xl font-semibold">Prospect targeting</h2>
        <label className="block">Prospect industry <select aria-label="Prospect industry" value={industry} onChange={e => setIndustry(e.target.value)} className="ml-3 rounded border bg-background p-2">{AI_SALES_BUYER_INDUSTRIES.map(value => <option key={value}>{value}</option>)}</select></label>
        <p>Target owners, CEOs, sales leaders and business development leaders.</p>
        <p className="text-muted-foreground">Staffing agencies are potential software buyers. This does not search for employers buying staffing services.</p>
      </section>
      <section className="rounded-xl border bg-card p-6 space-y-3">
        <h2 className="text-xl font-semibold">Campaign email draft</h2>
        <p className="text-sm text-muted-foreground">No supporting cost comparison or booking link is configured in this fixture. Numerical savings and calendar links are omitted.</p>
        <p className="font-semibold">{draft.subject}</p><p className="whitespace-pre-line leading-relaxed" data-testid="email-draft">{draft.body}</p>
        <button className="rounded-md border px-4 py-2" onClick={() => setDraft(generateIntroEmail({ contactName: "Pat Taylor", companyName: "Example Business", industry }, "ai_sales_automation", { sellerCompanyName: "iSDRX AI" }))}>Generate another wording</button>
      </section>
      <VerticalOnboardingDialog open={open}/>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={queryClient}><Preview/></QueryClientProvider>);

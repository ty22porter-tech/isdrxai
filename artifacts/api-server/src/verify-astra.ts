import { chatModelSettings, researchModelSettings, withOutreachVoice, TEXT_MODEL } from "./lib/aiModelSettings";

type ProbeOptions = { baseURL: string; apiKey: string; fetcher?: typeof fetch };
/** Two synthetic generation calls; no discovery jobs, emails, pipeline writes, or outreach. */
export async function verifyAstra({ baseURL, apiKey, fetcher = fetch }: ProbeOptions) {
  if (!baseURL || !apiKey) throw new Error("Replit AI gateway URL and key are required. Run this check in the connected Replit environment; do not paste secrets into chat.");
  const reports: Array<{ endpoint: string; model: string; elapsedMs: number; usage: unknown }> = [];
  const request = async (endpoint: string, body: object, timeout: number) => {
    const started = Date.now();
    const response = await fetcher(`${baseURL.replace(/\/$/, "")}${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`${endpoint} rejected Astra compatibility check (HTTP ${response.status}). Keep OPENAI_ASTRA_ENABLED unset.`);
    const result = await response.json() as any;
    if (typeof result.model !== "string" || !(result.model === TEXT_MODEL || result.model.startsWith(`${TEXT_MODEL}-`))) {
      throw new Error(`${endpoint} did not confirm the requested Astra model. Keep OPENAI_ASTRA_ENABLED unset.`);
    }
    const usage: Record<string, number> = {};
    for (const key of ["input_tokens", "output_tokens", "prompt_tokens", "completion_tokens", "total_tokens"]) {
      if (typeof result.usage?.[key] === "number") usage[key] = result.usage[key];
    }
    const reasoningTokens = result.usage?.output_tokens_details?.reasoning_tokens ?? result.usage?.completion_tokens_details?.reasoning_tokens;
    if (typeof reasoningTokens === "number") usage.reasoning_tokens = reasoningTokens;
    reports.push({ endpoint, model: result.model, elapsedMs: Date.now() - started, usage });
    return result;
  };
  const chat = await request("/chat/completions", {
    ...chatModelSettings(600, true),
    messages: withOutreachVoice([{ role: "user", content: `Write a warm, upbeat synthetic Recruiting email to Jordan at Example Manufacturing about the supplied published Warehouse Manager opening. The synthetic seller, Example Staffing, offers temp-to-hire only. Ask about in-house versus outside support; do not invent urgency, candidates, or other services. Return JSON only with subject and body, under 100 words, ending with one easy question. This is a draft only; do not send anything.` }]),
  }, 45_000);
  if (chat.choices?.[0]?.finish_reason !== "stop") throw new Error("Astra chat output was incomplete; verify token budgets before enabling.");
  let draft;
  try { draft = JSON.parse(chat.choices[0].message.content); }
  catch { throw new Error("Astra chat did not return the required JSON draft."); }
  if (typeof draft.subject !== "string" || !draft.subject.trim() || typeof draft.body !== "string" || !draft.body.includes("Warehouse Manager")) {
    throw new Error("Astra chat did not preserve the synthetic draft contract and role.");
  }
  if (draft.body.trim().split(/\s+/).length > 100 || (draft.body.match(/\?/g) ?? []).length !== 1 || !draft.body.trim().endsWith("?")) {
    throw new Error("Astra synthetic draft did not preserve the word limit and single closing question.");
  }
  const research = await request("/responses", {
    ...researchModelSettings(600, true), tools: [{ type: "web_search" }], tool_choice: { type: "web_search" },
    include: ["web_search_call.action.sources"],
    input: "Use web search to identify OpenAI's official website. Return JSON only: {\"company\":\"OpenAI\",\"sourceURL\":\"exact official website URL cited by web search\"}. Do not add commentary.",
  }, 20_000);
  if (research.status !== "completed" || research.reasoning?.effort !== "medium") {
    throw new Error("Astra Responses did not confirm completed output with medium reasoning.");
  }
  const calls = (research.output ?? []).filter((item: any) => item.type === "web_search_call" && item.status === "completed");
  const parts = (research.output ?? []).flatMap((item: any) => item.content ?? []);
  const sources = [...calls.flatMap((item: any) => item.action?.sources ?? []), ...parts.flatMap((part: any) => part.annotations ?? [])];
  let found;
  try { found = JSON.parse(parts.filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("\n")); }
  catch { throw new Error("Astra web research did not return complete JSON."); }
  if (!calls.length || found.company !== "OpenAI" || !sources.some((s: any) => String(s.url).replace(/\/$/, "") === String(found.sourceURL).replace(/\/$/, ""))) {
    throw new Error("Astra web research did not substantiate its result with a completed search and citation.");
  }
  const official = new URL(found.sourceURL);
  if (official.protocol !== "https:" || (official.hostname !== "openai.com" && !official.hostname.endsWith(".openai.com"))) throw new Error("Astra web research did not establish the official company domain.");
  return { passed: true, reports, syntheticDraft: { subject: draft.subject, body: draft.body }, note: "Review this synthetic draft's tone. This checks two requests, not production cost, load, or every research output. Set OPENAI_ASTRA_ENABLED=true only in environments that pass and meet the workload's latency/cost requirements." };
}

if (process.argv[1]?.endsWith("verify-astra.ts")) {
  verifyAstra({ baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "", apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "" })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error instanceof Error ? error.message : "Astra verification failed."); process.exitCode = 1; });
}

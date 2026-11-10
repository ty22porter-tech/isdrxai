import { expect, it, vi } from "vitest";
import { verifyAstra } from "./verify-astra";
const chat = { model: "gpt-6-astra", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ subject: "A hiring question", body: "Hi Jordan,\n\nI'd love to ask about your Warehouse Manager opening. Could we talk?" }) } }], usage: { total_tokens: 100 } };
const research = { model: "gpt-6-astra", status: "completed", reasoning: { effort: "medium" }, output: [
  { type: "web_search_call", status: "completed", action: { sources: [{ url: "https://openai.com/" }] } },
  { content: [{ type: "output_text", text: JSON.stringify({ company: "OpenAI", sourceURL: "https://openai.com/" }) }] },
] };
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

it("proves both request contracts with actual returned model identity, JSON, and web citation", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(chat)).mockResolvedValueOnce(response(research));
  const result = await verifyAstra({ baseURL: "https://synthetic.example/", apiKey: "synthetic-secret", fetcher });
  expect(result.passed).toBe(true);
  expect(result.reports).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  const requests = fetcher.mock.calls.map(call => JSON.parse(call[1].body));
  expect(requests[0]).toMatchObject({ model: "gpt-6-astra", reasoning_effort: "medium" });
  expect(requests[1]).toMatchObject({ model: "gpt-6-astra", reasoning: { effort: "medium" }, tools: [{ type: "web_search" }] });
});
it("does not make requests when gateway credentials are absent", async () => {
  const fetcher = vi.fn();
  await expect(verifyAstra({ baseURL: "", apiKey: "", fetcher })).rejects.toThrow("gateway URL and key are required");
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects provider model substitution instead of claiming Astra support", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ ...chat, model: "gpt-5.4" }));
  await expect(verifyAstra({ baseURL: "https://synthetic.example", apiKey: "test-only", fetcher })).rejects.toThrow("did not confirm");
});
it("fails a provider rejection without logging its potentially sensitive body", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("provider-private-response", { status: 400 }));
  await expect(verifyAstra({ baseURL: "https://synthetic.example", apiKey: "test-only", fetcher })).rejects.toThrow("HTTP 400");
});
it.each([
  { ...research, status: "incomplete" },
  { ...research, reasoning: { effort: "low" } },
  { ...research, output: research.output.slice(1) },
])("requires complete medium-reasoning research with completed web search", async bad => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(chat)).mockResolvedValueOnce(response(bad));
  await expect(verifyAstra({ baseURL: "https://synthetic.example", apiKey: "test-only", fetcher })).rejects.toThrow();
});

it("stops after truncated chat output instead of spending another research request", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ ...chat, choices: [{ ...chat.choices[0], finish_reason: "length" }] }));
  await expect(verifyAstra({ baseURL: "https://synthetic.example", apiKey: "test-only", fetcher })).rejects.toThrow("incomplete");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

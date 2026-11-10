import { afterEach, expect, it, vi } from "vitest";
import { astraEnabled, chatModelSettings, researchModelSettings, withOutreachVoice } from "./aiModelSettings";
afterEach(() => vi.unstubAllEnvs());

it("keeps existing per-workload models and budgets until Astra is explicitly enabled", () => {
  vi.stubEnv("OPENAI_ASTRA_ENABLED", "");
  expect(astraEnabled()).toBe(false);
  expect(chatModelSettings(600)).toEqual({ model: "gpt-5.4", max_completion_tokens: 600 });
  expect(researchModelSettings(6000)).toMatchObject({ model: "gpt-5.4-mini", max_output_tokens: 6000 });
  expect(researchModelSettings(6000)).not.toHaveProperty("reasoning");
});
it("uses the endpoint-specific medium reasoning fields only in enabled mode", () => {
  vi.stubEnv("OPENAI_ASTRA_ENABLED", "true");
  expect(chatModelSettings(600)).toEqual({ model: "gpt-6-astra", reasoning_effort: "medium", max_completion_tokens: 8792 });
  expect(researchModelSettings(600)).toMatchObject({ model: "gpt-6-astra", reasoning: { effort: "medium" }, max_output_tokens: 8792 });
  expect(researchModelSettings(600)).not.toHaveProperty("reasoning_effort");
  expect(chatModelSettings(600)).not.toHaveProperty("temperature");
});
it("keeps voice warm without changing task format or mutating original messages", () => {
  const input = [{ role: "system", content: "Return JSON only, one question, under 100 words." }, { role: "user", content: "Synthetic employer" }];
  const result = withOutreachVoice(input);
  expect(result[0].content).toContain("enthusiastic human tone");
  expect(result[0].content).toContain("Return JSON only, one question, under 100 words.");
  expect(result[0].content).toContain("Never invent personal experience");
  expect(input[0].content).not.toContain("enthusiastic");
  expect(result[1]).toEqual(input[1]);
});

import { describe, expect, it, vi } from "vitest";
vi.mock("./emailGeneration", () => ({ chatComplete: vi.fn() }));
import { answerHelp, helpReferences, retrieveHelp } from "./helpKnowledge";

describe("guide-grounded app help", () => {
  it.each([
    ["What does Possible Fit mean?", "fit-scores"],
    ["How do I reschedule?", "appointments"],
    ["Does Gift Suggestions ship a gift?", "gift-outreach"],
    ["How does Founding20 work?", "billing"],
  ])("finds the relevant current guide content: %s", (question, anchor) => {
    expect(retrieveHelp(question).some(source => source.anchor.includes(anchor))).toBe(true);
  });
  it("does not spend an AI call on an unrelated question", async () => {
    const complete = vi.fn();
    expect(await answerHelp("Weather in Antarctica?", "Settings", complete)).toMatchObject({ answered: false });
    expect(complete).not.toHaveBeenCalled();
  });
  it("returns only server-owned guide links when the answer has real supporting evidence", async () => {
    const question = "What does Possible Fit mean?";
    const ref = retrieveHelp(question)[0];
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ supported: true, answer: "Possible Fit is a potential opportunity that needs qualification, not a purchase probability.", evidence: [{ sourceId: ref.id, quote: ref.text.slice(0, 180) }] }));
    const result = await answerHelp(question, "Prospect Search", complete);
    expect(result.answered).toBe(true);
    expect(result.sources[0].href).toBe(`/help#${ref.anchor}`);
    expect(complete.mock.calls[0][0][0].content).toContain("NO access");
    expect(complete.mock.calls[0][0][1].content).toContain("guide");
  });
  it.each([
    { supported: false, answer: "A guess", evidence: [] },
    { supported: true, answer: "Invented", evidence: [{ sourceId: "invented", quote: "This quote does not exist in the guide." }] },
  ])("escalates unsupported output instead of accepting model confidence alone", async result => {
    expect(await answerHelp("Explain fit scores", "Prospect Search", vi.fn().mockResolvedValue(JSON.stringify(result)))).toMatchObject({ answered: false, sources: [] });
  });
  it("rejects fabricated quotations even with a real source ID", async () => {
    const ref = retrieveHelp("Explain fit scores")[0];
    const result = await answerHelp("Explain fit scores", "Prospect Search", vi.fn().mockResolvedValue(JSON.stringify({ supported: true, answer: "A guarantee", evidence: [{ sourceId: ref.id, quote: "A 76 score guarantees a 76% chance of a purchase." }] })));
    expect(result.answered).toBe(false);
  });
  it("offers support for a failed provider or malformed model response", async () => {
    for (const provider of [vi.fn().mockRejectedValue(new Error("private-provider-detail")), vi.fn().mockResolvedValue("not JSON")]) {
      const result = await answerHelp("Explain fit scores", "Prospect Search", provider);
      expect(result.answered).toBe(false);
      expect(result.answer).not.toContain("private-provider-detail");
    }
  });
  it("includes the real support workflow and current billing terms in the bundled guide", () => {
    expect(helpReferences.some(ref => ref.anchor === "ask-isdrx-ai" && ref.text.includes("24 hours"))).toBe(true);
    expect(helpReferences.some(ref => ref.anchor === "billing" && ref.text.includes("Founding20") && ref.text.includes("$749"))).toBe(true);
  });
});

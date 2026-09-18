import { describe, expect, it } from "vitest";
import { giftVideoEditStatus, giftVideoLeadStrength } from "./giftVideoPresentation";

describe("gift video edits invalidate actionable workflow state", () => {
  const prepared = { status: "ready", draftSubject: "Hello", draftBody: "A personal message", dueAt: new Date() };
  it("moves an edited prepared draft out of ready and back to review", () => {
    expect(giftVideoEditStatus(prepared, 1)).toBe("review");
  });
  it("keeps unprepared scheduled records schedulable and missing videos explicit", () => {
    expect(giftVideoEditStatus({ ...prepared, draftBody: null }, 1)).toBe("scheduled");
    expect(giftVideoEditStatus(prepared, null)).toBe("needs_video");
    expect(giftVideoEditStatus({ ...prepared, status: "stopped" }, 1)).toBe("stopped");
  });
});
describe("lead strength follows configured scoring rather than a hard-coded threshold", () => {
  it("allows cached Hot without claiming there is a booking", () => {
    expect(giftVideoLeadStrength({ interestLevel: "hot", manualInterestLevel: null })).toBe("Hot");
    expect(giftVideoLeadStrength({ interestLevel: "low", manualInterestLevel: null })).toBe("Low");
    expect(giftVideoLeadStrength({ interestLevel: "medium", manualInterestLevel: null })).toBe("Medium");
  });
  it("respects the existing manual interest-level override", () => {
    expect(giftVideoLeadStrength({ interestLevel: "hot", manualInterestLevel: "low" })).toBe("Low");
  });
});
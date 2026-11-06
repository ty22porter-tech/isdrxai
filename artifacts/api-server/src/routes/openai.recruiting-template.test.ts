import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ chat: vi.fn(), where: vi.fn() }));
vi.mock("@workspace/db", async original => ({
  ...await original<typeof import("@workspace/db")>(),
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));
vi.mock("../lib/requireAuth", () => ({ requireAuth: vi.fn(), requireEntitlement: vi.fn() }));
vi.mock("../lib/sellerResearch", () => ({ ensureCurrentSellerResearch: async (_id: string, client: any) => client }));
vi.mock("../lib/emailGeneration", async original => ({ ...await original<typeof import("../lib/emailGeneration")>(), chatComplete: mocks.chat }));
vi.mock("../lib/emailRelevance", () => ({ evaluateEmailRelevance: () => ({ score: 100, reasons: [] }) }));
import router from "./openai";
import { opportunityEmailContext } from "../lib/opportunityIntelligence";

afterEach(() => vi.clearAllMocks());
it.each([1, 7])("keeps job openings reusable in Recruiting campaign step %s even if the AI omits the field", async step => {
  mocks.where.mockResolvedValue([{ id: "qa", vertical: "recruiting_staffing", businessName: "Southern Staffing Solutions" }]);
  mocks.chat.mockResolvedValue(JSON.stringify({ subject: "Hiring priorities", body: "Hi {{contactName}},\n\nCould we discuss staffing at {{companyName}}?" }));
  const layer = router.stack.find((item: any) => item.route?.path === "/generate-email") as any;
  const handler = layer.route.stack.at(-1).handle;
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() };
  await handler({ body: { step, industry: "Healthcare" }, clientId: "qa", log: { error: vi.fn(), warn: vi.fn() } }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].body).toContain("{{jobOpenings}}");
  expect(mocks.chat.mock.calls[0][0][0].content).toContain("{{jobOpenings}}");
});
describe("personalized Recruiting writer context", () => {
  it("supplies exact researched titles while excluding unknown and closed roles", () => {
    const research = { signals: [], itResearch: { prospectConcerns: [], recommendations: [], industryChallenges: [], industrySources: [], recruiting: {
      employerIdentity: "confirmed", automationSuppressed: false,
      jobs: ["active", "unknown", "closed"].map(status => ({ title: `${status} Nurse`, status, location: "Dallas, TX", sourceURL: "https://employer.example/jobs", evidence: "Published job", noAgencies: false })),
    } } } as any;
    const context = opportunityEmailContext(research);
    expect(context).toContain("active Nurse (Dallas, TX)");
    expect(context).not.toMatch(/unknown Nurse|closed Nurse/);
    expect(context).toContain("mention at least one exact job title");
  });
});

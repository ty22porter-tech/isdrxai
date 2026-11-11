import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getAuth: vi.fn(), answer: vi.fn(), send: vi.fn() }));
vi.mock("@clerk/express", () => ({ getAuth: mocks.getAuth }));
vi.mock("../lib/emailGeneration", () => ({ chatComplete: vi.fn() }));
vi.mock("../lib/helpKnowledge", async original => ({ ...await original<typeof import("../lib/helpKnowledge")>(), answerHelp: mocks.answer }));
vi.mock("../lib/emailSender", () => ({ sendEmail: mocks.send }));
import { helpRouter } from "./help";

const key = "0fe4d608-227c-4417-8c4e-659fd23dd40b";
async function post(path: string, body: any, user: string = crypto.randomUUID()) {
  const req = { body, log: { error: vi.fn() } } as any;
  const res = { locals: { helpUserId: user }, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const route = (helpRouter.stack.find((layer: any) => layer.route?.path === path) as any).route;
  await route.stack.at(-1).handle(req, res);
  return res;
}
beforeEach(() => { vi.clearAllMocks(); mocks.getAuth.mockReturnValue({ userId: "owner" }); mocks.answer.mockResolvedValue({ answered: false, answer: "Contact support", sources: [] }); mocks.send.mockResolvedValue("email_received"); });

describe("authenticated app help", () => {
  it("requires a signed-in identity before any endpoint", () => {
    mocks.getAuth.mockReturnValue({ userId: null });
    const res = { locals: {}, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();
    helpRouter.stack[0].handle({} as any, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  it("allows signed-in help without requiring a paid account or reading private records", () => {
    const res = { locals: {} } as any;
    const next = vi.fn();
    helpRouter.stack[0].handle({} as any, res, next);
    expect(res.locals.helpUserId).toBe("owner");
    expect(next).toHaveBeenCalled();
  });
  it("passes only the validated question and section to the guide assistant", async () => {
    await post("/answer", { question: "What does Possible Fit mean?", page: "Prospect Search", accountId: "another-tenant", secret: "not-forwarded" });
    expect(mocks.answer).toHaveBeenCalledWith("What does Possible Fit mean?", "Prospect Search");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("sends only explicit support submissions to the fixed support inbox with a scoped idempotency key", async () => {
    const body = { email: "user@example.test", question: "How do I create a campaign?", page: "Campaigns", requestKey: key };
    const res = await post("/support", body, "owner-a");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "info@isdrxai.com", replyTo: body.email, idempotencyKey: `app-help:owner-a:${key}` }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, message: "Your question has been sent to support. We’ll respond within 24 hours, seven days a week." }));
  });
  it("does not show a delivery promise when the provider fails", async () => {
    mocks.send.mockRejectedValue(new Error("private mail transport details"));
    const res = await post("/support", { email: "user@example.test", question: "How do I get help?", requestKey: key });
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("ok", true);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("within 24 hours");
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("private mail transport details");
  });
  it("escapes submitted HTML and rejects invalid email/header input", async () => {
    await post("/support", { email: "user@example.test", question: "<img src=x onerror=alert(1)>", requestKey: key });
    expect(mocks.send.mock.calls[0][0].html).not.toContain("<img");
    expect(mocks.send.mock.calls[0][0].html).toContain("&lt;img");
    mocks.send.mockClear();
    const res = await post("/support", { email: "user@example.test\nBcc:other@example.test", question: "A question", requestKey: key });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("limits model requests for one signed-in user", async () => {
    const id = crypto.randomUUID();
    for (let i = 0; i < 10; i++) await post("/answer", { question: "How do fit scores work?" }, id);
    const res = await post("/answer", { question: "How do fit scores work?" }, id);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(mocks.answer).toHaveBeenCalledTimes(10);
  });
});

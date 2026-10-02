import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), ready: vi.fn() }));
vi.mock("./outboundResend", () => ({ outboundResendRequest: mocks.request }));
vi.mock("./outboundResendWebhook", () => ({ assertOutboundDeliveryReady: mocks.ready }));
import { getPlatformFromEmail, sendEmail, isResendConfigured } from "./emailSender";

const options = { fromName: "FORTE TECHNOLOGIES", replyTo: "reply-token@sdrai.xyz", to: "recipient@example.com", subject: "Test", body: "Test body" };
beforeEach(() => { vi.resetAllMocks(); });
describe("outbound Resend cutover", () => {
  it("uses the branded default regardless of the old deployment setting", () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "old@sdrai.xyz");
    expect(getPlatformFromEmail()).toBe("outreach@isdrxai.com");
    vi.unstubAllEnvs();
  });
  it("preserves reply routing, attachments, headers and idempotency", async () => {
    mocks.request.mockResolvedValue(new Response(JSON.stringify({ id: "provider-id" })));
    expect(await sendEmail({ ...options, attachments: [{filename:"intro.pdf",content:Buffer.from("pdf")}], headers:{"List-Unsubscribe":"<https://example.com/unsubscribe>"},idempotencyKey:"stable-key" })).toBe("provider-id");
    const [path, request] = mocks.request.mock.calls[0];
    expect(path).toBe("/emails");
    expect(request.headers["Idempotency-Key"]).toBe("stable-key");
    expect(JSON.parse(request.body)).toMatchObject({from:"FORTE TECHNOLOGIES <outreach@isdrxai.com>",reply_to:options.replyTo,attachments:[{filename:"intro.pdf",content:"cGRm"}],headers:{"List-Unsubscribe":"<https://example.com/unsubscribe>"}});
  });
  it("preserves explicit client senders", async () => {
    mocks.request.mockResolvedValue(new Response(JSON.stringify({ id: "id" })));
    await sendEmail({...options,fromEmail:"sales@verified.example"});
    expect(JSON.parse(mocks.request.mock.calls[0][1].body).from).toContain("<sales@verified.example>");
  });
  it("fails closed without tracking readiness", async () => {
    mocks.ready.mockImplementation(() => { throw new Error("Tracking not ready"); });
    await expect(sendEmail(options)).rejects.toThrow("Tracking not ready");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not fall back on rejection or missing provider ID", async () => {
    mocks.request.mockResolvedValueOnce(new Response(JSON.stringify({ message:"Domain not verified" }),{status:403}));
    await expect(sendEmail(options)).rejects.toThrow("Domain not verified");
    mocks.request.mockResolvedValueOnce(new Response("{}"));
    await expect(sendEmail(options)).rejects.toThrow("message ID");
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
  it("requires the verified branded domain for readiness", async () => {
    mocks.request.mockResolvedValueOnce(new Response(JSON.stringify({data:[{name:"isdrxai.com",status:"verified"}]})));
    expect(await isResendConfigured()).toBe(true);
    mocks.request.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await isResendConfigured()).toBe(false);
  });
});
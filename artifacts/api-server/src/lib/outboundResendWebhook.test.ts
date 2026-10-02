import { createHmac } from "node:crypto";
import type { Request, Response as ExpressResponse } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  delivery: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock("./outboundResend", () => ({ outboundResendRequest: mocks.request }));
vi.mock("./deliveryEvents", () => ({ handleDeliveryWebhookEvent: mocks.delivery }));
vi.mock("./logger", () => ({ logger: mocks.logger }));

const base = "https://outbound.example.com";
const endpoint = `${base}/api/resend/outbound-webhook`;
const events = ["email.delivered", "email.bounced", "email.complained"];
const key = Buffer.from("focused-webhook-test-signing-key");
const secret = `whsec_${key.toString("base64")}`;
let module: typeof import("./outboundResendWebhook");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setupResponses(options: {
  existing?: boolean;
  domainStatus?: string;
  sending?: string;
  webhook?: Record<string, unknown>;
} = {}) {
  mocks.request.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/domains?limit=100") return json({ data: [{ id: "domain-new", name: "isdrxai.com" }], has_more: false });
    if (path === "/domains/domain-new") {
      return json({
        id: "domain-new", name: "isdrxai.com",
        status: options.domainStatus ?? "verified",
        capabilities: { sending: options.sending ?? "enabled" },
      });
    }
    if (path === "/webhooks?limit=100") {
      return json({
        data: [
          { id: "legacy", endpoint: `${base}/api/resend/webhook` },
          ...(options.existing ? [{ id: "hook-new", endpoint }] : []),
        ],
        has_more: false,
      });
    }
    if (path === "/webhooks" && init?.method === "POST") return json({ id: "hook-new", signing_secret: secret });
    if (path === "/webhooks/hook-new" && init?.method === "PATCH") return json({ id: "hook-new" });
    if (path === "/webhooks/hook-new") {
      return json({ id: "hook-new", endpoint, status: "enabled", events, signing_secret: secret, ...options.webhook });
    }
    throw new Error(`Unexpected test request: ${path}`);
  });
}

function makeResponse() {
  return {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function makeRequest(type = "email.delivered", signingKey = key, prefix = "svix"): Request {
  const raw = JSON.stringify({ type, data: { email_id: "email-new" } });
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", signingKey).update(`${id}.${timestamp}.${raw}`).digest("base64");
  return {
    body: Buffer.from(raw),
    headers: {
      [`${prefix}-id`]: id,
      [`${prefix}-timestamp`]: timestamp,
      [`${prefix}-signature`]: `v1,${signature}`,
    },
  } as Request;
}

async function receive(req = makeRequest()) {
  const res = makeResponse();
  await module.handleOutboundResendWebhook(req, res as unknown as ExpressResponse);
  return res;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.delivery.mockReset();
  mocks.request.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PUBLIC_APP_URL", base);
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "legacy-secret-untouched");
  vi.stubEnv("RESEND_API_KEY", "legacy-key-untouched");
  module = await import("./outboundResendWebhook");
  setupResponses();
});
afterEach(() => vi.unstubAllEnvs());

describe("connected outbound delivery configuration", () => {
  it("does nothing outside production and permits development sending", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await module.ensureOutboundResendWebhook();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(() => module.assertOutboundDeliveryReady()).not.toThrow();
  });

  it("fails closed before setup and returns a retryable response without a secret", async () => {
    expect(() => module.assertOutboundDeliveryReady()).toThrow("not ready");
    expect((await receive()).statusCode).toBe(503);
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("creates only the separate webhook and leaves legacy credentials untouched", async () => {
    await module.ensureOutboundResendWebhook();
    expect(() => module.assertOutboundDeliveryReady()).not.toThrow();
    const create = mocks.request.mock.calls.find(([path]) => path === "/webhooks");
    expect(JSON.parse(create![1].body)).toEqual({ endpoint, events });
    expect(mocks.request.mock.calls.some(([path]) => path.includes("/legacy"))).toBe(false);
    expect(process.env.RESEND_WEBHOOK_SECRET).toBe("legacy-secret-untouched");
    expect(process.env.RESEND_API_KEY).toBe("legacy-key-untouched");
    expect(JSON.stringify([mocks.logger.info.mock.calls, mocks.logger.error.mock.calls])).not.toContain(secret);
    expect(mocks.logger.info).toHaveBeenCalledWith("Outbound sending domain and delivery webhook ready");
  });

  it("reuses and enables an existing webhook with only delivery subscriptions", async () => {
    setupResponses({ existing: true });
    await module.ensureOutboundResendWebhook();
    const patch = mocks.request.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("/webhooks/hook-new");
    expect(JSON.parse(patch![1].body)).toEqual({ events, status: "enabled" });
    expect(mocks.request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(() => module.assertOutboundDeliveryReady()).not.toThrow();
  });

  it.each(["pending", "partially_verified", "failed"])("blocks sends for domain status %s", async (domainStatus) => {
    setupResponses({ domainStatus });
    await expect(module.ensureOutboundResendWebhook()).resolves.toBeUndefined();
    expect(() => module.assertOutboundDeliveryReady()).toThrow();
    expect(mocks.request.mock.calls.some(([path]) => path.startsWith("/webhooks"))).toBe(false);
  });

  it("blocks sends when the verified domain has sending disabled", async () => {
    setupResponses({ sending: "disabled" });
    await module.ensureOutboundResendWebhook();
    expect(() => module.assertOutboundDeliveryReady()).toThrow();
  });

  it.each([
    { signing_secret: undefined },
    { status: "disabled" },
    { events: ["email.delivered"] },
    { endpoint: `${base}/api/resend/webhook` },
  ])("requires complete webhook configuration: %j", async (webhook) => {
    setupResponses({ webhook });
    await module.ensureOutboundResendWebhook();
    expect(() => module.assertOutboundDeliveryReady()).toThrow();
  });

  it("API failure does not crash bootstrap or leak error text and clears previous readiness", async () => {
    await module.ensureOutboundResendWebhook();
    mocks.request.mockRejectedValue(new Error(`sensitive ${secret}`));
    await expect(module.ensureOutboundResendWebhook()).resolves.toBeUndefined();
    expect(() => module.assertOutboundDeliveryReady()).toThrow();
    expect(mocks.logger.error).toHaveBeenLastCalledWith(
      "Outbound Resend setup failed — sending is blocked until domain and delivery webhook are ready",
    );
  });

  it("follows list pagination to find the exact domain", async () => {
    const normal = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/domains?limit=100") return Promise.resolve(json({ data: [{ id: "other", name: "other.com" }], has_more: true }));
      if (path === "/domains?limit=100&after=other") return normal("/domains?limit=100", init);
      return normal(path, init);
    });
    await module.ensureOutboundResendWebhook();
    expect(() => module.assertOutboundDeliveryReady()).not.toThrow();
  });

  it("rejects a non-HTTPS public endpoint without making API requests", async () => {
    vi.stubEnv("PUBLIC_APP_URL", "http://outbound.example.com");
    await module.ensureOutboundResendWebhook();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(() => module.assertOutboundDeliveryReady()).toThrow();
  });
});

describe("outbound signature and processing gate", () => {
  beforeEach(async () => {
    await module.ensureOutboundResendWebhook();
  });

  it.each(events)("verifies real local signatures and handles %s", async (type) => {
    expect((await receive(makeRequest(type))).statusCode).toBe(200);
    expect(mocks.delivery).toHaveBeenCalledWith({ type, data: { email_id: "email-new" } });
  });

  it("accepts webhook-* signature headers as a fallback", async () => {
    expect((await receive(makeRequest("email.delivered", key, "webhook"))).statusCode).toBe(200);
  });

  it("rejects missing signatures, wrong-account signatures, and modified payloads", async () => {
    const missing = makeRequest();
    missing.headers = {};
    const modified = makeRequest();
    modified.body = Buffer.from('{"type":"email.bounced"}');
    for (const req of [missing, makeRequest("email.delivered", Buffer.from("old-account-key")), modified]) {
      expect((await receive(req)).statusCode).toBe(400);
    }
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("does not process email.received, opens, or clicks", async () => {
    for (const type of ["email.received", "email.opened", "email.clicked"]) {
      expect((await receive(makeRequest(type))).statusCode).toBe(200);
    }
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("does not ACK until the awaited delivery handler completes", async () => {
    let release!: () => void;
    mocks.delivery.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const res = makeResponse();
    const pending = module.handleOutboundResendWebhook(makeRequest(), res as unknown as ExpressResponse);
    expect(mocks.delivery).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
    release();
    await pending;
    expect(res.statusCode).toBe(200);
  });

  it("returns 500 on processing failure to request provider retries", async () => {
    mocks.delivery.mockRejectedValue(new Error(`do not log payload or ${secret}`));
    expect((await receive()).statusCode).toBe(500);
    expect(mocks.logger.error).toHaveBeenLastCalledWith("Outbound delivery event processing failed — provider should retry");
  });
});
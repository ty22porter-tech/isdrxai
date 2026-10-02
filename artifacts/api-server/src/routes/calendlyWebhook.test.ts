import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";

// The handler pulls in the DB and engagement scoring — mock them so the
// signature-gate tests run without a database.
vi.mock("@workspace/db", () => ({
  db: {},
  appointmentsTable: {},
  prospectsTable: {},
  activityTable: {},
  scoreEventsTable: {},
}));
vi.mock("../lib/engagementScoring", () => ({
  recordEngagementEvent: vi.fn(),
  cancelPendingAutomation: vi.fn(),
}));
vi.mock("../lib/calendlyLocks", () => ({ calendlyInviteeLocks: {} }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { handleCalendlyWebhook } from "./calendlyWebhook";

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

function makeReq(body: object, headers: Record<string, string> = {}) {
  return { body: Buffer.from(JSON.stringify(body)), headers } as any;
}

function sign(body: object, key: string, t = String(Math.floor(Date.now() / 1000))) {
  const raw = JSON.stringify(body);
  const v1 = crypto.createHmac("sha256", key).update(`${t}.${raw}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

const ENV_KEYS = ["CALENDLY_OAUTH_WEBHOOK_SIGNING_KEY", "NODE_ENV", "REPLIT_DEPLOYMENT"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Calendly webhook signature gate", () => {
  it("rejects unsigned requests in production (NODE_ENV) when no signing key is configured", async () => {
    process.env.NODE_ENV = "production";
    const res = makeRes();
    await handleCalendlyWebhook(makeReq({ event: "invitee.created" }), res);
    expect(res.statusCode).toBe(403);
  });

  it("rejects unsigned requests in production (REPLIT_DEPLOYMENT) when no signing key is configured", async () => {
    process.env.REPLIT_DEPLOYMENT = "1";
    const res = makeRes();
    await handleCalendlyWebhook(makeReq({ event: "invitee.created" }), res);
    expect(res.statusCode).toBe(403);
  });

  it("rejects requests with a missing signature header when a key is configured", async () => {
    process.env.CALENDLY_OAUTH_WEBHOOK_SIGNING_KEY = "test-key";
    const res = makeRes();
    await handleCalendlyWebhook(makeReq({ event: "ping" }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("Invalid signature");
  });

  it("rejects requests signed with the wrong key", async () => {
    process.env.CALENDLY_OAUTH_WEBHOOK_SIGNING_KEY = "test-key";
    const body = { event: "ping" };
    const res = makeRes();
    await handleCalendlyWebhook(
      makeReq(body, { "calendly-webhook-signature": sign(body, "wrong-key") }),
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("accepts requests with a valid signature", async () => {
    process.env.CALENDLY_OAUTH_WEBHOOK_SIGNING_KEY = "test-key";
    process.env.NODE_ENV = "production";
    const body = { event: "ping" }; // non-booking event → acknowledged/ignored
    const res = makeRes();
    await handleCalendlyWebhook(
      makeReq(body, { "calendly-webhook-signature": sign(body, "test-key") }),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.ignored).toBe(true);
  });

  it("rejects unsigned requests even outside production", async () => {
    const res = makeRes();
    await handleCalendlyWebhook(makeReq({ event: "ping" }), res);
    expect(res.statusCode).toBe(403);
  });
  it("rejects a correctly signed but expired delivery", async () => {
    process.env.CALENDLY_OAUTH_WEBHOOK_SIGNING_KEY = "test-key";
    const body = { event: "ping" };
    const res = makeRes();
    await handleCalendlyWebhook(makeReq(body, { "calendly-webhook-signature": sign(body, "test-key", "1712345678") }), res);
    expect(res.statusCode).toBe(400);
  });
});

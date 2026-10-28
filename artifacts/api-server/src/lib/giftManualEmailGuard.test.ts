import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const names = ["steps", "records", "settings", "enrollments", "appointments", "campaigns", "emails", "prospects", "users", "activity", "links"];
  const tables: Record<string, any> = {};
  const fields = ["id", "clientId", "prospectId", "campaignId", "originalStep", "ownerToken", "status", "emailId", "sentAt", "repliedAt", "emailsSent"];
  for (const name of names) tables[name] = Object.fromEntries([["name", name], ...fields.map(k => [k, k])]);
  const state = { rows: {} as Record<string, any[]>, tail: Promise.resolve(), send: vi.fn() };
  const chain = (run: (condition: any) => any[]) => {
    let condition = (_r: any) => true;
    const q: any = {
      where: (next: any) => { condition = next; return q; },
      for: () => q, limit: () => q, orderBy: () => q, returning: () => q,
      then: (resolve: any, reject: any) => Promise.resolve().then(() => run(condition)).then(resolve, reject),
    };
    return q;
  };
  const db: any = {
    select: () => ({ from: (table: any) => chain(condition => (state.rows[table.name] || []).filter(condition)) }),
    insert: (table: any) => ({ values: (input: any) => chain(() => {
      const rows = (Array.isArray(input) ? input : [input]).map((r, i) => ({ id: (state.rows[table.name]?.length || 0) + i + 1, status: "claimed", sentAt: new Date(), ...r }));
      (state.rows[table.name] ||= []).push(...rows);
      return rows;
    }) }),
    update: (table: any) => ({ set: (patch: any) => chain(condition => {
      const changed: any[] = [];
      state.rows[table.name] = (state.rows[table.name] || []).map(r => {
        if (!condition(r)) return r;
        const updated = { ...r, ...patch }; changed.push(updated); return updated;
      });
      return changed;
    }) }),
    execute: async () => {},
    transaction: (fn: any) => {
      const result = state.tail.then(() => fn(db));
      state.tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return { tables, db, state };
});
vi.mock("@workspace/db", () => ({
  db: fake.db, giftManualSequenceStepsTable: fake.tables.steps,
  giftOutreachRecordsTable: fake.tables.records, giftOutreachSettingsTable: fake.tables.settings,
  autopilotEnrollmentsTable: fake.tables.enrollments, appointmentsTable: fake.tables.appointments,
  campaignsTable: fake.tables.campaigns, emailsTable: fake.tables.emails, prospectsTable: fake.tables.prospects,
  usersTable: fake.tables.users, activityTable: fake.tables.activity, emailLinksTable: fake.tables.links,
}));
vi.mock("drizzle-orm", () => ({
  eq: (key: string, value: unknown) => (r: any) => r[key] === value,
  and: (...conditions: any[]) => (r: any) => conditions.every(fn => fn(r)),
  or: (...conditions: any[]) => (r: any) => conditions.some(fn => fn(r)),
  isNotNull: (key: string) => (r: any) => r[key] != null,
  isNull: (key: string) => (r: any) => r[key] == null,
  inArray: (key: string, values: unknown[]) => (r: any) => values.includes(r[key]),
  sql: () => null,
}));
vi.mock("./emailSender", () => ({ sendEmail: fake.state.send }));
vi.mock("./clientAttachments", () => ({ getClientEmailAttachments: async () => [] }));
vi.mock("./requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.clientId = "client"; req.log = { error: vi.fn() }; next();
  },
  requireEntitlement: (_req: any, _res: any, next: any) => next(),
}));
import { guardedManualEmail, manualSequenceStep } from "./giftManualEmailGuard";
import { DEFAULT_GIFT_SETTINGS } from "./giftOutreachPolicy";
import emailsRouter from "../routes/emails";

let server: Server | undefined;
beforeEach(() => {
  fake.state.tail = Promise.resolve();
  fake.state.send.mockReset().mockResolvedValue("provider-ack");
  fake.state.rows = {
    records: [{ id: 1, clientId: "client", prospectId: 2, campaignId: 3, status: "awaiting_gift", sentAt: null, updatedAt: new Date("2020-01-01") }],
    settings: [{ clientId: "client", settings: { ...DEFAULT_GIFT_SETTINGS, enabled: true, businessHoursStart: "00:00", businessHoursEnd: "23:59" } }],
    campaigns: [{ id: 3, clientId: "client", status: "active", callScript: JSON.stringify({ followUp2: { dayDelay: 3 } }) }],
    prospects: [{ id: 2, clientId: "client", status: "contacted", optedOut: false, email: "recipient@example.com", companyName: "Recipient", contactName: "Pat", unsubscribeToken: "unsubscribe", replyToken: "reply", scheduleToken: "schedule" }],
    users: [{ id: "client", outreachEmail: "sender@example.com", businessName: "Sender", businessAddress: "123 Main St" }],
    steps: [], enrollments: [], appointments: [], emails: [], activity: [], links: [],
  };
});
afterEach(async () => {
  vi.useRealTimers();
  if (server) await new Promise<void>((resolve, reject) => server!.close(err => err ? reject(err) : resolve()));
  server = undefined;
});
const input = (sequenceStep?: number) => ({ prospectId: 2, campaignId: 3, sequenceStep });
const mockSend = () => vi.fn(async (store: any, _idempotencyKey?: string) => {
  const [email] = await store.insert(fake.tables.emails).values({ clientId: "client", prospectId: 2, campaignId: 3, status: "sent" }).returning();
  return email;
});
describe("explicit manual sequence gift guard", () => {
  it("requires original 1–7 metadata and a campaign, never coerces display step8", () => {
    expect(manualSequenceStep(undefined)).toBeUndefined();
    expect(manualSequenceStep(3, 3)).toBe(3);
    expect(() => manualSequenceStep(8, 3)).toThrow("1–7");
    expect(() => manualSequenceStep(2)).toThrow("campaignId");
  });
  it("holds original followUp1 for a standalone record with no enrollment", async () => {
    const send = mockSend();
    await expect(guardedManualEmail("client", input(2), send)).rejects.toThrow("replaced");
    expect(send).not.toHaveBeenCalled();
  });
  it("allows independent one-offs even when a gift sequence is disabled/stopped", async () => {
    fake.state.rows.records[0].status = "stopped";
    fake.state.rows.settings[0].settings.enabled = false;
    const send = mockSend();
    await guardedManualEmail("client", input(), send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("does not apply gift sending windows to standard no-gift sequences", async () => {
    fake.state.rows.records = [];
    fake.state.rows.settings[0].settings.enabled = false;
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-08T03:00:00Z"));
    const send = mockSend();
    await guardedManualEmail("client", input(2), send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("blocks bypassing an Autopilot gift enrollment even without a record", async () => {
    fake.state.rows.records = [];
    fake.state.rows.enrollments = [{ clientId: "client", prospectId: 2, campaignId: 3, giftMode: true, status: "active" }];
    await expect(guardedManualEmail("client", input(2), mockSend())).rejects.toThrow("replaced");
    await expect(guardedManualEmail("client", input(3), mockSend())).rejects.toThrow("Autopilot");
  });
  it.each(["disabled", "stopped", "replied", "booked", "optedOut"])("holds remaining manual steps for %s", async reason => {
    fake.state.rows.records[0].status = "sent";
    if (reason === "disabled") fake.state.rows.settings[0].settings.enabled = false;
    if (reason === "stopped") fake.state.rows.records[0].status = "stopped";
    if (reason === "replied") fake.state.rows.emails = [{ clientId: "client", prospectId: 2, status: "replied" }];
    if (reason === "booked") fake.state.rows.appointments = [{ clientId: "client", prospectId: 2, status: "scheduled" }];
    if (reason === "optedOut") fake.state.rows.prospects[0].optedOut = true;
    const send = mockSend();
    await expect(guardedManualEmail("client", input(3), send)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("requires resolution, original delay and allowed sending window before remaining steps", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
    await expect(guardedManualEmail("client", input(3), mockSend())).rejects.toThrow("Resolve");
    fake.state.rows.records[0].status = "skipped";
    fake.state.rows.records[0].updatedAt = new Date();
    await expect(guardedManualEmail("client", input(3), mockSend())).rejects.toThrow("delay");
    fake.state.rows.records[0].updatedAt = new Date("2020-01-01");
    vi.setSystemTime(new Date("2026-03-14T15:00:00Z"));
    await expect(guardedManualEmail("client", input(3), mockSend())).rejects.toThrow("hours");
  });
  it("sends a completed standalone gift's next step once, returning the same email on repeat", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
    fake.state.rows.records[0].status = "sent";
    const send = mockSend();
    const settled = await Promise.allSettled([guardedManualEmail("client", input(3), send), guardedManualEmail("client", input(3), send)]);
    expect(settled.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const again = await guardedManualEmail("client", input(3), send);
    expect(again.id).toBe(fake.state.rows.emails[0].id);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1]).toMatch(/^gift-manual-\d+-original-step-3$/);
  });
  it("holds an uncertain provider outcome instead of risking a duplicate", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
    fake.state.rows.records[0].status = "skipped";
    const send = vi.fn().mockRejectedValue(new Error("Provider connection lost"));
    await expect(guardedManualEmail("client", input(3), send)).rejects.toThrow("connection");
    await expect(guardedManualEmail("client", input(3), send)).rejects.toThrow("uncertain");
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("real POST /emails handler with mocked provider", () => {
  async function post(body: object) {
    if (!server) {
      const app = express(); app.use(express.json()); app.use("/emails", emailsRouter);
      server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    }
    const address = server.address() as { port: number };
    return fetch(`http://127.0.0.1:${address.port}/emails`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  const body = { prospectId: 2, campaignId: 3, subject: "Question", body: "Hi Pat,\n\nWould a conversation help?" };
  it("recognizes explicit sequence metadata and refuses standalone legacy followUp1 before provider dispatch", async () => {
    const response = await post({ ...body, sequenceStep: 2 });
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain("replaced");
    expect(fake.state.send).not.toHaveBeenCalled();
    expect(fake.state.rows.emails).toHaveLength(0);
  });
  it("does not mistake a same-campaign one-off for a sequence; still uses actual provider acknowledgment", async () => {
    fake.state.rows.settings[0].settings.enabled = false;
    const response = await post(body);
    expect(response.status).toBe(201);
    expect(fake.state.send).toHaveBeenCalledOnce();
    expect(fake.state.rows.emails[0].resendId).toBe("provider-ack");
  });
  it("rejects cross-client campaigns before provider dispatch", async () => {
    fake.state.rows.campaigns[0].clientId = "another-client";
    const response = await post(body);
    expect(response.status).toBe(404);
    expect(fake.state.send).not.toHaveBeenCalled();
  });
});
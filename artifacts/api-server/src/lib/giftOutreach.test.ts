import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// In-memory transaction adapter: no real DB or provider/email calls in these tests.
const fake = vi.hoisted(() => {
  const state = { rows: {} as Record<string, any[]>, tail: Promise.resolve(), sends: vi.fn() };
  const chain = (run: () => any[]) => {
    const q: any = {
      where: () => q, limit: () => q, for: () => q, orderBy: () => q,
      returning: () => q, then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  };
  const db: any = {
    select: () => ({ from: (table: string) => chain(() => state.rows[table] || []) }),
    update: (table: string) => ({ set: (patch: any) => chain(() => {
      state.rows[table] = (state.rows[table] || []).map(r => ({ ...r, ...patch }));
      return state.rows[table];
    }) }),
    insert: (table: string) => ({ values: (input: any) => chain(() => {
      const rows = (Array.isArray(input) ? input : [input]).map((r, i) => ({ id: (state.rows[table]?.length || 0) + i + 1, ...r }));
      (state.rows[table] ||= []).push(...rows);
      return rows;
    }) }),
    execute: async () => {}, $count: () => 1,
    transaction: (fn: any) => {
      const result = state.tail.then(() => fn(db));
      state.tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return { state, db };
});
vi.mock("@workspace/db", () => ({
  db: fake.db, giftOutreachRecordsTable: "records", giftOutreachSettingsTable: "settings",
  prospectsTable: "prospects", campaignsTable: "campaigns", usersTable: "users",
  autopilotEnrollmentsTable: "enrollments", appointmentsTable: "appointments",
  emailsTable: "emails", emailLinksTable: "links", activityTable: "activity",
}));
vi.mock("drizzle-orm", () => ({ and: () => null, or: () => null, isNotNull: () => null, eq: () => null, inArray: () => null, lte: () => null, sql: () => null }));
vi.mock("./emailSender", () => ({ sendEmail: fake.state.sends }));
vi.mock("./giftVideoOutreach", () => ({ getGiftVideoEmailContent: vi.fn(), attachGiftVideoEmail: vi.fn(), getOwnedGiftVideo: vi.fn() }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import { sendGiftRecord, skipGiftRecord, updateGiftRecord } from "./giftOutreach";
import { DEFAULT_GIFT_SETTINGS } from "./giftOutreachPolicy";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T15:00:00Z"));
  fake.state.tail = Promise.resolve();
  fake.state.sends.mockReset().mockResolvedValue("resend-real-provider-ack");
  fake.state.rows = {
    settings: [{ settings: { ...DEFAULT_GIFT_SETTINGS, enabled: true } }],
    records: [{
      id: 1, clientId: "client", prospectId: 2, campaignId: 3, enrollmentId: null, enabledSnapshot: true,
      status: "ready", giftSent: true, giftName: "Tea", sentDate: "2026-03-02", expectedDeliveryDate: null,
      confirmedDeliveryDate: null, method: "email", complianceRisk: false, complianceNotes: "", giftNote: "",
      amountSpent: null, draftSubject: "Did the Tea arrive?", draftBody: "Hi Pat,\n\nDid the package arrive safely? Would you be open to a conversation?",
      revision: 1, approvedRevision: 1, approvedAt: new Date(), attempts: 0, sendPayload: null, firstAttemptAt: null, videoId: null,
    }],
    users: [{ id: "client", status: "active", businessAddress: "123 Main St", outreachEmail: "sender@example.com", businessName: "Sender" }],
    prospects: [{ id: 2, clientId: "client", companyName: "Prospect", contactName: "Pat", industry: "Manufacturing", email: "recipient@example.com", status: "contacted", optedOut: false, scheduleToken: "schedule", unsubscribeToken: "unsubscribe", replyToken: "reply" }],
    campaigns: [{ id: 3, clientId: "client" }], enrollments: [], appointments: [], emails: [], activity: [],
  };
});
afterEach(() => { vi.useRealTimers(); });
describe("gift send state machine (all provider calls mocked)", () => {
  it("one actual provider call and one email row for repeated and concurrent send requests", async () => {
    const [a, b] = await Promise.all([sendGiftRecord("client", 1), sendGiftRecord("client", 1)]);
    expect(a.status).toBe("sent");
    expect(b.emailId).toBe(a.emailId);
    await sendGiftRecord("client", 1);
    expect(fake.state.sends).toHaveBeenCalledTimes(1);
    expect(fake.state.rows.emails).toHaveLength(1);
    expect(fake.state.sends.mock.calls[0][0].idempotencyKey).toBe("gift-outreach-1-step3");
  });
  it("does not call provider before revision approval", async () => {
    fake.state.rows.records[0].approvedRevision = null;
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("Approve");
    expect(fake.state.sends).not.toHaveBeenCalled();
  });
  it("does not call provider for an unsent gift, reply, booking or opt-out", async () => {
    fake.state.rows.records[0].giftSent = false;
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("not due");
    fake.state.rows.records[0].giftSent = true;
    fake.state.rows.prospects[0].optedOut = true;
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("stopped");
    fake.state.rows.prospects[0].optedOut = false;
    fake.state.rows.enrollments = [{ status: "replied" }];
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("stopped");
    fake.state.rows.enrollments = [];
    fake.state.rows.appointments = [{ id: 4 }];
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("stopped");
    expect(fake.state.sends).not.toHaveBeenCalled();
  });
  it("explicit skip resolves the gift without an email", async () => {
    const r = await skipGiftRecord("client", 1);
    expect(r.status).toBe("skipped");
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("skipped");
    expect(fake.state.sends).not.toHaveBeenCalled();
  });
  it("editing a draft invalidates its approval", async () => {
    const r = await updateGiftRecord("client", 1, { draftBody: "A revised question." });
    expect(r.approvedAt).toBeNull();
    expect(r.revision).toBe(2);
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("Approve");
  });
  it("provider failure is not recorded sent; retries reuse the exact frozen payload and key", async () => {
    fake.state.rows.settings[0].settings.maxFollowUpAttempts = 2;
    fake.state.sends.mockRejectedValueOnce(new Error("Temporary provider timeout"));
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("Temporary provider timeout");
    expect(fake.state.rows.emails).toHaveLength(0);
    expect(fake.state.rows.records[0].status).toBe("error");
    await expect(updateGiftRecord("client", 1, { draftBody: "Changed" })).rejects.toThrow("locked");
    await sendGiftRecord("client", 1);
    expect(fake.state.sends.mock.calls[1][0]).toEqual(fake.state.sends.mock.calls[0][0]);
    expect(fake.state.rows.emails).toHaveLength(1);
  });
  it("blocks automatic compliance risk even in fully automatic mode", async () => {
    fake.state.rows.settings[0].settings.automationLevel = "auto";
    fake.state.rows.prospects[0].industry = "Healthcare";
    fake.state.rows.records[0].approvedAt = null;
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("Approve");
  });
  it("master disable pauses a snapshotted record", async () => {
    fake.state.rows.settings[0].settings.enabled = false;
    await expect(sendGiftRecord("client", 1)).rejects.toThrow("disabled");
    expect(fake.state.sends).not.toHaveBeenCalled();
  });
});
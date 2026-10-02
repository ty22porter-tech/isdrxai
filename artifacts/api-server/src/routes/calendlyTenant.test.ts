import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({ predicates: [] as any[], candidates: [] as any[] }));
vi.mock("@workspace/db", async (original) => {
  const actual = await original<any>();
  const database: any = {
    select: () => ({ from: () => ({ where: (predicate: any) => {
      state.predicates.push(predicate); return Promise.resolve(state.candidates);
    } }) }),
    update: () => ({ set: () => ({ where: (predicate: any) => {
      state.predicates.push(predicate); return { returning: async () => [] };
    } }) }),
    transaction: (fn: any) => fn(database),
  };
  return { ...actual, db: database };
});
vi.mock("../lib/engagementScoring", () => ({
  recordEngagementEvent: vi.fn(), cancelPendingAutomation: vi.fn(),
}));
import { processCalendlyBooking } from "./calendlyWebhook";
import { recordEngagementEvent } from "../lib/engagementScoring";

function response() {
  const res: any = { body: null, status: () => res, json: (body: any) => { res.body = body; return res; } };
  return res;
}
beforeEach(() => { state.predicates = []; state.candidates = []; vi.clearAllMocks(); });
describe("Calendly tenant isolation", () => {
  it("matches normalized email only inside the authenticated calendar owner's tenant", async () => {
    const res = response();
    await processCalendlyBooking({ event: "invitee.created", payload: {
      email: " SAME@EXAMPLE.COM ", uri: "invitee-test", scheduled_event: { start_time: "2026-12-01T10:00:00Z" },
    } }, res, "tenant-a");
    const query = new PgDialect().sqlToQuery(state.predicates[0]);
    expect(query.sql).toContain('"prospects"."client_id" =');
    expect(query.sql).toContain(" and ");
    expect(query.params).toEqual(["tenant-a", "same@example.com"]);
    expect(state.predicates).toHaveLength(1); // no global fallback
    expect(recordEngagementEvent).not.toHaveBeenCalled();
  });
  it("scopes cancellation updates by both tenant and invitee URI", async () => {
    const res = response();
    await processCalendlyBooking({ event: "invitee.canceled", payload: { uri: "invitee-test" } }, res, "tenant-b");
    const query = new PgDialect().sqlToQuery(state.predicates[0]);
    expect(query.sql).toContain('"appointments"."client_id" =');
    expect(query.params).toContain("tenant-b");
    expect(query.params).toContain("invitee-test");
    expect(res.body.matched).toBe(false);
  });
  it("does not guess between duplicate prospects or score either", async () => {
    state.candidates = [{ id: 1 }, { id: 2 }];
    const res = response();
    await processCalendlyBooking({ event: "invitee.created", payload: {
      email: "duplicate@example.com", uri: "invitee-test", scheduled_event: { start_time: "2026-12-01T10:00:00Z" },
    } }, res, "tenant-a");
    expect(res.body.matched).toBe(false);
    expect(recordEngagementEvent).not.toHaveBeenCalled();
    expect(state.predicates).toHaveLength(1);
  });
});
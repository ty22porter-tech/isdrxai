import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const state = vi.hoisted(() => ({
  rows: [] as any[], inserts: [] as any[], updates: [] as any[], deletes: [] as any[], locks: 0, selects: 0,
}));
vi.mock("@workspace/db", async original => {
  const actual = await original<any>();
  const database: any = {
    select: () => {
      state.selects++;
      return { from: () => ({ where: () => ({
        then: (resolve: any) => Promise.resolve(state.rows).then(resolve),
        for: () => { state.locks++; return Promise.resolve(state.rows); },
      }) }) };
    },
    insert: () => ({ values: (values: any) => {
      state.inserts.push(values);
      return { returning: async () => {
        const row = { id: 2, ...values };
        if (values.eventType === "visitor_session") state.rows = [row];
        return [row];
      }, onConflictDoNothing: async () => [] };
    } }),
    update: () => ({ set: (values: any) => ({ where: async () => { state.updates.push(values); } }) }),
    delete: () => ({ where: async (predicate: any) => { state.deletes.push(predicate); } }),
    transaction: (fn: any) => fn(database),
  };
  return { ...actual, db: database };
});
import { ActivityInput, activityCookieHash, grantActivityConsent, identifyActivityLead, recordVisitorActivity, revokeActivityConsent } from "./visitorActivity";
const token = "a".repeat(64);
const req = (cookie = `isdrx_activity=${token}`) => ({ headers: { cookie }, secure: true, get: () => undefined } as any);
const res = () => ({ cookie: vi.fn(), clearCookie: vi.fn() } as any);
const activity = { eventId: "7baefb41-8095-4c80-9b2b-bf3a470a3b8a", event: "page_view", page: "pricing" } as const;
beforeEach(() => {
  state.rows = []; state.inserts = []; state.updates = []; state.deletes = []; state.locks = 0; state.selects = 0;
});
describe("Private known-visitor activity", () => {
  it("accepts only fixed event/page values, never client identity or arbitrary URLs", () => {
    expect(ActivityInput.safeParse(activity).success).toBe(true);
    expect(ActivityInput.safeParse({ ...activity, userId: "somebody-else" }).success).toBe(false);
    expect(ActivityInput.safeParse({ ...activity, email: "test@example.com" }).success).toBe(false);
    expect(ActivityInput.safeParse({ ...activity, page: "/prospects/123?email=private" }).success).toBe(false);
  });
  it("does not record or identify without a valid consent cookie", async () => {
    await recordVisitorActivity(req(""), res(), "user-a", activity);
    await identifyActivityLead(req(""), { name: "Test", email: "test@example.com", company: "Example" }, "contact");
    expect(state.selects).toBe(0);
    expect(state.inserts).toEqual([]);
  });
  it("cannot manufacture consent by sending an unknown cookie", async () => {
    await recordVisitorActivity(req(), res(), null, activity);
    expect(state.inserts).toEqual([]);
  });
  it("stores a hash rather than the bearer cookie and sets HttpOnly consent", async () => {
    const response = res();
    await grantActivityConsent(req(""), response, null);
    const cookie = response.cookie.mock.calls[0];
    expect(cookie[2]).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    expect(state.inserts[0].visitorId).not.toBe(cookie[1]);
    expect(activityCookieHash(req(`isdrx_activity=${cookie[1]}`))).toBe(state.inserts[0].visitorId);
  });
  it("records the server-authenticated identity and uses a session-scoped idempotency key", async () => {
    state.rows = [{ id: 1, userId: null, metadata: {} }];
    await recordVisitorActivity(req(), res(), "authenticated-user", activity);
    expect(state.updates[0].userId).toBe("authenticated-user");
    expect(state.inserts[0]).toMatchObject({ userId: "authenticated-user", intent: "page_view", location: "pricing" });
    expect(state.inserts[0].sourceKey).toBe(`visitor-event:${activityCookieHash(req())}:${activity.eventId}`);
    expect(state.locks).toBe(1);
  });
  it("rotates instead of attaching another account's actions to the old identity", async () => {
    state.rows = [{ id: 1, userId: "previous-user", metadata: {} }];
    const response = res();
    await recordVisitorActivity(req(), response, "new-user", activity);
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]).toMatchObject({ eventType: "visitor_session", userId: "new-user" });
    expect(state.inserts[1]).toMatchObject({ eventType: "visitor_activity", userId: "new-user" });
    expect(response.cookie).toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });
  it("labels submitted details as self-reported and does not overwrite a signed-in account", async () => {
    state.rows = [{ id: 1, userId: null, metadata: {} }];
    await identifyActivityLead(req(), { name: "Test Lead", email: "LEAD@example.com", company: "Example" }, "book_demo");
    expect(state.updates[0].metadata).toMatchObject({ email: "lead@example.com", identitySource: "form_submission" });
    state.updates = []; state.rows[0].userId = "user-a";
    await identifyActivityLead(req(), { name: "Other", email: "other@example.com", company: "Other" }, "contact");
    expect(state.updates).toEqual([]);
  });
  it("honors browser Global Privacy Control for form attribution", async () => {
    const request = req(); request.get = () => "1";
    await identifyActivityLead(request, { name: "Test", email: "test@example.com", company: "" }, "contact");
    expect(state.selects).toBe(0);
  });
  it("locks and deletes only this session's private analytics, not business conversions", async () => {
    const response = res();
    await revokeActivityConsent(req(), response);
    expect(state.locks).toBe(1);
    const query = new PgDialect().sqlToQuery(state.deletes[0]);
    expect(query.params).toEqual([activityCookieHash(req()), "visitor_session", "visitor_activity"]);
    expect(response.clearCookie).toHaveBeenCalled();
  });
});
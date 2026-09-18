import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selects: [] as unknown[][], inserted: [] as Record<string, unknown>[], executes: [] as unknown[],
}));
function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit", "groupBy"]) q[method] = () => q;
  q.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return q;
}
vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: (_t, key) => String(key) });
  const tx = {
    select: () => chain(state.selects.shift() ?? []),
    execute: async (value: unknown) => { state.executes.push(value); },
    insert: () => ({ values: async (v: Record<string, unknown>) => { state.inserted.push(v); } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  return {
    db: {
      select: () => chain(state.selects.shift() ?? []),
      transaction: async (fn: (store: typeof tx) => unknown) => fn(tx),
    },
    prospectsTable: table, usersTable: table, scoreEventsTable: table, automationRunsTable: table,
    notificationsTable: table, emailsTable: table, giftVideosTable: table, giftVideoEventsTable: table,
  };
});
vi.mock("./emailSender", () => ({ sendEmail: vi.fn() }));
vi.mock("./callerQueue", () => ({ enqueueHotProspect: vi.fn() }));
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));
import { recordEngagementEvent, interestLevelForScore, DEFAULT_ENGAGEMENT_SETTINGS } from "./engagementScoring";
import { logger } from "./logger";

const prospect = { id: 3, clientId: "tenant", engagementScore: 0, interestLevel: "low" };
const client = { id: "tenant", engagementSettings: null };
const video = { id: 9, emailId: 7, clientId: "tenant", prospectId: 3 };
describe("gift video ledger scoring", () => {
  beforeEach(() => { state.selects = []; state.inserted = []; state.executes = []; vi.clearAllMocks(); });
  it("keeps configured Hot thresholds separate from verified booking facts", () => {
    expect(interestLevelForScore(15, DEFAULT_ENGAGEMENT_SETTINGS)).toBe("hot");
    expect(interestLevelForScore(15, { ...DEFAULT_ENGAGEMENT_SETTINGS, hotMin: 30 })).toBe("medium");
  });
  it("awards +10 with source proof and does not award it on repeat", async () => {
    state.selects = [[prospect], [client], [video], [{ id: 1 }], [], [], [{ total: 10 }]];
    await recordEngagementEvent(3, "gift_video_click", { emailId: 7, videoId: 9 });
    expect(logger.error).not.toHaveBeenCalled();
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].points).toBe(10);
    expect(state.executes.length).toBeGreaterThanOrEqual(1);
    state.selects = [[prospect], [client], [video], [{ id: 1 }], [{ id: 2 }]];
    await recordEngagementEvent(3, "gift_video_click", { emailId: 7, videoId: 9 });
    expect(state.inserted).toHaveLength(1);
  });
  it("rejects a milestone without a valid authoritative tracking event", async () => {
    state.selects = [[prospect], [client], [video], []];
    await recordEngagementEvent(3, "gift_video_complete", { emailId: 7, videoId: 9 });
    expect(state.inserted).toHaveLength(0);
  });
  it("rejects mismatched video ownership and prevents generic double-scoring", async () => {
    state.selects = [[prospect], [client], [video]];
    await recordEngagementEvent(3, "gift_video_click", { emailId: 7, videoId: 10 });
    state.selects = [[prospect], [client], [video]];
    await recordEngagementEvent(3, "link_click", { emailId: 7 });
    state.selects = [[prospect], [client], [video]];
    await recordEngagementEvent(3, "calendly_click", { emailId: 7 });
    expect(state.inserted).toHaveLength(0);
  });
  it("caps gift email open score at two one-point ledger rows", async () => {
    state.selects = [[prospect], [client], [video], [], [], [{ total: 1 }]];
    await recordEngagementEvent(3, "open", { emailId: 7 });
    state.selects = [[prospect], [client], [video], [{ id: 1 }], [{ eventType: "open", n: 1 }], [{ total: 2 }]];
    await recordEngagementEvent(3, "open", { emailId: 7 });
    state.selects = [[prospect], [client], [video], [{ id: 1 }, { id: 2 }]];
    await recordEngagementEvent(3, "open", { emailId: 7 });
    expect(logger.error).not.toHaveBeenCalled();
    expect(state.inserted.map(v => v.points)).toEqual([1, 1]);
  });
});
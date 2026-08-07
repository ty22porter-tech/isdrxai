import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression tests for bot-click filtering in the tracked-link redirect
 * (GET /api/t/l/:token/:slug). These lock in the three heuristics —
 * scanner user-agents, the <15s post-send prefetch window, and the 10s
 * different-link click-burst check — so a future refactor can't silently
 * let robot clicks score points or fire hot-lead alerts again.
 *
 * The DB is replaced with a configurable in-memory fake that records every
 * insert/update, letting the tests assert exactly which side effects a bot
 * vs. human click produces.
 */

// --- Table sentinels + fake db (hoisted so the vi.mock factory can use them) ---
interface FakeState {
  email: any;
  link: any;
  burstRows: any[];
  /** rowCount returned by the raw inferred-open UPDATE ... RETURNING. */
  inferredUpdateRowCount: number;
  inserts: { table: any; values: any }[];
  updates: { table: any; values: any }[];
  executes: any[];
}

const { state, db, emailsTable, emailOpenEventsTable, emailLinksTable, linkClickEventsTable } = vi.hoisted(() => {
  const emailsTable = { name: "emails", totalOpens: "total_opens", validOpens: "valid_opens" } as any;
  const emailOpenEventsTable = { name: "email_open_events", id: "id", emailId: "email_id", ip: "ip", userAgent: "user_agent", openedAt: "opened_at" } as any;
  const emailLinksTable = { name: "email_links", emailId: "email_id", slug: "slug", clickCount: "click_count", downloadCount: "download_count" } as any;
  const linkClickEventsTable = { name: "link_click_events", id: "id", emailId: "email_id", linkId: "link_id", clickedAt: "clicked_at" } as any;

  const state = {} as FakeState;

  function resultForTable(table: any): any[] {
    if (table === emailsTable) return state.email ? [state.email] : [];
    if (table === emailLinksTable) return state.link ? [state.link] : [];
    if (table === linkClickEventsTable) return state.burstRows;
    return [];
  }

  function selectChain() {
    let table: any;
    const chain: any = {
      from(t: any) { table = t; return chain; },
      where() { return chain; },
      limit() { return chain; },
      then(onOk: any, onErr: any) { return Promise.resolve(resultForTable(table)).then(onOk, onErr); },
    };
    return chain;
  }

  const db = {
    select: () => selectChain(),
    insert: (table: any) => ({
      values: (values: any) => {
        state.inserts.push({ table, values });
        return Promise.resolve([]);
      },
    }),
    update: (table: any) => ({
      set: (values: any) => ({
        where: () => {
          state.updates.push({ table, values });
          return Promise.resolve();
        },
      }),
    }),
    execute: (query: any) => {
      state.executes.push(query);
      return Promise.resolve({ rowCount: state.inferredUpdateRowCount });
    },
    transaction: async (fn: any) => fn(db),
  };

  return { state, db, emailsTable, emailOpenEventsTable, emailLinksTable, linkClickEventsTable };
});

vi.mock("@workspace/db", () => ({
  db,
  emailsTable,
  emailOpenEventsTable,
  emailLinksTable,
  linkClickEventsTable,
}));
// The route only uses these to build query fragments the fake db ignores.
vi.mock("drizzle-orm", () => ({
  eq: (...args: any[]) => ({ op: "eq", args }),
  and: (...args: any[]) => ({ op: "and", args }),
  gte: (...args: any[]) => ({ op: "gte", args }),
  sql: Object.assign((strings: TemplateStringsArray, ...vals: any[]) => ({ sql: strings.join("?"), vals }), {}),
}));
vi.mock("../lib/publicUrl", () => ({ getPublicAppUrl: () => "https://app.example.com" }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/engagementScoring", () => ({ recordEngagementEvent: vi.fn().mockResolvedValue(undefined) }));

import trackingRouter from "./tracking";
import { recordEngagementEvent } from "../lib/engagementScoring";

// Extract the GET /l/:token/:slug handler from the router.
const linkLayer = (trackingRouter as any).stack.find((l: any) => l.route?.path === "/l/:token/:slug");
const linkHandler: (req: any, res: any) => Promise<void> = linkLayer.route.stack[0].handle;

// --- Request/response helpers -------------------------------------------------
let ipCounter = 0;
function makeReq(userAgent: string, query: Record<string, string> = {}) {
  return {
    params: { token: "tok123", slug: "cta-1" },
    query,
    // Unique IP per request keeps the module-level rate limiter out of the way.
    headers: { "user-agent": userAgent, "x-forwarded-for": `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}` },
    socket: {},
  } as any;
}
function makeRes() {
  return {
    redirectedTo: undefined as string | undefined,
    headersSent: false,
    redirect(url: string) { this.redirectedTo = url; this.headersSent = true; },
  } as any;
}

/** The click side effects run in a floating promise chain after the redirect — flush it. */
async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}

const HUMAN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const MINUTES = 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    email: {
      id: 42,
      clientId: "client-1",
      prospectId: 7,
      campaignId: 3,
      trackingToken: "tok123",
      sentAt: new Date(Date.now() - 60 * MINUTES), // well past the prefetch window by default
      openedAt: null,
      validOpens: 0,
    },
    link: { id: 9, emailId: 42, slug: "cta-1", kind: "cta", name: "Book a call", destination: "https://calendly.com/rep/15min" },
    burstRows: [],
    inferredUpdateRowCount: 1,
    inserts: [],
    updates: [],
    executes: [],
  } satisfies FakeState);
});

function clickEvents() { return state.inserts.filter((i) => i.table === linkClickEventsTable); }
function inferredOpenInserts() { return state.inserts.filter((i) => i.table === emailOpenEventsTable); }
function linkCounterUpdates() { return state.updates.filter((u) => u.table === emailLinksTable); }

async function runClick(userAgent: string) {
  const res = makeRes();
  await linkHandler(makeReq(userAgent), res);
  await flush();
  return res;
}

function expectBotOnlyRecorded(reason: string) {
  // Recorded for visibility…
  const events = clickEvents();
  expect(events).toHaveLength(1);
  expect(events[0].values.isBot).toBe(true);
  expect(events[0].values.botReason).toBe(reason);
  // …but with ZERO scoring side effects:
  expect(recordEngagementEvent).not.toHaveBeenCalled(); // no score_events
  expect(linkCounterUpdates()).toHaveLength(0); // no clickCount bump
  expect(inferredOpenInserts()).toHaveLength(0); // no inferred open
  expect(state.executes).toHaveLength(0); // inferred-open UPDATE never runs
}

describe("tracked link redirect bot filtering (GET /l/:token/:slug)", () => {
  it("always redirects to the stored destination, bot or not", async () => {
    const res = await runClick("Mozilla/5.0 (compatible; Barracuda Sentinel)");
    expect(res.redirectedTo).toBe("https://calendly.com/rep/15min");
  });

  it("flags scanner user-agents and produces no score, no clickCount bump, no inferred open", async () => {
    await runClick("Mozilla/5.0 (compatible; Barracuda Sentinel; https://barracuda.com)");
    expectBotOnlyRecorded("security-scanner");
  });

  it("flags generic bots/http clients too", async () => {
    await runClick("python-requests/2.31.0");
    expectBotOnlyRecorded("http-client");
  });

  it("flags a missing user-agent", async () => {
    await runClick("");
    expectBotOnlyRecorded("no-user-agent");
  });

  it("flags a human-looking click within 15s of send as prefetch-window", async () => {
    state.email.sentAt = new Date(Date.now() - 5 * 1000); // 5s after send
    await runClick(HUMAN_UA);
    expectBotOnlyRecorded("prefetch-window");
  });

  it("does NOT flag a human-looking click just after the 15s prefetch window", async () => {
    state.email.sentAt = new Date(Date.now() - 20 * 1000);
    await runClick(HUMAN_UA);
    const events = clickEvents();
    expect(events).toHaveLength(1);
    expect(events[0].values.isBot).toBe(false);
  });

  it("flags a second distinct link clicked within 10s as click-burst", async () => {
    state.burstRows = [{ id: 555 }]; // a DIFFERENT link of this email was clicked seconds ago
    await runClick(HUMAN_UA);
    expectBotOnlyRecorded("click-burst");
  });

  it("scores a normal human click and creates ONE inferred open when the pixel never fired", async () => {
    await runClick(HUMAN_UA);

    // Click event recorded as human.
    const events = clickEvents();
    expect(events).toHaveLength(1);
    expect(events[0].values).toMatchObject({ isBot: false, botReason: null, emailId: 42, prospectId: 7, eventType: "click" });

    // clickCount bumped on the link.
    const updates = linkCounterUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toHaveProperty("clickCount");

    // Inferred open: conditional UPDATE ran and matched → open event + open scoring.
    expect(state.executes).toHaveLength(1);
    const opens = inferredOpenInserts();
    expect(opens).toHaveLength(1);
    expect(opens[0].values).toMatchObject({ isBot: false, isValid: true, inferredFromClick: true });

    // Scoring: one "open" (inferred) + one "calendly_click" for the cta link.
    const calls = (recordEngagementEvent as any).mock.calls;
    expect(calls.map((c: any) => c[1]).sort()).toEqual(["calendly_click", "open"]);
    for (const c of calls) expect(c[0]).toBe(7); // prospectId
  });

  it("skips the inferred open (but still scores the click) when the email already has valid opens", async () => {
    state.email.validOpens = 2;
    state.inferredUpdateRowCount = 0; // WHERE valid_opens = 0 matches nothing
    await runClick(HUMAN_UA);

    expect(inferredOpenInserts()).toHaveLength(0);
    const calls = (recordEngagementEvent as any).mock.calls;
    expect(calls.map((c: any) => c[1])).toEqual(["calendly_click"]);
  });

  it("scores non-cta links as plain link_click", async () => {
    state.link.kind = "website";
    state.inferredUpdateRowCount = 0;
    state.email.validOpens = 1;
    await runClick(HUMAN_UA);
    const calls = (recordEngagementEvent as any).mock.calls;
    expect(calls.map((c: any) => c[1])).toEqual(["link_click"]);
  });
});

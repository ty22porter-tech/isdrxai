import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const fixture = vi.hoisted(() => ({ row: null as any }));
vi.mock("@workspace/db", async original => {
  const actual = await original<any>();
  const matches = (predicate: any) => {
    const { params } = new PgDialect().sqlToQuery(predicate);
    return fixture.row?.clientId === params[0] && fixture.row?.stateHash === params[1];
  };
  return { ...actual, db: {
    update: () => ({ set: (values: any) => ({ where: (predicate: any) => ({ returning: async () => {
      if (!matches(predicate) || !fixture.row.stateExpiresAt || fixture.row.stateExpiresAt <= new Date()) return [];
      fixture.row = { ...fixture.row, ...values };
      return [{ ...fixture.row }];
    } }) }) }),
    select: () => ({ from: () => ({ where: (predicate: any) => ({ limit: async () =>
      matches(predicate) && fixture.row.stateExpiresAt === null ? [{ clientId: fixture.row.clientId }] : [],
    }) }) }),
  } };
});
import { consumeCalendlyState } from "./calendlyState";
import { hash, CalendlyApiError } from "./calendlyOAuth";
const state = "a".repeat(43);
beforeEach(() => {
  fixture.row = { clientId: "tenant-a", stateHash: hash(state), verifier: "encrypted-test-verifier",
    stateExpiresAt: new Date(Date.now() + 600000) };
});
describe("Calendly callback state receipts", () => {
  it("claims once and treats the same authenticated callback as a navigation-only duplicate", async () => {
    expect(await consumeCalendlyState("tenant-a", state)).toEqual({ kind: "claimed", verifier: "encrypted-test-verifier" });
    expect(await consumeCalendlyState("tenant-a", state)).toEqual({ kind: "duplicate" });
  });
  it("only lets one concurrent callback claim the code exchange", async () => {
    const outcomes = await Promise.all([consumeCalendlyState("tenant-a", state), consumeCalendlyState("tenant-a", state)]);
    expect(outcomes.map(o => o.kind).sort()).toEqual(["claimed", "duplicate"]);
  });
  it("rejects another tenant even after state has been consumed", async () => {
    await consumeCalendlyState("tenant-a", state);
    expect(await consumeCalendlyState("tenant-b", state)).toEqual({ kind: "invalid" });
  });
  it("rejects expired but unconsumed state", async () => {
    fixture.row.stateExpiresAt = new Date(Date.now() - 1000);
    expect(await consumeCalendlyState("tenant-a", state)).toEqual({ kind: "invalid" });
  });
  it("rejects missing, malformed and superseded state", async () => {
    for (const input of [undefined, "", ["a"], "b".repeat(43)]) {
      expect(await consumeCalendlyState("tenant-a", input)).toEqual({ kind: "invalid" });
    }
  });
});
describe("Safe Calendly setup errors", () => {
  it("distinguishes permission, plan, and rate-limit failures", () => {
    expect(new CalendlyApiError(403, { title: "Insufficient scope" }).message).toContain("permissions are missing");
    expect(new CalendlyApiError(403, { message: "Please upgrade your Calendly account to Standard" }).message).toContain("plan");
    expect(new CalendlyApiError(429, {}).message).toContain("rate limit");
  });
  it("never displays arbitrary provider response text", () => {
    expect(new CalendlyApiError(400, { message: "sensitive-test-payload" }).message).not.toContain("sensitive-test-payload");
  });
});
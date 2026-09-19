import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  usersTable: {},
  prospectsTable: {},
}));
vi.mock("../lib/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/apollo", () => ({ enrichPerson: vi.fn() }));
vi.mock("../lib/sellerResearch", () => ({
  ensureCurrentSellerResearch: vi.fn(async (_id, client) => client),
}));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../lib/companyDemographicResearch", () => ({ researchCompanyDemographics: vi.fn() }));

import router from "./ai";
import { db } from "@workspace/db";
import { enrichPerson } from "../lib/apollo";

const handler = (router as any).stack.find((layer: any) => layer.route?.path === "/enrich-leads").route.stack.at(-1).handle;
const leads = (count: number) => Array.from({ length: count }, (_, index) => ({
  companyName: `Synthetic Business ${index}`,
  email: `contact${index}@example.invalid`,
}));
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: async () => [{ id: "synthetic-client", vertical: "janitorial" }] }),
  } as any);
});

describe("contact enrichment batch limits", () => {
  it.each([21, 100])("enriches all %i search results without exceeding five concurrent Apollo calls", async count => {
    let active = 0;
    let peak = 0;
    vi.mocked(enrichPerson).mockImplementation(async input => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return { ok: true, person: { contactName: input.companyName, email: "verified@example.com", employeeCount: 10 } } as any;
    });
    const res = response();
    await handler({ body: { leads: leads(count) }, clientId: "synthetic-client" }, res);
    expect(enrichPerson).toHaveBeenCalledTimes(count);
    expect(peak).toBeLessThanOrEqual(5);
    expect(res.status).not.toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.results).toHaveLength(count);
    expect(result.results.map((item: any) => item.index)).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(result.results.every((item: any) => item.status === "enriched")).toBe(true);
  });

  it.each([0, 101])("rejects %i leads with 400 before querying the database or Apollo", async count => {
    const res = response();
    await handler({ body: { leads: leads(count) }, clientId: "synthetic-client" }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.select).not.toHaveBeenCalled();
    expect(enrichPerson).not.toHaveBeenCalled();
  });
});
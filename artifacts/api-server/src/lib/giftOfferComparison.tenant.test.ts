import { describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const prospectsTable = {
    id: "prospect.id",
    clientId: "prospect.clientId",
    giftSuggestions: "prospect.giftSuggestions",
  };
  const row = {
    id: 7,
    clientId: "tenant-a",
    giftSuggestions: {
      budgetUsd: 25,
      generatedAt: "2025-01-01T00:00:00.000Z",
      ideas: [{
        name: "Desk notebook",
        description: "Notebook",
        estimatedPriceMinUsd: 10,
        estimatedPriceMaxUsd: 20,
        whyFit: "Useful",
      }],
    },
  };
  const db: any = {
    select: () => ({
      from: () => ({
        where: (clauses: Array<[string, unknown]>) => Promise.resolve(
          clauses.some(([column, value]) => column === prospectsTable.clientId && value === row.clientId)
            ? [{ giftSuggestions: row.giftSuggestions }] : [],
        ),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    }),
  };
  return { db, prospectsTable };
});

vi.mock("@workspace/db", () => ({
  db: fake.db,
  prospectsTable: fake.prospectsTable,
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => [column, value],
  and: (...clauses: unknown[]) => clauses,
  sql: () => ({ mockedSql: true }),
}));
vi.mock("./giftOutreach", () => ({
  GiftOutreachError: class GiftOutreachError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));

import { compareGiftSuggestionOffers } from "./giftOfferComparison";

describe("gift offer tenant isolation", () => {
  it("does not reveal or research another tenant's persisted gift idea", async () => {
    const researcher = vi.fn();
    await expect(compareGiftSuggestionOffers("tenant-b", 7, 0, researcher))
      .rejects.toMatchObject({ status: 404 });
    expect(researcher).not.toHaveBeenCalled();
  });

  it("returns a refresh conflict instead of overwriting when the optimistic update no longer matches", async () => {
    const researcher = vi.fn().mockResolvedValue({
      output_text: "{\"offers\":[]}",
      output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }],
    });
    await expect(compareGiftSuggestionOffers("tenant-a", 7, 0, researcher))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining("Refresh") });
    expect(researcher).toHaveBeenCalledOnce();
  });
});
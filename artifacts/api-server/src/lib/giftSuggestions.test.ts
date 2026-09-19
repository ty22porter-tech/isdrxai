import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => {
  const prospectsTable = { id: "prospect.id", clientId: "prospect.clientId", giftSuggestions: "prospect.giftSuggestions" };
  const usersTable = { id: "user.id" };
  const state = {
    prospects: [] as any[],
    users: [] as any[],
    updated: null as any,
  };
  const query = (rows: () => any[]) => {
    const chain: any = {
      where: () => chain,
      returning: () => chain,
      then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(rows()).then(resolve, reject),
    };
    return chain;
  };
  const db: any = {
    select: (shape?: object) => ({
      from: (table: object) => query(() => {
        const rows = table === prospectsTable ? state.prospects : state.users;
        return shape ? rows.map(row => ({ giftSuggestions: row.giftSuggestions ?? null })) : rows;
      }),
    }),
    update: () => ({
      set: (patch: object) => {
        state.updated = patch;
        return { where: () => ({ returning: () => query(() => state.prospects.length ? [{ id: state.prospects[0].id }] : []) }) };
      },
    }),
  };
  return { state, db, prospectsTable, usersTable };
});

vi.mock("@workspace/db", () => ({
  db: fake.db,
  prospectsTable: fake.prospectsTable,
  usersTable: fake.usersTable,
}));
vi.mock("drizzle-orm", () => ({ and: (...values: unknown[]) => values, eq: (...values: unknown[]) => values }));
vi.mock("./giftOutreach", () => ({
  GiftOutreachError: class GiftOutreachError extends Error {
    constructor(message: string, public status = 409) { super(message); }
  },
}));

import { generateGiftSuggestions, validateGiftSuggestionOutput } from "./giftSuggestions";

const validOutput = JSON.stringify({
  ideas: [
    { name: "Desk organizer", description: "A compact office organizer.", estimatedPriceMinUsd: 12, estimatedPriceMaxUsd: 20, whyFit: "Neutral utility for a professional desk." },
    { name: "Reusable notebook", description: "A reusable notebook for work notes.", estimatedPriceMinUsd: 15, estimatedPriceMaxUsd: 25, whyFit: "Useful for meetings and planning." },
    { name: "Team snack box", description: "A modest shareable office snack box.", estimatedPriceMinUsd: 18, estimatedPriceMaxUsd: 25, whyFit: "A team-oriented option for the office." },
  ],
});

beforeEach(() => {
  fake.state.prospects = [{
    id: 7,
    clientId: "tenant-a",
    companyName: "Acme",
    industry: "Manufacturing",
    title: "Operations Director",
    city: "Columbus",
    state: "OH",
    opportunityIntelligence: null,
  }];
  fake.state.users = [{ id: "tenant-a", businessName: "Seller Co", vertical: "janitorial" }];
  fake.state.updated = null;
});

describe("prospect gift suggestions", () => {
  it("rejects an out-of-range budget before calling the provider", async () => {
    const provider = vi.fn();
    await expect(generateGiftSuggestions("tenant-a", 7, 101, provider)).rejects.toMatchObject({ status: 400 });
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not generate for a prospect outside the tenant scope", async () => {
    fake.state.prospects = [];
    const provider = vi.fn();
    await expect(generateGiftSuggestions("tenant-b", 7, 25, provider)).rejects.toMatchObject({ status: 404 });
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns a safe provider error and does not persist", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("secret upstream details"));
    await expect(generateGiftSuggestions("tenant-a", 7, 25, provider)).rejects.toMatchObject({
      status: 502,
      message: "Gift suggestion generation is temporarily unavailable. Please try again.",
    });
    expect(fake.state.updated).toBeNull();
  });

  it("rejects malformed, over-budget, URL, and prohibited provider output", () => {
    expect(() => validateGiftSuggestionOutput("not json", 25)).toThrow("invalid gift suggestions");
    expect(() => validateGiftSuggestionOutput(validOutput.replace('"estimatedPriceMaxUsd":20', '"estimatedPriceMaxUsd":30'), 25)).toThrow("budget or gift policy");
    expect(() => validateGiftSuggestionOutput(validOutput.replace("Desk organizer", "Wine from example.com"), 25)).toThrow("budget or gift policy");
  });

  it("persists only validated ideas without changing any gift record or send state", async () => {
    const result = await generateGiftSuggestions("tenant-a", 7, 25, vi.fn().mockResolvedValue(validOutput));
    expect(result).toMatchObject({ budgetUsd: 25, ideas: expect.arrayContaining([expect.objectContaining({ name: "Desk organizer" })]) });
    expect(fake.state.updated).toEqual({ giftSuggestions: result });
  });
});
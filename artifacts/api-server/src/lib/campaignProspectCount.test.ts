import { beforeAll, describe, expect, it } from "vitest";

// Opt-in PostgreSQL integration tests. Only session-local temporary tables are
// written; real application records are never read or changed.
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")("campaign prospect counts", () => {
  let counts: Map<number, number>;

  beforeAll(async () => {
    const { db, campaignsTable } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    const { campaignProspectCount } = await import("./campaignProspectCount");
    counts = await db.transaction(async (tx) => {
      // These names shadow the permanent tables only on this transaction's
      // connection, and are dropped automatically on commit or rollback.
      await tx.execute(sql`
        create temporary table campaigns (
          id int, client_id text, prospect_count int
        ) on commit drop;
        create temporary table emails (
          client_id text, campaign_id int, prospect_id int
        ) on commit drop;
        create temporary table autopilot_enrollments (
          client_id text, campaign_id int, prospect_id int, status text
        ) on commit drop;
        create temporary table call_tasks (
          client_id text, campaign_id int, prospect_id int, status text
        ) on commit drop;
        insert into campaigns values
          (1, 'tenant-a', 0), (2, 'tenant-a', 999),
          (3, 'tenant-a', 0), (4, 'tenant-a', 0), (5, 'tenant-b', 0);
        insert into emails values
          ('tenant-a', 1, 10), ('tenant-a', 1, 10), ('tenant-a', 1, 11),
          ('tenant-a', null, 99), ('tenant-b', 1, 90);
        insert into autopilot_enrollments values
          ('tenant-a', 1, 10, 'completed'), ('tenant-a', 1, 12, 'paused'),
          ('tenant-a', 3, 10, 'active'), ('tenant-a', 3, 13, 'completed'),
          ('tenant-b', 1, 91, 'active');
        insert into call_tasks values
          ('tenant-a', 1, 10, 'completed'), ('tenant-a', 1, 14, 'queued'),
          ('tenant-a', 1, 14, 'completed'), ('tenant-a', 4, 15, 'suppressed'),
          ('tenant-b', 1, 92, 'queued');
      `);
      const rows = await tx.select({
        id: campaignsTable.id,
        prospectCount: campaignProspectCount("tenant-a"),
      }).from(campaignsTable).where(eq(campaignsTable.clientId, "tenant-a"));
      return new Map(rows.map((row) => [row.id, row.prospectCount]));
    });
  }, 15_000);

  it("deduplicates repeated emails, tasks, and overlapping sources", () => {
    expect(counts.get(1)).toBe(4);
  });

  it("returns zero for an empty campaign even with a stale saved counter", () => {
    expect(counts.get(2)).toBe(0);
  });

  it("includes unsent and completed enrollments independently per campaign", () => {
    expect(counts.get(3)).toBe(2);
  });

  it("includes call-only prospects, including inactive tasks", () => {
    expect(counts.get(4)).toBe(1);
  });

  it("excludes other tenants' campaigns and source records", () => {
    expect(counts.has(5)).toBe(false);
    expect(counts.get(1)).toBe(4);
  });
});
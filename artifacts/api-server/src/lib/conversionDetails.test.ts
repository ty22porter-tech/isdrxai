import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const execute = vi.hoisted(() => vi.fn());
vi.mock("@workspace/db", () => ({ db: { execute } }));
import { calendarClickCte, ConversionDetailQuery, getCalendarCounts, getConversionDetails } from "./conversionDetails";
const dialect = new PgDialect();
beforeEach(() => execute.mockReset().mockResolvedValue({ rows: [{ rows: [], total: 0, errors: 0, unbooked: 0 }] }));
describe("Conversion drill-down evidence", () => {
  it("rejects unsupported metrics, invalid dates and unbounded pagination", () => {
    for (const input of [
      { metric: "user_email" }, { metric: "accounts", days: 0 },
      { metric: "accounts", offset: -1 }, { metric: "accounts", offset: 100001 },
    ]) expect(ConversionDetailQuery.safeParse(input).success).toBe(false);
    expect(ConversionDetailQuery.parse({ metric: "accounts" })).toEqual({ metric: "accounts", days: 30, offset: 0 });
  });
  it("excludes bots and matches confirmed bookings only to the same tenant and prospect after the click", () => {
    const query = dialect.sqlToQuery(calendarClickCte(new Date()));
    expect(query.sql).toContain("c.is_bot = false");
    expect(query.sql).toContain("a.client_id = c.client_id");
    expect(query.sql).toContain("a.prospect_id = c.prospect_id");
    expect(query.sql).toContain("a.created_at >= c.at");
    expect(query.sql).toContain("a.calendly_invitee_uri IS NOT NULL");
  });
  it("uses the same calendar cohort in count and details", async () => {
    await getCalendarCounts(new Date());
    await getConversionDetails({ metric: "calendar_unbooked", days: 30, offset: 0 });
    for (const call of execute.mock.calls) {
      expect(dialect.sqlToQuery(call[0]).sql).toContain("FROM unbooked");
    }
  });
  it("returns bounded pages and never supplies tokens, IPs or session hashes in detail rows", async () => {
    const result = await getConversionDetails({ metric: "book_demo", days: 30, offset: 50 });
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("LIMIT 50 OFFSET");
    expect(query.params).toContain(50);
    expect(query.params).toContain("book_demo");
    expect(query.sql).toContain("ELSE 'anonymous'");
    expect(query.sql).not.toContain("SELECT e.*");
    expect(result).toEqual({ rows: [], total: 0, offset: 50, limit: 50 });
  });
  it("keeps new-customer sales separate from renewals", async () => {
    await getConversionDetails({ metric: "paid_sale", days: 30, offset: 0 });
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).sql).toContain("e.intent = 'new_customer'");
  });
  it("never labels a calendar recipient or owner as a verified clicker", async () => {
    await getConversionDetails({ metric: "calendar_errors", days: 30, offset: 0 });
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]).sql;
    expect(query).toContain("link_recipient_not_verified_clicker");
    expect(query).toContain('AS "ownerEmail"');
  });
});
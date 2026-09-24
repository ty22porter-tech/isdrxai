import { afterEach, describe, it, expect, vi } from "vitest";
import { enrichPerson, extractPersonFromApolloData, isPlaceholderEmail, isPlausibleCompanyMatch } from "./apollo";

const target = { companyName: "Mockingbird Food Group", domain: null };

describe("isPlausibleCompanyMatch", () => {
  it("rejects a person from a completely different company (wrong-match bug)", () => {
    const swede = {
      email: "marja.hallikainen@basalt.se",
      organization: { name: "Basalt AB", website_url: "https://basalt.se" },
    };
    expect(isPlausibleCompanyMatch(swede, target)).toBe(false);
  });

  it("accepts when the org name shares a distinctive word", () => {
    const p = { organization: { name: "Mockingbird Foods LLC" } };
    expect(isPlausibleCompanyMatch(p, target)).toBe(true);
  });

  it("accepts when the org domain matches the company website", () => {
    const p = { organization: { name: "MFG", website_url: "https://mockingbirdfood.com" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Mockingbird Food Group", domain: "mockingbirdfood.com" })).toBe(true);
  });

  it("accepts when the revealed email domain matches the company website", () => {
    const p = { email: "jane@mockingbirdfood.com", organization: { name: "Different Listed Name" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Mockingbird Food Group", domain: "mockingbirdfood.com" })).toBe(true);
  });

  it("rejects when only generic corporate words overlap", () => {
    const p = { organization: { name: "Global Services Group Inc" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Acme Services Group", domain: null })).toBe(false);
  });

  it("rejects when Apollo returns no organization info at all", () => {
    expect(isPlausibleCompanyMatch({ }, target)).toBe(false);
  });

  it("rejects a conflicting org domain even when the name resembles the target", () => {
    const p = { organization: { name: "Acme Dental", website_url: "https://acmedental.com" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Acme Manufacturing", domain: "acmemfg.com" })).toBe(false);
  });

  it("accepts a subdomain of the company's registrable domain", () => {
    const p = { organization: { name: "Whatever", website_url: "https://shop.mockingbirdfood.com" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "Mockingbird Food Group", domain: "www.mockingbirdfood.com" })).toBe(true);
  });

  it("accepts punctuation/concatenation name variants", () => {
    const p = { organization: { name: "McDonalds Corporation" } };
    expect(isPlausibleCompanyMatch(p, { companyName: "McDonald's", domain: null })).toBe(true);
  });

  it("preserves Apollo organization descriptions for company-specific intelligence", () => {
    const person = extractPersonFromApolloData({
      name: "Arjun Kooranotha",
      organization: {
        name: "Perfect General Contractors",
        website_url: "https://perfectgc.net",
        short_description: "Perfect General Contractors provides commercial construction management for clients across North Texas.",
        estimated_num_employees: 4,
      },
    });

    expect(person.organizationDescription).toContain("commercial construction management");
    expect(person.employeeCount).toBe(4);
  });
});

const company = { name: "Mockingbird Foods LLC", website_url: "https://mockingbirdfood.com" };
const lead = { email: "unknown@mockingbirdfood.invalid", companyName: "Mockingbird Food Group", website: "https://mockingbirdfood.com" };
const candidate = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, title: "Facilities Manager", organization: company, ...overrides,
});
const revealed = (email: string | null, overrides: Record<string, unknown> = {}) => ({
  name: "Jane Manager", email, organization: company, ...overrides,
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Apollo email discovery", () => {
  it("normalizes placeholder sentinels and rejects invalid provider email formats", () => {
    expect(isPlaceholderEmail("  UNKNOWN@SUB.INVALID.COM  ")).toBe(true);
    expect(isPlaceholderEmail("  UNKNOWN@EXAMPLE.INVALID  ")).toBe(true);
    expect(isPlaceholderEmail("x@invalid.com")).toBe(true);
    expect(isPlaceholderEmail("x@valid.com")).toBe(false);
    expect(extractPersonFromApolloData(revealed("not-an-email")).email).toBeNull();
    expect(extractPersonFromApolloData(revealed(" X@INVALID.COM ")).email).toBeNull();
    expect(extractPersonFromApolloData(revealed("x@invalid.com", {
      contact: { email_addresses: [{ email: "real@mockingbirdfood.com" }] },
    })).email).toBe("real@mockingbirdfood.com");
  });

  it("continues revealing candidates when the first plausible person lacks email", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ people: [candidate("one"), candidate("two")] }))
      .mockResolvedValueOnce(json({ person: revealed(null) }))
      .mockResolvedValueOnce(json({ person: revealed("jane@mockingbirdfood.com") }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichPerson(lead);
    expect(result).toMatchObject({ ok: true, person: { email: "jane@mockingbirdfood.com" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ id: "two" });
  });

  it("prioritizes has_email candidates, then preferred titles", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ people: [
        candidate("no-email", { has_email: false, title: "Facilities Manager" }),
        candidate("office", { has_email: true, title: "Office Manager" }),
        candidate("facilities", { has_email: true, title: "Facilities Manager" }),
      ] }))
      .mockResolvedValueOnce(json({ person: revealed("facilities@mockingbirdfood.com") }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await enrichPerson(lead)).toMatchObject({ ok: true, person: { email: "facilities@mockingbirdfood.com" } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).id).toBe("facilities");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to broader search when preferred-title candidates have no usable email, without revealing duplicate ids", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ people: [candidate("one", { has_email: true })] }))
      .mockResolvedValueOnce(json({ person: revealed("  NONE@INVALID.COM  ") }))
      .mockResolvedValueOnce(json({ people: [candidate("one"), candidate("owner", { title: "Owner", has_email: true })] }))
      .mockResolvedValueOnce(json({ person: revealed("owner@mockingbirdfood.com") }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichPerson(lead);
    expect(result).toMatchObject({ ok: true, person: { email: "owner@mockingbirdfood.com" } });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).person_titles).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).id).toBe("owner");
  });

  it("routes uppercase legacy placeholders to search and normalizes a real direct email", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ people: [candidate("one")] }))
      .mockResolvedValueOnce(json({ person: revealed("jane@mockingbirdfood.com") }))
      .mockResolvedValueOnce(json({ person: revealed("jane@mockingbirdfood.com") }));
    vi.stubGlobal("fetch", fetchMock);

    await enrichPerson({ ...lead, email: "  NONE@SUB.INVALID.COM  " });
    expect(fetchMock.mock.calls[0][0]).toContain("/mixed_people/api_search");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).q_organization_domains_list).toEqual(["mockingbirdfood.com"]);
    await enrichPerson({ ...lead, email: " Jane@MockingbirdFood.com " });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).email).toBe("jane@mockingbirdfood.com");
  });

  it("rejects wrong-company search and revealed contacts even if they have emails", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ people: [candidate("wrong", { organization: { name: "Other", website_url: "https://other.com" } }), candidate("suspect")] }))
      .mockResolvedValueOnce(json({ person: revealed("wrong@other.com", { organization: { name: "Mockingbird Foods", website_url: "https://other.com" } }) }))
      .mockResolvedValueOnce(json({ people: [] }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await enrichPerson(lead)).toEqual({ ok: true, person: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).id).toBe("suspect");
  });

  it("retains useful contact fields for a known direct email when Apollo omits its response email", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ person: revealed(null, { title: "Operations Manager", sanitized_phone: "555-0101" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await enrichPerson({ ...lead, email: "jane@mockingbirdfood.com" })).toMatchObject({
      ok: true,
      person: { contactName: "Jane Manager", email: null, title: "Operations Manager", phone: "555-0101" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).email).toBe("jane@mockingbirdfood.com");
  });

  it("preserves explicit provider errors on search and reveal", async () => {
    vi.stubEnv("APOLLO_API_KEY", "mock-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("API_INACCESSIBLE", { status: 403 }))
      .mockResolvedValueOnce(json({ people: [candidate("one")] }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await enrichPerson(lead)).toMatchObject({ ok: false, planBlocked: true, error: expect.stringContaining("API_INACCESSIBLE") });
    expect(await enrichPerson(lead)).toEqual({ ok: false, planBlocked: false, error: "Apollo rate limit reached — try again in a minute." });
  });
});

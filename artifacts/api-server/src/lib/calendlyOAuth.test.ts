import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@workspace/db", () => ({ db: {}, calendlyConnectionsTable: {} }));
import { seal, unseal, hash, exchange } from "./calendlyOAuth";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Calendly credential safety", () => {
  it("encrypts credentials with randomized authenticated encryption", () => {
    vi.stubEnv("SESSION_SECRET", "unit-test-only-secret-with-at-least-32-characters");
    const value = { access_token: "test-access", refresh_token: "test-refresh" };
    const first = seal(value);
    expect(first).not.toContain("test-access");
    expect(first).not.toBe(seal(value));
    expect(unseal(first)).toEqual(value);
    const changed = Buffer.from(first, "base64"); changed[30] ^= 1;
    expect(() => unseal(changed.toString("base64"))).toThrow();
  });
  it("fails closed without a strong encryption secret", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => seal({ token: "test" })).toThrow();
  });
  it("hashes OAuth state deterministically without storing the state", () => {
    expect(hash("state")).toHaveLength(64);
    expect(hash("state")).not.toBe(hash("other"));
  });
  it("does not expose provider errors or credentials on failed exchange", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(exchange({ grant_type: "authorization_code", code: "test" })).rejects.toThrow("Please reconnect");
  });
});
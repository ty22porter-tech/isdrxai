import crypto from "node:crypto";
import { db, calendlyConnectionsTable as connections } from "@workspace/db";
import { eq } from "drizzle-orm";

export const CALENDLY_CALLBACK = "https://isdrxai.com/api/calendly/oauth/callback";
export const CALENDLY_API = "https://api.calendly.com";
export const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export class CalendlyApiError extends Error {
  constructor(public status: number, body: any) {
    // Classify documented provider errors without exposing arbitrary payloads,
    // URLs, tokens, email addresses, or request bodies to logs/UI.
    super(body?.title === "Insufficient scope"
      ? "Calendly permissions are missing. Enable users:read, scheduled_events:read and webhooks:write for the OAuth app, then reconnect."
      : typeof body?.message === "string" && /upgrade your calendly account/i.test(body.message)
        ? "Your Calendly plan does not allow webhooks. A Calendly plan with webhook access is required."
        : status === 401 ? "Calendly authorization expired. Please reconnect."
          : status === 403 ? "Calendly denied access. Check the account's webhook permissions and plan."
            : status === 429 ? "Calendly rate limit reached. Please retry later."
              : `Calendly rejected the request (HTTP ${status}). Please reconnect or retry later.`);
  }
}

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Calendar credential encryption is not configured.");
  return crypto.createHash("sha256").update(`calendly-credentials:${secret}`).digest();
}
export function seal(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export function unseal(value: string): any {
  const bytes = Buffer.from(value, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
}
export async function exchange(params: Record<string, string>) {
  const response = await fetch("https://auth.calendly.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID!,
      client_secret: process.env.CALENDLY_CLIENT_SECRET!,
      ...params,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Calendly authorization failed. Please reconnect.");
  const token = await response.json() as any;
  if (!token.access_token || !token.refresh_token || !token.expires_in) throw new Error("Invalid Calendly authorization response.");
  return { ...token, expiresAt: Date.now() + token.expires_in * 1000 };
}
export async function calendlyRequest(clientId: string, path: string, init: RequestInit = {}) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Calendly path.");
  // Row locking prevents rotating the same refresh token from concurrent requests.
  const token = await db.transaction(async tx => {
    const [connection] = await tx.select().from(connections).where(eq(connections.clientId, clientId)).for("update");
    if (!connection?.credentials) throw new Error("Connect your Calendly account first.");
    let credentials = unseal(connection.credentials);
    if (credentials.expiresAt < Date.now() + 60000) {
      credentials = await exchange({ grant_type: "refresh_token", refresh_token: credentials.refresh_token });
      await tx.update(connections).set({ credentials: seal(credentials) }).where(eq(connections.clientId, clientId));
    }
    return credentials.access_token;
  });
  const response = await fetch(`${CALENDLY_API}${path}`, {
    ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new CalendlyApiError(response.status, await response.json().catch(() => null));
  return response.status === 204 ? null : response.json() as Promise<any>;
}
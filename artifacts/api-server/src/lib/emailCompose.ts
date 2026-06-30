import { getPublicAppUrl } from "./publicUrl";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ComposeClient {
  businessName?: string | null;
  senderName?: string | null;
  phone?: string | null;
  businessAddress?: string | null;
  outreachEmail?: string | null;
}

export interface ComposeResult {
  text: string;
  html: string;
  unsubscribePageUrl: string;
  unsubscribeApiUrl: string;
}

/**
 * Wraps an email body with a real signature and a CAN-SPAM compliant footer
 * (physical postal address + one-click unsubscribe link). Returns both a
 * plain-text version and an HTML version, plus the values needed for the
 * List-Unsubscribe headers that improve deliverability.
 *
 * The caller is responsible for ensuring a physical postal address exists —
 * see hasPostalAddress() — because it is legally required in marketing email.
 */
export function composeEmail(
  coreBody: string,
  client: ComposeClient,
  prospect: { companyName: string; scheduleToken: string },
): ComposeResult {
  const baseUrl = getPublicAppUrl();
  const unsubscribePageUrl = `${baseUrl}/unsubscribe/${prospect.scheduleToken}`;
  const unsubscribeApiUrl = `${baseUrl}/api/unsubscribe/${prospect.scheduleToken}`;

  const business = client.businessName?.trim() || "Our Company";
  const signatureLines = [
    "Best,",
    client.senderName?.trim() || business,
    client.senderName?.trim() ? business : "",
    client.phone?.trim() || "",
    client.outreachEmail?.trim() || "",
  ].filter(Boolean);

  const addressLine = client.businessAddress?.trim()
    ? `${business} · ${client.businessAddress.trim().replace(/\s*\n\s*/g, ", ")}`
    : business;

  const footerIntro = `You're receiving this email because we believe ${prospect.companyName} may benefit from professional commercial cleaning services.`;

  const text =
    `${coreBody.trim()}\n\n` +
    `${signatureLines.join("\n")}\n\n` +
    `—\n${addressLine}\n${footerIntro}\nPrefer not to hear from us? Unsubscribe: ${unsubscribePageUrl}`;

  const bodyHtml = escapeHtml(coreBody.trim())
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const signatureHtml = `<p style="margin:0 0 16px">${escapeHtml(signatureLines.join("\n")).replace(/\n/g, "<br>")}</p>`;
  const footerHtml =
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px">` +
    `<p style="font-size:12px;color:#6b7280;line-height:1.5;margin:0">` +
    `${escapeHtml(addressLine)}<br>${escapeHtml(footerIntro)}<br>` +
    `Prefer not to hear from us? <a href="${unsubscribePageUrl}" style="color:#6b7280">Unsubscribe</a>.` +
    `</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">${bodyHtml}${signatureHtml}${footerHtml}</div>`;

  return { text, html, unsubscribePageUrl, unsubscribeApiUrl };
}

export function unsubscribeHeaders(unsubscribeApiUrl: string, replyTo: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeApiUrl}>, <mailto:${replyTo}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function hasPostalAddress(client: ComposeClient): boolean {
  return !!client.businessAddress?.trim();
}

export const POSTAL_ADDRESS_REQUIRED_MESSAGE =
  "Add your business mailing address in Settings — it's legally required (CAN-SPAM) before any emails can be sent.";

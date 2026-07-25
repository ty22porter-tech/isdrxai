import { getPublicAppUrl } from "./publicUrl";
import { getVerticalConfig } from "./verticals";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ComposeClient {
  businessName?: string | null;
  senderName?: string | null;
  phone?: string | null;
  businessAddress?: string | null;
  outreachEmail?: string | null;
  vertical?: string | null;
  companyLogoPath?: string | null;
  profilePhotoPath?: string | null;
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
 *
 * unsubscribeToken is intentionally separate from scheduleToken so that
 * disclosing the unsubscribe link does not grant access to the scheduling
 * or reply-routing flows.
 */
export function composeEmail(
  coreBody: string,
  client: ComposeClient,
  prospect: { companyName: string; unsubscribeToken: string },
  cta?: { label: string; url: string },
): ComposeResult {
  const baseUrl = getPublicAppUrl();
  const unsubscribePageUrl = `${baseUrl}/unsubscribe/${prospect.unsubscribeToken}`;
  const unsubscribeApiUrl = `${baseUrl}/api/unsubscribe/${prospect.unsubscribeToken}`;

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

  const footerIntro = `You're receiving this email because we believe ${prospect.companyName} may benefit from ${getVerticalConfig(client.vertical).footerServicePhrase}.`;

  const ctaText = cta ? `\n\n${cta.label}: ${cta.url}` : "";
  const text =
    `${coreBody.trim()}${ctaText}\n\n` +
    `${signatureLines.join("\n")}\n\n` +
    `${addressLine}\n${footerIntro}\nPrefer not to hear from us? Unsubscribe: ${unsubscribePageUrl}`;

  const bodyHtml = escapeHtml(coreBody.trim())
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const ctaHtml = cta
    ? `<p style="margin:0 0 16px"><a href="${cta.url}" style="color:#2563eb">${escapeHtml(cta.label)}</a></p>`
    : "";
  // Signature with optional headshot (left) and company logo (below). Image
  // URLs must be absolute so they load inside the recipient's email client.
  const photoUrl = client.profilePhotoPath ? `${baseUrl}/api/storage${client.profilePhotoPath}` : null;
  const logoUrl = client.companyLogoPath ? `${baseUrl}/api/storage${client.companyLogoPath}` : null;
  const signatureTextHtml = escapeHtml(signatureLines.join("\n")).replace(/\n/g, "<br>");
  const photoCellHtml = photoUrl
    ? `<td style="vertical-align:top;padding-right:12px"><img src="${photoUrl}" alt="${escapeHtml(client.senderName?.trim() || business)}" width="56" height="56" style="border-radius:50%;display:block;object-fit:cover"></td>`
    : "";
  const logoHtml = logoUrl
    ? `<div style="margin-top:8px"><img src="${logoUrl}" alt="${escapeHtml(business)}" height="36" style="display:block;max-height:36px;width:auto"></div>`
    : "";
  const signatureHtml =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>` +
    `${photoCellHtml}<td style="vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">${signatureTextHtml}${logoHtml}</td>` +
    `</tr></table>`;
  // Keep the footer visually quiet (no divider rule, small muted text) so the
  // message reads like a personal 1:1 email rather than a bulk newsletter —
  // heavy dividers/footer blocks are a strong Gmail "Promotions" signal.
  const footerHtml =
    `<p style="font-size:12px;color:#9ca3af;line-height:1.5;margin:16px 0 0">` +
    `${escapeHtml(addressLine)}<br>${escapeHtml(footerIntro)}<br>` +
    `Prefer not to hear from us? <a href="${unsubscribePageUrl}" style="color:#9ca3af">Unsubscribe</a>.` +
    `</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">${bodyHtml}${ctaHtml}${signatureHtml}${footerHtml}</div>`;

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

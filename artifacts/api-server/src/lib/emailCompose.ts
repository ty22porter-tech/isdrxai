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
  website?: string | null;
  mobilePhone?: string | null;
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
    client.phone?.trim() ? `Office Phone: ${client.phone.trim()}` : "",
    client.mobilePhone?.trim() ? `Mobile: ${client.mobilePhone.trim()}` : "",
    client.outreachEmail?.trim() ? `Email: ${client.outreachEmail.trim()}` : "",
    client.website?.trim() ? `Website: ${client.website.trim()}` : "",
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
  // Signature block: square headshot on top, bold name + title, business name,
  // divider rule, then contact lines — with the company logo to the right.
  // Image URLs must be absolute so they load inside the recipient's email client.
  const photoUrl = client.profilePhotoPath ? `${baseUrl}/api/storage${client.profilePhotoPath}` : null;
  const logoUrl = client.companyLogoPath ? `${baseUrl}/api/storage${client.companyLogoPath}` : null;
  const senderRaw = client.senderName?.trim() || business;
  // "Ty Porter, MBA - Director of Sales" → name "Ty Porter, MBA", title "Director of Sales"
  const dashIdx = senderRaw.indexOf(" - ");
  const senderDisplayName = dashIdx > -1 ? senderRaw.slice(0, dashIdx).trim() : senderRaw;
  const senderTitle = dashIdx > -1 ? senderRaw.slice(dashIdx + 3).trim() : "";
  const phoneTrim = client.phone?.trim() || "";
  const mobileTrim = client.mobilePhone?.trim() || "";
  const emailTrim = client.outreachEmail?.trim() || "";
  const websiteTrim = client.website?.trim() || "";
  const websiteHref = websiteTrim && !/^https?:\/\//i.test(websiteTrim) ? `https://${websiteTrim}` : websiteTrim;

  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" alt="${escapeHtml(senderDisplayName)}" width="90" height="90" style="display:block;object-fit:cover;margin:0 0 12px">`
    : "";
  const nameHtml = `<div style="font-size:18px;font-weight:bold;color:#111827">${escapeHtml(senderDisplayName)}</div>`;
  const titleHtml = senderTitle ? `<div style="font-size:16px;color:#111827">${escapeHtml(senderTitle)}</div>` : "";
  const businessHtml = `<div style="font-size:14px;font-weight:600;letter-spacing:.5px;color:#2563eb;text-transform:uppercase;margin-top:2px">${escapeHtml(business)}</div>`;
  const ruleHtml = `<div style="border-top:1px solid #dc2626;width:260px;margin:14px 0"></div>`;
  const contactRow = (label: string, valueHtml: string) =>
    `<div style="margin:0 0 4px;font-size:13px"><span style="font-weight:bold">${label}:</span> ${valueHtml}</div>`;
  const contactRows = [
    phoneTrim ? contactRow("Office Phone", `<a href="tel:${escapeHtml(phoneTrim.replace(/[^+\d]/g, ""))}" style="color:#111827;text-decoration:underline">${escapeHtml(phoneTrim)}</a>`) : "",
    mobileTrim ? contactRow("Mobile", `<a href="tel:${escapeHtml(mobileTrim.replace(/[^+\d]/g, ""))}" style="color:#111827;text-decoration:underline">${escapeHtml(mobileTrim)}</a>`) : "",
    emailTrim ? contactRow("Email", `<a href="mailto:${escapeHtml(emailTrim)}" style="color:#111827;text-decoration:underline">${escapeHtml(emailTrim)}</a>`) : "",
    websiteTrim ? contactRow("Website", `<a href="${escapeHtml(websiteHref)}" style="color:#111827;text-decoration:underline">${escapeHtml(websiteTrim)}</a>`) : "",
  ].filter(Boolean).join("");
  const logoCellHtml = logoUrl
    ? `<td style="vertical-align:middle;padding-left:40px"><img src="${logoUrl}" alt="${escapeHtml(business)}" width="120" style="display:block;max-width:120px;height:auto"></td>`
    : "";
  const signatureHtml =
    `<p style="margin:0 0 16px">Best,</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>` +
    `<td style="vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.4">` +
    `${photoHtml}${nameHtml}${titleHtml}${businessHtml}${ruleHtml}${contactRows}` +
    `</td>${logoCellHtml}</tr></table>`;
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

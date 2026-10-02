import { outboundResendRequest } from "./outboundResend";
import { assertOutboundDeliveryReady } from "./outboundResendWebhook";

export function getPlatformFromEmail(): string {
  // Trim: a stray space in the env var produces a malformed From header
  // ("name <addr >") that breaks DMARC alignment and hurts deliverability.
  // Explicit cutover: do not inherit the legacy deployment's sdrai.xyz override.
  return "info@isdrxai.com";
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailOptions {
  fromName: string;
  /** Per-client authenticated sending address. Falls back to the platform default when unset. */
  fromEmail?: string;
  replyTo: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

/** Sends the email and returns the Resend message id (used to match delivery webhooks). */
export async function sendEmail(options: SendEmailOptions): Promise<string | undefined> {
  const { fromName, fromEmail: fromEmailOverride, replyTo, to, subject, body, html, attachments, headers } = options;
  const fromEmail = fromEmailOverride?.trim() || getPlatformFromEmail();
  assertOutboundDeliveryReady();
  const response = await outboundResendRequest("/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
    from: `${fromName.trim()} <${fromEmail}>`,
    reply_to: replyTo.trim(),
    to: to.trim(),
    subject,
    text: body,
    html: html ?? `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
    attachments: attachments?.map(a => ({ filename: a.filename, content: a.content.toString("base64") })),
    headers,
    }),
  });
  const data = await response.json() as { id?: string; message?: string };
  if (!response.ok) throw new Error(data.message || `Resend rejected email (${response.status})`);
  if (!data.id) throw new Error("Resend did not acknowledge the email with a message ID");
  return data.id;
}

export async function isResendConfigured(): Promise<boolean> {
  try {
    assertOutboundDeliveryReady();
    const response = await outboundResendRequest("/domains");
    if (!response.ok) return false;
    const data = await response.json() as { data?: Array<{ name: string; status: string }> };
    return !!data.data?.some(d => d.name === "isdrxai.com" && d.status === "verified");
  } catch {
    return false;
  }
}

export type { };

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set. Add it in your project Secrets.");
    _resend = new Resend(key);
  }
  return _resend;
}

export function getPlatformFromEmail(): string {
  // Trim: a stray space in the env var produces a malformed From header
  // ("name <addr >") that breaks DMARC alignment and hurts deliverability.
  return (process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev").trim();
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
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: `${fromName.trim()} <${fromEmail}>`,
    replyTo: replyTo.trim(),
    to: to.trim(),
    subject,
    text: body,
    html: html ?? `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
    attachments: attachments?.map(a => ({ filename: a.filename, content: a.content })),
    headers,
  }, options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined);

  if (error) throw new Error(error.message);
  return data?.id;
}

export async function isResendConfigured(): Promise<boolean> {
  return !!(process.env.RESEND_API_KEY);
}

export type { };

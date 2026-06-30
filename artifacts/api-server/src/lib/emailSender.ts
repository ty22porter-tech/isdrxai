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
  return process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailOptions {
  fromName: string;
  replyTo: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { fromName, replyTo, to, subject, body, html, attachments, headers } = options;
  const fromEmail = getPlatformFromEmail();
  const resend = getResend();

  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    replyTo,
    to,
    subject,
    text: body,
    html: html ?? `<p>${body.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
    attachments: attachments?.map(a => ({ filename: a.filename, content: a.content })),
    headers,
  });

  if (error) throw new Error(error.message);
}

export async function isResendConfigured(): Promise<boolean> {
  return !!(process.env.RESEND_API_KEY);
}

export type { };

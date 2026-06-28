import nodemailer from "nodemailer";

export type EmailProvider = "gmail" | "outlook";

export interface SendEmailOptions {
  provider: EmailProvider;
  fromEmail: string;
  appPassword: string;
  to: string;
  subject: string;
  body: string;
}

function createTransporter(provider: EmailProvider, fromEmail: string, appPassword: string) {
  if (provider === "outlook") {
    return nodemailer.createTransport({
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false,
      auth: { user: fromEmail, pass: appPassword },
      tls: { ciphers: "SSLv3" },
    });
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user: fromEmail, pass: appPassword },
  });
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { provider, fromEmail, appPassword, to, subject, body } = options;
  const transporter = createTransporter(provider, fromEmail, appPassword);
  await transporter.sendMail({
    from: fromEmail,
    to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });
}

export async function verifyCredentials(provider: EmailProvider, fromEmail: string, appPassword: string): Promise<void> {
  const transporter = createTransporter(provider, fromEmail, appPassword);
  await transporter.verify();
}

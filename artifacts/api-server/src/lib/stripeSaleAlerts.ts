import type Stripe from "stripe";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./emailSender";
import { logger } from "./logger";
import { getPublicAppUrl } from "./publicUrl";

export type StripeSaleSummary = {
  eventId: string;
  title: string;
  customer: string;
  packageName: string;
  amount: string;
  body: string;
};

function formatUsd(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function uniqueDescriptions(lines: Stripe.InvoiceLineItem[]): string[] {
  return [...new Set(
    lines
      .map((line) => line.description?.trim())
      .filter((description): description is string => Boolean(description)),
  )];
}

export function getStripeSaleSummary(event: Stripe.Event): StripeSaleSummary | null {
  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.amount_paid <= 0) return null;

    const descriptions = uniqueDescriptions(invoice.lines.data);
    const packageName = descriptions.length > 0
      ? descriptions.slice(0, 3).join(", ")
      : "iSDRX AI package";
    const customer =
      invoice.customer_name?.trim() ||
      invoice.customer_email?.trim() ||
      (typeof invoice.customer === "string" ? invoice.customer : "Stripe customer");
    const amount = formatUsd(invoice.amount_paid, invoice.currency);
    const isRenewal = invoice.billing_reason === "subscription_cycle";
    const title = isRenewal ? "Stripe renewal payment received" : "New Stripe sale completed";

    return {
      eventId: event.id,
      title,
      customer,
      packageName,
      amount,
      body: `${customer} paid ${amount} for ${packageName}. Stripe invoice: ${invoice.number ?? invoice.id}.`,
    };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Subscription checkouts are reported by invoice.paid with better package
    // context. Only standalone, paid Checkout sessions are handled here.
    if (
      session.mode !== "payment" ||
      session.payment_status !== "paid" ||
      !session.amount_total ||
      !session.currency
    ) {
      return null;
    }

    const customer =
      session.customer_details?.name?.trim() ||
      session.customer_details?.email?.trim() ||
      (typeof session.customer === "string" ? session.customer : "Stripe customer");
    const packageName =
      session.metadata?.package_name?.trim() || "one-time iSDRX AI purchase";
    const amount = formatUsd(session.amount_total, session.currency);

    return {
      eventId: event.id,
      title: "New Stripe sale completed",
      customer,
      packageName,
      amount,
      body: `${customer} paid ${amount} for ${packageName}. Stripe checkout: ${session.id}.`,
    };
  }

  return null;
}

export async function notifyAdminsOfStripeSale(event: Stripe.Event): Promise<void> {
  const sale = getStripeSaleSummary(event);
  if (!sale) return;

  const admins = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.isAdmin, true));

  if (admins.length === 0) {
    logger.warn({ stripeEventId: sale.eventId }, "Stripe sale received, but no admin account exists to notify");
    return;
  }

  const adminUrl = `${getPublicAppUrl()}/app/admin`;

  for (const admin of admins) {
    const sourceKey = `stripe-sale:${sale.eventId}:${admin.id}`;
    const [notification] = await db
      .insert(notificationsTable)
      .values({
        clientId: admin.id,
        sourceKey,
        type: "stripe_sale",
        title: sale.title,
        body: sale.body,
      })
      .onConflictDoNothing({ target: notificationsTable.sourceKey })
      .returning({ id: notificationsTable.id });

    // Stripe retries the same event when delivery is interrupted. Only the
    // first successful insert is allowed to send an email.
    if (!notification) continue;

    const email = admin.email?.trim();
    if (!email) {
      logger.warn(
        { adminId: admin.id, stripeEventId: sale.eventId },
        "Stripe sale notification saved in-app, but admin account has no email address",
      );
      continue;
    }

    try {
      await sendEmail({
        fromName: "iSDRX AI Sales Alerts",
        to: email,
        replyTo: "info@isdrxai.com",
        subject: `${sale.title}: ${sale.amount}`,
        body:
          `${sale.body}\n\n` +
          `Customer: ${sale.customer}\n` +
          `Package: ${sale.packageName}\n` +
          `Amount received: ${sale.amount}\n\n` +
          `Review the admin dashboard: ${adminUrl}`,
        html:
          `<p><strong>${escapeHtml(sale.title)}</strong></p>` +
          `<p>${escapeHtml(sale.body)}</p>` +
          `<p>Customer: ${escapeHtml(sale.customer)}<br>` +
          `Package: ${escapeHtml(sale.packageName)}<br>` +
          `Amount received: ${escapeHtml(sale.amount)}</p>` +
          `<p><a href="${adminUrl}">Review the admin dashboard</a></p>`,
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: admin.id, stripeEventId: sale.eventId },
        "Stripe sale in-app notification saved, but admin email failed",
      );
    }
  }
}
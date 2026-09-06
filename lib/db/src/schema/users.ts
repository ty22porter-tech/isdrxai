import { pgTable, text, boolean, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface SellerIntelligenceEditable {
  sellerCompanyName: string | null;
  sellerServices: string[];
  sellerProducts: string[];
  sellerCapabilities: string[];
  sellerDifferentiators: string[];
  sellerCertifications: string[];
  sellerIndustriesServed: string[];
  sellerBusinessOutcomes: string[];
  sellerProblemsSolved: string[];
  sellerProofPoints: string[];
  sellerPortfolioExamples: string[];
  sellerValuePropositions: string[];
  sellerTypicalCustomers: string[];
  sellerCTAs: string[];
}

export interface SellerIntelligenceProfile extends SellerIntelligenceEditable {
  status: "ready" | "needs_review" | "limited";
  sellerCompanyName: string | null;
  sellerWebsite: string;
  sellerIndustry: string;
  sourcePages: string[];
  websiteLastAnalyzed: string;
  websiteAnalysisStatus: "ready" | "limited";
  websiteGenerated?: SellerIntelligenceEditable;
  userOverrides?: Partial<SellerIntelligenceEditable>;
  userEditedAt?: string;
  analysisError?: string;
}

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  businessName: text("business_name"),
  senderName: text("sender_name"),
  phone: text("phone"),
  businessAddress: text("business_address"),
  outreachEmail: text("outreach_email"),
  sendingEmail: text("sending_email"),
  calendlyUrl: text("calendly_url"),
  timezone: text("timezone").default("America/New_York"),
  autopilotEnabled: boolean("autopilot_enabled").notNull().default(false),
  callerPilotEnabled: boolean("caller_pilot_enabled").notNull().default(false),
  callerDailyLimit: integer("caller_daily_limit").notNull().default(50),
  callerMonthlyLimit: integer("caller_monthly_limit").notNull().default(500),
  vertical: text("vertical").notNull().default("janitorial"),
  verticalSelected: boolean("vertical_selected").notNull().default(true),
  website: text("website"),
  sellerDifferentiatorsInput: text("seller_differentiators_input"),
  sellerServicePriorities: text("seller_service_priorities"),
  /** Derived only from the account holder's public company website. */
  sellerIntelligenceProfile: jsonb("seller_intelligence_profile").$type<SellerIntelligenceProfile | null>(),
  mobilePhone: text("mobile_phone"),
  companyLogoPath: text("company_logo_path"),
  profilePhotoPath: text("profile_photo_path"),
  attachments: jsonb("attachments").$type<{ path: string; name: string; size: number; contentType: string }[]>().notNull().default([]),
  step3CaseStudy: jsonb("step3_case_study").$type<{ path: string; name: string; size: number; contentType: string } | null>(),
  step5CaseStudy: jsonb("step5_case_study").$type<{ path: string; name: string; size: number; contentType: string } | null>(),
  /** Engagement Automation settings (partial — merged with server defaults). */
  engagementSettings: jsonb("engagement_settings").$type<Record<string, unknown> | null>(),
  termsAcceptedVersion: text("terms_accepted_version"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface OpportunitySignal {
  signalId?: string;
  signalType: string;
  signalTitle: string;
  signalDescription: string;
  signalClassification: "verified" | "implication" | "unconfirmed";
  confidenceLevel: "high" | "medium" | "low";
  freshness: "recent" | "active" | "older" | "stale" | "unknown";
  sourceName?: string;
  sourceURL?: string;
  sourceDate?: string | Date;
  dateDiscovered: string | Date;
  dateVerified?: string | Date;
  supportingEvidence?: string;
  relatedSellerCapability?: string;
  potentialBusinessImpact?: string;
  pointReason?: string;
  corroboratingSources?: Array<{
    sourceName?: string;
    sourceURL: string;
    sourceDate?: string | Date;
  }>;
  points: number;
}

export interface OpportunityScoreCategory {
  key: "company_industry_fit" | "verified_buying_signals" | "seller_prospect_match" | "decision_maker_match" | "signal_freshness" | "business_need_potential";
  label: string;
  points: number;
  maxPoints: number;
  explanation: string;
  evidence: string[];
}

export interface OpportunityIntelligence {
  version: 1 | 2 | 3;
  score: number;
  label: "High Priority" | "Strong Opportunity" | "Moderate Opportunity" | "Strong Fit" | "Possible Fit" | "Low Priority";
  scoreConfidence: "high" | "medium" | "low";
  scoreConfidenceReason?: string;
  definition: string;
  breakdown: OpportunityScoreCategory[];
  signals: OpportunitySignal[];
  whyTarget: string;
  potentialNeeds: string[];
  recommendedOutreach: string;
  hiringResearch?: {
    status: "VERIFIED_ACTIVE_HIRING" | "RECENT_HIRING_SIGNAL" | "NO_ACTIVE_HIRING_FOUND" | "UNKNOWN";
    roles: string[];
    locations: string[];
    count: number | null;
    sources: Array<{ sourceName?: string; sourceURL: string; sourceDate?: string | Date }>;
    confidence: "high" | "medium" | "low";
    evidence: string[];
  };
  scoringInputs?: {
    vertical: string;
    companyName: string;
    industry: string;
    contactTitle: string | null;
    businessModelBasis: "verified" | "industry_hypothesis";
    sellerProfileStatus: "ready" | "limited";
    sellerCapabilitiesConsidered: string[];
    sellerPriorityConsidered: string | null;
    employeeCount?: number | null;
    employeeRange?: string | null;
    compliancePriority?: string | null;
    estimatedLocations?: number | null;
  };
  integrity?: {
    status: "passed";
    calculatedTotal: number;
    categoryMaxTotal: number;
    checks: Array<{ name: string; passed: boolean }>;
  };
  generatedAt: string | Date;
}

export const prospectsTable = pgTable("prospects", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().default(""),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  industry: text("industry").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  website: text("website"),
  address: text("address"),
  notes: text("notes"),
  /** Seller-specific opportunity fit. Never used for engagement Hot/Medium/Low. */
  opportunityIntelligence: jsonb("opportunity_intelligence").$type<OpportunityIntelligence>(),
  employeeCount: integer("employee_count"),
  squareFootage: integer("square_footage"),
  vertical: text("vertical"),
  status: text("status").notNull().default("new"),
  scheduleToken: text("schedule_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  unsubscribeToken: text("unsubscribe_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  replyToken: text("reply_token").notNull().unique().default(sql`gen_random_uuid()::text`),
  /** System engagement score (sum of score_events points). */
  engagementScore: integer("engagement_score").notNull().default(0),
  /** Interest level computed from the score + thresholds: "low" | "medium" | "hot". */
  interestLevel: text("interest_level").notNull().default("low"),
  /** Manual override set by the client; preserved alongside the system score. */
  manualInterestLevel: text("manual_interest_level"),
  manualInterestSetAt: timestamp("manual_interest_set_at"),
  /** Contact's job title, filled by Apollo people enrichment. */
  title: text("title"),
  /** Contact's LinkedIn profile URL, filled by Apollo people enrichment. */
  linkedinUrl: text("linkedin_url"),
  /** When Apollo enrichment last succeeded for this prospect. */
  enrichedAt: timestamp("enriched_at"),
  /** Flag surfaced in Hot alerts — no automation attached (out of scope). */
  linkedinOutreach: boolean("linkedin_outreach").notNull().default(false),
  optedOut: boolean("opted_out").notNull().default(false),
  optedOutAt: timestamp("opted_out_at"),
  lastContactedAt: timestamp("last_contacted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({ id: true, createdAt: true, clientId: true });
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Prospect = typeof prospectsTable.$inferSelect;

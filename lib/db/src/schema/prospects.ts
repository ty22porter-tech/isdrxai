import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface OpportunitySignal {
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

export interface ResearchSource {
  title: string;
  url: string;
  publishedDate?: string | null;
}

export interface ItResearch {
  selectedIndustry: string;
  actualIndustry: string | null;
  industryRelationship: "match" | "serves_industry" | "mismatch" | "uncertain";
  industryExplanation: string;
  industrySources: ResearchSource[];
  lastResearched: string | Date;
  warnings: string[];
  industryChallenges: Array<{
    title: string;
    explanation: string;
    businessImpact: string;
    sources: ResearchSource[];
  }>;
  prospectConcerns: Array<{
    id: string;
    title: string;
    explanation: string;
    businessImpact: string;
    evidence: string;
    classification: "Verified" | "Strong Indicator" | "Industry-Based Possibility";
    confidence: "high" | "medium" | "low";
    sources: ResearchSource[];
  }>;
  recommendations: Array<{
    concernId: string;
    prospectConcern: string;
    offering: string;
    howItHelps: string;
    businessValue: string;
    outreachAngle: string;
    discoveryQuestion: string;
  }>;
}

export interface OpportunityIntelligence {
  version: 1 | 2 | 3;
  score: number;
  label: "High Priority" | "Strong Fit" | "Possible Fit" | "Low Priority";
  scoreConfidence: "high" | "medium" | "low";
  definition: string;
  breakdown: OpportunityScoreCategory[];
  signals: OpportunitySignal[];
  whyTarget: string;
  potentialNeeds: string[];
  recommendedOutreach: string;
  generatedAt: string | Date;
  /** IT Services-only current, cited research report. */
  itResearch?: ItResearch;
  /** Signed server research handoff for stateless search-to-save flows. */
  researchProof?: string;
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

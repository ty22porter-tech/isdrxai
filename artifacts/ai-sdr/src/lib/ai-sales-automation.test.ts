import { describe, expect, it } from "vitest";
import { generateIntroEmail, generateFollowUpEmail } from "./email-ai";
import { normalizeVertical, VERTICAL_LABELS } from "./recruiting";
import { AI_SALES_BUYER_INDUSTRIES } from "@workspace/db/ai-sales-automation";

describe("AI sales buyer campaigns", () => {
  it("keeps the seller industry distinct from the staffing buyer sector", () => {
    expect(normalizeVertical("ai_sales_automation")).toBe("ai_sales_automation");
    expect(VERTICAL_LABELS.ai_sales_automation).toBe("AI Sales Automation");
    expect(AI_SALES_BUYER_INDUSTRIES).toContain("Recruiting & Staffing");
    for (const generate of [generateIntroEmail, generateFollowUpEmail]) {
      const email = generate({ companyName: "Staffing Agency", contactName: "Pat Smith", industry: "Recruiting & Staffing" }, "ai_sales_automation", { sellerCompanyName: "iSDRX AI" });
      expect(email.body).toContain("Hi Pat,");
      expect(email.body).toMatch(/autonomously/);
      expect(email.body).toMatch(/prospect/i);
      expect(email.body).toMatch(/personaliz/i);
      expect(email.body).not.toMatch(/65%|https?:|cleaning|hiring-needs|candidates/);
    }
  });
});

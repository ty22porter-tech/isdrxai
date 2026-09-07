import { describe, expect, it } from "vitest";
import { parseCompanyDemographicResearchResponse } from "./companyDemographicResearch";

describe("company demographic research", () => {
  it("accepts a cited medium/high confidence employee estimate", () => {
    const result = parseCompanyDemographicResearchResponse({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [
              { type: "url", url: "https://example.com/about" },
              { type: "url", url: "https://www.sec.gov/Archives/example" },
            ],
          },
        },
        {
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              employeeCount: 84,
              confidence: "medium",
              explanation: "The official company profile reports approximately 84 employees.",
            }),
          }],
        },
      ],
    });

    expect(result).toEqual({
      employeeCount: 84,
      confidence: "medium",
      explanation: "The official company profile reports approximately 84 employees.",
      sourceUrls: [
        "https://example.com/about",
        "https://www.sec.gov/Archives/example",
      ],
    });
  });

  it("rejects uncited, low-confidence, or invalid estimates", () => {
    const message = (employeeCount: unknown, confidence: string) => ({
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({ employeeCount, confidence, explanation: "Unsupported estimate." }),
        }],
      }],
    });

    expect(parseCompanyDemographicResearchResponse(message(84, "high"))).toBeUndefined();
    expect(parseCompanyDemographicResearchResponse(message(84, "low"))).toBeUndefined();
    expect(parseCompanyDemographicResearchResponse(message(-1, "high"))).toBeUndefined();
  });
});
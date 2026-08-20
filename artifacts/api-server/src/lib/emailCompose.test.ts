import { describe, expect, it } from "vitest";
import { composeEmail } from "./emailCompose";
import { resolveReplyTo } from "./inboundAddressing";

describe("composeEmail clean tracked-link display", () => {
  it("keeps tracked scheduling and website URLs clickable in HTML but hidden from visible text", () => {
    const result = composeEmail(
      "Thanks for your interest.",
      {
        businessName: "Whitlock Building Services",
        senderName: "Ty Porter",
        outreachEmail: "tporter@whitlockservices.com",
        website: "www.whitlockservices.com",
        businessAddress: "123 Main St, Dallas, TX",
      },
      { companyName: "Prospect Co", unsubscribeToken: "unsubscribe-token" },
      {
        label: "Click here to schedule appointment",
        url: "https://example.com/app/schedule/schedule-token",
      },
      { token: "tracking-token" },
    );

    expect(result.text).toContain("Click here to schedule appointment");
    expect(result.text).toContain("Website: www.whitlockservices.com");
    expect(result.text).not.toContain("/api/t/l/");
    expect(result.html).toContain(">Click here to schedule appointment</a>");
    expect(result.html).toContain('href="https://');
    expect(result.html).toContain("/api/t/l/tracking-token/cta");
    expect(result.html).toContain("/api/t/l/tracking-token/website");
  });
});

describe("outbound Reply-To", () => {
  it("uses the user's outreach email instead of a tokenized routing address", () => {
    expect(resolveReplyTo("rep@company.com", "reply-token")).toBe("rep@company.com");
  });
});
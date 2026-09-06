import { describe, expect, it } from "vitest";
import { composeEmail } from "./emailCompose";
import { resolveReplyTo } from "./inboundAddressing";

describe("composeEmail clean tracked-link display", () => {
  it("keeps tracked scheduling and website URLs clickable in HTML but hidden from visible text", () => {
    const result = composeEmail(
      "Thanks for your interest.",
      {
        businessName: "Acme Facility Services",
        senderName: "Alex Morgan",
        outreachEmail: "alex@example.com",
        website: "www.example.com",
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
    expect(result.text).toContain("Website: www.example.com");
    expect(result.text).not.toContain("/api/t/l/");
    expect(result.html).toContain(">Click here to schedule appointment</a>");
    expect(result.html).toContain('href="https://');
    expect(result.html).toContain("/api/t/l/tracking-token/cta");
    expect(result.html).toContain("/api/t/l/tracking-token/website");
  });
});

describe("outbound Reply-To", () => {
  it("uses the user's address when inbound routing is unavailable", () => {
    const originalDomain = process.env.INBOUND_REPLY_DOMAIN;
    delete process.env.INBOUND_REPLY_DOMAIN;
    expect(resolveReplyTo("rep@company.com", null)).toBe("rep@company.com");
    if (originalDomain === undefined) delete process.env.INBOUND_REPLY_DOMAIN;
    else process.env.INBOUND_REPLY_DOMAIN = originalDomain;
  });

  it("uses a tokenized address when inbound routing is configured", () => {
    const originalDomain = process.env.INBOUND_REPLY_DOMAIN;
    process.env.INBOUND_REPLY_DOMAIN = "reply.example.com";
    expect(resolveReplyTo("rep@company.com", "reply-token")).toBe(
      "reply-reply-token@reply.example.com",
    );
    if (originalDomain === undefined) delete process.env.INBOUND_REPLY_DOMAIN;
    else process.env.INBOUND_REPLY_DOMAIN = originalDomain;
  });
});
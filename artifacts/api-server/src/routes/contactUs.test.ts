import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactUsSchema, escapeHtml } from "./contactUs";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  selectAdmins: vi.fn(),
}));

vi.mock("../lib/emailSender", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));
vi.mock("@workspace/db", () => ({
  notificationsTable: { sourceKey: "sourceKey" },
  usersTable: { id: "id", isAdmin: "isAdmin" },
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: mocks.selectAdmins })) })),
    insert: vi.fn(),
  },
}));

const validRequest = {
  firstName: "Jamie",
  lastName: "Taylor",
  company: "",
  email: "jamie@example.com",
  phone: "312-555-0100",
  message: "I would like to learn more about AI+.",
  website: "",
};

let server: Server;
let baseUrl: string;
let ipSequence = 1;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const { contactUsRouter } = await import("./contactUs");
  app.use(contactUsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server failed to start");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
});

beforeEach(() => {
  mocks.sendEmail.mockReset().mockResolvedValue("email-id");
  mocks.selectAdmins.mockReset().mockResolvedValue([]);
});

async function submit(body: Record<string, unknown>) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${ipSequence++}`,
    },
    body: JSON.stringify(body),
  });
  return { response, json: await response.json() as { ok: boolean; error?: string } };
}

describe("ContactUsSchema", () => {
  it("accepts an optional company and a multiline message", () => {
    const result = ContactUsSchema.safeParse({
      ...validRequest,
      company: undefined,
      message: "First line\nSecond line",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.company).toBe("");
  });

  it.each(["firstName", "lastName", "email", "phone"] as const)(
    "requires %s",
    (field) => {
      expect(ContactUsSchema.safeParse({ ...validRequest, [field]: "" }).success).toBe(false);
    },
  );

  it("accepts an omitted message", () => {
    const { message: _message, ...withoutMessage } = validRequest;
    const result = ContactUsSchema.safeParse(withoutMessage);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe("");
  });

  it("accepts exactly 2000 message characters", () => {
    expect(ContactUsSchema.safeParse({ ...validRequest, message: "a".repeat(2000) }).success).toBe(true);
  });

  it("rejects messages longer than 2000 characters", () => {
    expect(ContactUsSchema.safeParse({ ...validRequest, message: "a".repeat(2001) }).success).toBe(false);
  });

  it("rejects header control characters", () => {
    expect(ContactUsSchema.safeParse({ ...validRequest, firstName: "Jamie\nBcc: bad@example.com" }).success).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("escapes user-controlled HTML before it enters an email body", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quoted'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;",
    );
  });
});

describe("contact-us route", () => {
  it("sends the internal request and customer acknowledgement with escaped HTML", async () => {
    const message = "<strong>Please call me</strong>\nNext week";
    const { response, json } = await submit({ ...validRequest, company: undefined, message });

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);

    const internal = mocks.sendEmail.mock.calls[0][0];
    expect(internal.to).toBe("info@isdrxai.com");
    expect(internal.replyTo).toBe(validRequest.email);
    expect(internal.html).toContain("&lt;strong&gt;Please call me&lt;/strong&gt;<br>Next week");
    expect(internal.html).not.toContain("<strong>Please call me</strong>");

    const acknowledgement = mocks.sendEmail.mock.calls[1][0];
    expect(acknowledgement.to).toBe(validRequest.email);
    expect(acknowledgement.replyTo).toBe("info@isdrxai.com");
    expect(acknowledgement.body).toContain("An agent will contact you to follow up");
    expect(acknowledgement.body).toContain(message);
  });

  it("returns an error when the internal request cannot be delivered", async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error("provider unavailable"));
    const { response, json } = await submit(validRequest);

    expect(response.status).toBe(502);
    expect(json.ok).toBe(false);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("still succeeds when acknowledgement delivery fails after internal delivery", async () => {
    mocks.sendEmail
      .mockResolvedValueOnce("internal-email-id")
      .mockRejectedValueOnce(new Error("provider unavailable"));
    const { response, json } = await submit(validRequest);

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("silently accepts the honeypot without sending email", async () => {
    const { response, json } = await submit({ ...validRequest, website: "https://spam.example" });

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
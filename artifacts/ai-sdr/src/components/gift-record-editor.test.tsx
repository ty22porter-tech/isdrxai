import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { GiftOutreachRecord, GiftOutreachSettings, GiftVideo } from "@workspace/api-client-react";
import { GiftRecordEditor } from "./gift-record-editor";
import { GiftVideoForm } from "./gift-video-editor";
import { giftSequenceProgress, uploadGiftFile } from "@/lib/gift-outreach";

const settings: GiftOutreachSettings = {
  enabled: true, defaultMethod: "per_prospect", daysAfterDelivery: 1, sentOnlyBusinessDays: 3,
  industry: "", serviceDescriptions: "", discussionPoints: "", schedulingLink: "https://schedule.example/owner",
  emailSignature: "", videoHostingPreference: "managed", videoCta: "Watch this message", businessHoursStart: "09:00",
  businessHoursEnd: "17:00", timezone: "America/New_York", allowedDays: [1, 2, 3, 4, 5], automationLevel: "review",
  videoFallback: "pause", maxFollowUpAttempts: 1,
};
const initialRecord: GiftOutreachRecord = {
  id: 9, clientId: "client", prospectId: 1, campaignId: 2, enrollmentId: null, enabledSnapshot: true,
  status: "review", deliverySource: "manual", preparedMethod: "video", dueAt: "2026-01-01T12:00:00Z",
  revision: 1, approvedRevision: null, approvedAt: null, approvedBy: null, attempts: 0, emailId: null,
  sentAt: null, lastError: null, createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
  method: "video", giftSent: true, giftName: "Mug", sentDate: "2026-01-01", preferredName: "Jamie", videoId: 5,
  draftSubject: "Your package", draftBody: "Did your package arrive?",
};
const initialVideo: GiftVideo = {
  id: 5, recordId: 9, prospectId: 1, campaignId: 2, emailId: null, title: "A message", prospectName: "Jamie",
  giftName: "Mug", giftSentDate: "2026-01-01", cta: "Watch", schedulingLink: "https://schedule.example/owner",
  introduction: "", transcript: "", showNameOnThumbnail: true, expiresAt: null, durationSeconds: 20,
  hasThumbnail: true, createdAt: "2026-01-01T12:00:00Z", updatedAt: "2026-01-01T12:00:00Z",
  watchUrl: "https://example.test/api/gift-videos/watch/token", posterUrl: "https://example.test/api/gift-videos/watch/token/poster",
  analyticsAvailable: true,
};
let records: GiftOutreachRecord[];
let video: GiftVideo;
let enrollments: Array<{ id: number; prospectId: number; campaignId: number; currentStep: number; giftMode: boolean; status: string }>;
let requests: Array<{ url: string; method: string; body: Record<string, unknown> }>;
let suggestions: {
  budgetUsd: number;
  generatedAt: string;
  ideas: Array<{ name: string; description: string; estimatedPriceMinUsd: number; estimatedPriceMaxUsd: number; whyFit: string }>;
} | null;
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
function mount(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return {
    client,
    rerender: (next: React.ReactNode) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>),
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  records = [{ ...initialRecord }];
  video = { ...initialVideo };
  enrollments = [];
  requests = [];
  suggestions = null;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    requests.push({ url, method, body });
    if (url === "/api/campaigns") return json([{ id: 2, name: "Campaign" }]);
    if (url === "/api/gift-outreach/settings") return json(settings);
    if (url === "/api/autopilot/enrollments") return json(enrollments);
    if (url === "/api/gift-outreach/prospects/1") return json(records);
    if (url === "/api/gift-outreach/prospects/2") return json([]);
    if (url === "/api/gift-outreach/prospects/1/suggestions" && method === "GET") return json(suggestions);
    if (url === "/api/gift-outreach/prospects/2/suggestions" && method === "GET") return json(null);
    if (url === "/api/gift-outreach/prospects/1/suggestions" && method === "POST") {
      suggestions = {
        budgetUsd: Number(body.budgetUsd),
        generatedAt: "2026-01-01T12:00:00Z",
        ideas: [
          { name: "Desk organizer", description: "A compact organizer.", estimatedPriceMinUsd: 15, estimatedPriceMaxUsd: 25, whyFit: "Useful in a professional office." },
          { name: "Reusable notebook", description: "A reusable work notebook.", estimatedPriceMinUsd: 18, estimatedPriceMaxUsd: 25, whyFit: "Supports everyday meeting notes." },
          { name: "Team snack box", description: "A modest shareable snack box.", estimatedPriceMinUsd: 20, estimatedPriceMaxUsd: 25, whyFit: "Can be shared with an office team." },
        ],
      };
      return json(suggestions);
    }
    if (url === "/api/gift-outreach/records" && method === "POST") {
      records = [{ ...initialRecord, ...body, videoId: null }];
      return json(records[0]);
    }
    if (url === "/api/gift-videos/5" && method === "GET") return json(video);
    if (url === "/api/gift-videos/5" && method === "PATCH") {
      video = { ...video, ...body, hasThumbnail: body.thumbnailUploadId === null ? false : video.hasThumbnail, updatedAt: "2026-01-02T12:00:00Z" };
      records = records.map(r => ({ ...r, revision: r.revision + 1, approvedRevision: null, approvedAt: null, status: "review" }));
      return json(video);
    }
    if (url === "/api/gift-videos/5" && method === "DELETE") {
      records = records.map(r => ({ ...r, videoId: null, approvedRevision: null, revision: r.revision + 1 }));
      return json({ deleted: true });
    }
    if (url === "/api/gift-videos/uploads/request-url") return json({ uploadId: 44, uploadURL: "https://storage.test/put", objectPath: "private/object", expiresAt: "2099-01-01T00:00:00Z" });
    if (url === "https://storage.test/put") return new Response("", { status: 200 });
    if (url === "/api/gift-videos" && method === "POST") return json({ ...initialVideo, ...body });
    if (url === "/api/gift-outreach/records/9" && method === "PATCH") {
      records = records.map(r => ({ ...r, ...body, revision: r.revision + 1, approvedRevision: null }));
      return json(records[0]);
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("gift record and managed video contracts", () => {
  it("loads a video from the video namespace, edits fields, removes its thumbnail and invalidates approval", async () => {
    records[0] = { ...initialRecord, status: "ready", approvedRevision: 1 };
    const user = userEvent.setup();
    mount(<GiftRecordEditor prospectId={1} campaignId={2} />);
    await user.click(await screen.findByRole("button", { name: "Edit Video" }));
    expect(screen.getByRole("button", { name: "Send Manually", hidden: true })).toBeDisabled();
    await user.clear(screen.getByLabelText("Video Title *"));
    await user.type(screen.getByLabelText("Video Title *"), "Updated personal message");
    await user.type(screen.getByLabelText("Short Introduction"), "Hello Jamie");
    await user.type(screen.getByLabelText("Transcript/Captions"), "Thanks for your time.");
    await user.clear(screen.getByLabelText("Prospect Name *"));
    await user.type(screen.getByLabelText("Prospect Name *"), "Jamie Smith");
    await user.clear(screen.getByLabelText("Call to Action text *"));
    await user.type(screen.getByLabelText("Call to Action text *"), "Book a conversation");
    await user.clear(screen.getByLabelText("Scheduling Link *"));
    await user.type(screen.getByLabelText("Scheduling Link *"), "https://schedule.example/new");
    fireEvent.change(screen.getByLabelText("Gift Sent Date *"), { target: { value: "2026-01-03" } });
    await user.click(screen.getByLabelText("Remove custom thumbnail"));
    await user.click(screen.getByLabelText("Show prospect name on thumbnail"));
    await user.click(screen.getByRole("button", { name: "Save Video Changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patch = requests.find(r => r.method === "PATCH" && r.url === "/api/gift-videos/5");
    expect(patch?.body).toMatchObject({
      title: "Updated personal message", introduction: "Hello Jamie", transcript: "Thanks for your time.",
      thumbnailUploadId: null, showNameOnThumbnail: false,
      prospectName: "Jamie Smith", cta: "Book a conversation", schedulingLink: "https://schedule.example/new",
      giftSentDate: "2026-01-03", expiresAt: null,
    });
    expect(patch?.body).not.toHaveProperty("recordId");
    expect(screen.getByText("Updated personal message")).toBeInTheDocument();
    expect(screen.getByText("Generated thumbnail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send Manually" })).toBeDisabled();
    expect(requests.filter(r => r.url === "/api/gift-outreach/prospects/1").length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Remove Video" }));
    await screen.findByRole("button", { name: "Attach Personalized Video" });
    expect(requests.some(r => r.url === "/api/gift-videos/5" && r.method === "DELETE")).toBe(true);
    expect(requests.some(r => r.url.includes("/gift-outreach/videos"))).toBe(false);
  });

  it("blocks preparing and approving unsaved metadata and prevents stale video creation", async () => {
    const user = userEvent.setup();
    mount(<GiftRecordEditor prospectId={1} campaignId={2} />);
    await user.type(await screen.findByLabelText("Preferred Name"), " Smith");
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Re-generate AI Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit Video" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("creates with an explicitly selected per-prospect method and untouched enrollment opt-in", async () => {
    records = [];
    enrollments = [{ id: 8, prospectId: 1, campaignId: 2, currentStep: 1, giftMode: false, status: "active" }];
    const user = userEvent.setup();
    mount(<GiftRecordEditor prospectId={1} campaignId={2} />);
    const create = await screen.findByRole("button", { name: "Start Gift Outreach" });
    expect(create).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Method"), "video");
    await user.click(screen.getByRole("checkbox"));
    await user.click(create);
    await waitFor(() => expect(requests.find(r => r.method === "POST" && r.url === "/api/gift-outreach/records")?.body).toEqual({
      prospectId: 1, campaignId: 2, method: "video", optInEnrollment: true,
    }));
  });

  it("does not force email or invent gift metadata when per-prospect method is undecided", async () => {
    records = [];
    const user = userEvent.setup();
    mount(<GiftRecordEditor prospectId={1} campaignId={2} />);
    await user.click(await screen.findByRole("button", { name: "Start Gift Outreach" }));
    const request = requests.find(r => r.method === "POST" && r.url === "/api/gift-outreach/records");
    expect(request?.body).toEqual({ prospectId: 1, campaignId: 2 });
  });

  it("stages a generated idea in gift name and only persists it on Save Changes without sending", async () => {
    records[0] = { ...initialRecord, giftSent: false, giftName: "", sentDate: null };
    suggestions = {
      budgetUsd: 25,
      generatedAt: "2026-01-01T12:00:00Z",
      ideas: [
        { name: "Desk organizer", description: "A compact organizer.", estimatedPriceMinUsd: 15, estimatedPriceMaxUsd: 25, whyFit: "Useful in a professional office." },
        { name: "Reusable notebook", description: "A reusable work notebook.", estimatedPriceMinUsd: 18, estimatedPriceMaxUsd: 25, whyFit: "Supports everyday meeting notes." },
        { name: "Team snack box", description: "A modest shareable snack box.", estimatedPriceMinUsd: 20, estimatedPriceMaxUsd: 25, whyFit: "Can be shared with an office team." },
      ],
    };
    const user = userEvent.setup();
    mount(<GiftRecordEditor prospectId={1} campaignId={2} />);
    await user.click((await screen.findAllByRole("button", { name: "Use this idea" }))[0]);
    const giftName = screen.getByLabelText("Gift Name");
    expect(giftName).toHaveValue("Desk organizer");
    await user.clear(giftName);
    await user.type(giftName, "Desk organizer — blue");
    expect(giftName).toHaveValue("Desk organizer — blue");
    expect(requests.filter(request => request.method !== "GET")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Send Manually" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(requests.find(request => request.url === "/api/gift-outreach/records/9" && request.method === "PATCH")?.body).toMatchObject({
      giftName: "Desk organizer — blue",
    }));
    expect(requests.some(request => request.url.endsWith("/send"))).toBe(false);
  });

  it("clears generated mutation data and pending choice when navigating to another prospect", async () => {
    records = [];
    const user = userEvent.setup();
    const view = mount(<GiftRecordEditor prospectId={1} campaignId={2} />);
    await user.click(await screen.findByRole("button", { name: "Generate ideas" }));
    await user.click((await screen.findAllByRole("button", { name: "Use this idea" }))[0]);
    expect(screen.getByText(/Pending choice:/)).toHaveTextContent("Desk organizer");

    view.rerender(<GiftRecordEditor prospectId={2} campaignId={2} />);

    await waitFor(() => expect(requests.some(request => request.url === "/api/gift-outreach/prospects/2/suggestions")).toBe(true));
    expect(screen.queryByText("Desk organizer")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending choice:/)).not.toBeInTheDocument();
    expect(await screen.findByText(/No saved ideas yet/)).toBeInTheDocument();
  });

  it("uploads bytes and creates at the video namespace with editable required fields and settings defaults", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    mount(<GiftVideoForm record={{ ...initialRecord, videoId: null, giftName: "", sentDate: null, preferredName: "" }} settings={settings} onSuccess={onSuccess} onSaving={vi.fn()} />);
    expect(screen.getByLabelText("Call to Action text *")).toHaveValue(settings.videoCta);
    expect(screen.getByLabelText("Scheduling Link *")).toHaveValue(settings.schedulingLink);
    expect(screen.getByLabelText("Gift Name *")).toHaveValue("");
    await user.upload(screen.getByLabelText(/Video File/), new File(["mp4"], "message.mp4", { type: "video/mp4" }));
    await user.click(screen.getByRole("button", { name: "Attach Video" }));
    expect(requests).toHaveLength(0);
    await user.type(screen.getByLabelText("Video Title *"), "For Jamie");
    await user.type(screen.getByLabelText("Prospect Name *"), "Jamie");
    await user.type(screen.getByLabelText("Gift Name *"), "Book");
    fireEvent.change(screen.getByLabelText("Gift Sent Date *"), { target: { value: "2026-01-02" } });
    fireEvent.change(screen.getByLabelText(/Expires At/), { target: { value: "2099-01-01T12:00" } });
    expect(Array.from(document.querySelectorAll<HTMLInputElement>("input:not([type=file])")).every(input => input.checkValidity())).toBe(true);
    // jsdom's native required-file validity does not see user-event's FileList.
    fireEvent.submit(screen.getByRole("button", { name: "Attach Video" }).closest("form")!);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(requests.map(r => [r.method, r.url])).toEqual([
      ["POST", "/api/gift-videos/uploads/request-url"], ["PUT", "https://storage.test/put"], ["POST", "/api/gift-videos"],
    ]);
    expect(requests[2].body).toMatchObject({ recordId: 9, uploadId: 44, giftName: "Book", giftSentDate: "2026-01-02", prospectName: "Jamie", cta: settings.videoCta });
    expect(requests[2].body).not.toHaveProperty("objectPath");
    expect(Date.parse(String(requests[2].body.expiresAt))).toBeGreaterThan(Date.now());
  });

  it("rejects invalid files before reserving storage", async () => {
    await expect(uploadGiftFile(new File(["bad"], "clip.webm", { type: "video/webm" }), "video")).rejects.toThrow("MP4");
    expect(requests).toHaveLength(0);
  });
});

describe("gift sequence progress", () => {
  const enrollment = { id: 8, prospectId: 1, campaignId: 2, currentStep: 3, giftMode: true, status: "active" };
  it("retains original seven-step numbering for standard sequences", () => {
    expect(giftSequenceProgress([{ id: 1 }], undefined, undefined, false)).toMatchObject({ nextOriginalStep: 2, displayStep: 2, held: false });
  });
  it("counts a skipped package as original followUp1 without an email", () => {
    expect(giftSequenceProgress([{ id: 1 }], { ...initialRecord, status: "skipped" }, undefined, true)).toMatchObject({ nextOriginalStep: 3, displayStep: 4, held: false });
  });
  it("counts a sent package only once and retains original numbering for later sends", () => {
    expect(giftSequenceProgress([{ id: 1 }, { id: 2 }, { id: 3 }], { ...initialRecord, status: "sent", emailId: 2 }, undefined, true)).toMatchObject({ nextOriginalStep: 4, displayStep: 5, held: false });
  });
  it("holds every autopilot-owned step even after a package is resolved", () => {
    expect(giftSequenceProgress([{ id: 1 }, { id: 3 }, { id: 4 }], { ...initialRecord, status: "skipped" }, enrollment, true)).toMatchObject({ nextOriginalStep: 5, held: true, autopilotOwned: true });
    expect(giftSequenceProgress([{ id: 1 }], undefined, enrollment, false).held).toBe(true);
  });
  it("holds existing records when the master switch is disabled", () => {
    expect(giftSequenceProgress([{ id: 1 }], { ...initialRecord, status: "skipped" }, undefined, false)).toMatchObject({ giftMode: true, held: true, displayStep: 4 });
  });
});
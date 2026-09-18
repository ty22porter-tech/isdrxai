import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Sequences from "./sequences";

const state = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  enrollments: [] as Array<Record<string, unknown>>,
  enabled: true,
  recordError: false,
  create: vi.fn(),
  emails: [{ id: 1, prospectId: 1, campaignId: 2, status: "sent", sentAt: "2020-01-01T12:00:00Z" }],
  campaigns: [{ id: 2, name: "Campaign", status: "active", callScript: JSON.stringify({
    followUp1: { subject: "Package replacement", body: "Legacy follow-up 1", dayDelay: 1 },
    followUp2: { subject: "Value", body: "Original follow-up 2", dayDelay: 1 },
    followUp3: { subject: "Case", body: "Original follow-up 3", dayDelay: 1 },
  }) }],
  prospects: [{ id: 1, companyName: "Company", contactName: "Jamie", email: "jamie@example.test" }],
}));
vi.mock("@workspace/api-client-react", () => ({
  useListEmails: () => ({ data: state.emails }),
  useListCampaigns: () => ({ data: state.campaigns }),
  useListProspects: () => ({ data: state.prospects }),
  useCreateEmail: () => ({ mutate: state.create, isPending: false }),
  useUpdateEmail: () => ({ mutate: vi.fn() }),
  getListEmailsQueryKey: () => ["emails"],
  getListCampaignsQueryKey: () => ["campaigns"],
  listGiftOutreachRecords: async () => {
    if (state.recordError) throw new Error("Record lookup failed");
    return state.records;
  },
  getGiftOutreachSettings: async () => ({ enabled: state.enabled }),
  requestGiftVideoUploadUrl: vi.fn(),
}));
vi.mock("@/components/layout", () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

beforeEach(() => {
  state.records = [];
  state.enrollments = [];
  state.enabled = true;
  state.recordError = false;
  state.emails = [{ id: 1, prospectId: 1, campaignId: 2, status: "sent", sentAt: "2020-01-01T12:00:00Z" }];
  state.create.mockReset().mockImplementation((_input, callbacks) => callbacks.onSuccess());
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/autopilot/enrollments") return new Response(JSON.stringify(state.enrollments), { headers: { "Content-Type": "application/json" } });
    if (url === "/api/openai/generate-email") return new Response("{}", { headers: { "Content-Type": "application/json" } });
    throw new Error(`Unexpected request ${url}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Sequences /></QueryClientProvider>);
}

describe("manual gift sequence queue", () => {
  it.each(["sent", "skipped"])("advances a %s gift replacement and sends original step 3, not display step 4", async status => {
    state.records = [{ id: 9, prospectId: 1, campaignId: 2, status, emailId: status === "sent" ? 2 : null, enrollmentId: null, updatedAt: "2020-01-02T12:00:00Z" }];
    if (status === "sent") state.emails.push({ id: 2, prospectId: 1, campaignId: 2, status: "sent", sentAt: "2020-01-02T12:00:00Z" });
    const user = userEvent.setup();
    mount();
    await screen.findByText("Step 4: Value Add");
    await user.click(screen.getByRole("button", { name: /^Send$/ }));
    await waitFor(() => expect(state.create).toHaveBeenCalledWith(
      { data: expect.objectContaining({ sequenceStep: 3, subject: "Value", body: "Original follow-up 2" }) },
      expect.any(Object),
    ));
  });

  it("holds all gift-autopilot owned sends after the package, with array enrollment responses", async () => {
    state.records = [{ id: 9, prospectId: 1, campaignId: 2, status: "skipped", enrollmentId: 8, updatedAt: "2020-01-02T12:00:00Z" }];
    state.enrollments = [{ id: 8, prospectId: 1, campaignId: 2, giftMode: true, currentStep: 4, status: "active" }];
    state.emails.push({ id: 3, prospectId: 1, campaignId: 2, status: "sent", sentAt: "2020-01-03T12:00:00Z" });
    mount();
    await screen.findByText("Managed by Autopilot");
    expect(screen.getByText("Step 5: Case Study")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send All (0)" })).toBeDisabled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("pauses an existing standalone gift sequence when settings are disabled", async () => {
    state.enabled = false;
    state.records = [{ id: 9, prospectId: 1, campaignId: 2, status: "skipped", enrollmentId: null, updatedAt: "2020-01-02T12:00:00Z" }];
    mount();
    await screen.findByText("Gift sequence paused");
    expect(screen.getByRole("button", { name: "Send All (0)" })).toBeDisabled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("fails closed with an explicit error when gift records cannot be fetched", async () => {
    state.recordError = true;
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Record lookup failed");
    expect(screen.queryByRole("button", { name: /Send/ })).not.toBeInTheDocument();
  });
});
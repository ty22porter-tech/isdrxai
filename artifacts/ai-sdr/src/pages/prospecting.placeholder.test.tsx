import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProspectLead } from "@workspace/api-client-react";

const { search, enrich, create, bulk, toast } = vi.hoisted(() => ({
  search: vi.fn(), enrich: vi.fn(), create: vi.fn(), bulk: vi.fn(), toast: vi.fn(),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/prospecting", vi.fn()] }));
vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { id: "placeholder_test" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@workspace/api-client-react", () => ({
  useProspectSearch: () => ({ mutate: search, isPending: false, isIdle: false }),
  useCreateProspect: () => ({ mutate: create, isPending: false }),
  useBulkCreateProspects: () => ({ mutateAsync: bulk }),
  useEnrichLeads: () => ({ mutateAsync: enrich, isPending: false }),
  useRefreshOpportunityIntelligence: () => ({ mutate: vi.fn(), isPending: false }),
  getListProspectsQueryKey: () => ["prospects"],
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: async () => [] }),
}));

import Prospecting, { isPlaceholderEmail } from "./prospecting";

const lead = (companyName: string, email: string): ProspectLead => ({
  companyName, email, contactName: "Pat", contactTitle: "Owner", industry: "Technology",
  city: "Chicago", state: "IL", phone: "", whyTarget: "Relevant", confidence: "high",
}) as ProspectLead;
const sample = [lead("Acme", " owner@Sub.INVALID.com "), lead("Ready", "person@company.com")];
const requests: { resolve: (value: any) => void; reject: (reason: Error) => void }[] = [];
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Prospecting />
  </QueryClientProvider>,
);
const snapshot = (leads: ProspectLead[], enrichment?: [number, string][]) =>
  localStorage.setItem("prospecting:inprogress:placeholder_test", JSON.stringify({
    savedAt: Date.now(), vertical: "janitorial",
    params: { city: "Chicago", state: "IL", industry: "Technology", count: "10" },
    leads, added: [], skipped: [], failures: [], cancelledRemaining: null,
    duplicateStrategy: "skip", enrichment,
  }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  requests.length = 0;
  enrich.mockImplementation(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  bulk.mockResolvedValue({ added: 1, updated: 0, failed: 0, results: [{ index: 0, success: true, prospect: { id: 12 } }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ businessName: "Seller", vertical: "janitorial" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
});

describe("placeholder contact handling", () => {
  it("identifies synthetic domains without rejecting unrelated real emails", () => {
    for (const email of [" X@INVALID ", " X@A.Invalid ", " X@Invalid.com ", " X@a.INVALID.com "]) {
      expect(isPlaceholderEmail(email)).toBe(true);
    }
    for (const email of ["x@notinvalid.com", "x@invalid.company", "x@valid.com"]) {
      expect(isPlaceholderEmail(email)).toBe(false);
    }
  });

  it("hides restored placeholders, blocks single Add, and adds only real-email rows in Add All", async () => {
    snapshot(sample, [[0, "enriched"]]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Restore list" }));
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Contact lookup not performed");
    expect(screen.queryByText(sample[0].email)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: sample[0].email })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add" })[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add All to Pipeline" }));
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(bulk.mock.calls[0][0].data.prospects.map((p: ProspectLead) => p.email)).toEqual(["person@company.com"]);
    expect(create).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Some contacts need an email lookup" }));
  });

  it("retries a restored failed row only, keeps gift preview available, and saves it after lookup", async () => {
    snapshot(sample, [[0, "failed"], [1, "enriched"]]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Restore list" }));
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Lookup failed");
    expect(screen.getAllByRole("button", { name: "Gift Suggestions" })).toHaveLength(2);
    fireEvent.click(screen.getByTestId("button-retry-contact-lookup-0"));
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(enrich.mock.calls[0][0].data.leads).toHaveLength(1);
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Looking up email");
    expect(screen.getAllByRole("button", { name: "Add" })[0]).toBeDisabled();
    await act(async () => requests[0].resolve({ results: [{
      index: 0, status: "enriched", email: "pat@acme.com", contactName: "Pat Real",
    }] }));
    await waitFor(() => expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("pat@acme.com"));
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    expect(create.mock.calls[0][0].data.email).toBe("pat@acme.com");
  });

  it("allows a failed restored contact to be retried successfully", async () => {
    snapshot(sample, [[0, "not_found"]]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Restore list" }));
    fireEvent.click(screen.getByTestId("button-retry-contact-lookup-0"));
    await act(async () => requests[0].reject(new Error("Unavailable")));
    await waitFor(() => expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Lookup failed"));
    fireEvent.click(screen.getByTestId("button-retry-contact-lookup-0"));
    await act(async () => requests[1].resolve({ results: [{ index: 0, status: "enriched", email: "new@acme.com" }] }));
    await waitFor(() => expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("new@acme.com"));
  });

  it("processes concurrent retry promises independently even when the second finishes first", async () => {
    const two = [sample[0], lead("Second", "contact@second.invalid")];
    snapshot(two, [[0, "not_found"], [1, "failed"]]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Restore list" }));
    fireEvent.click(screen.getByTestId("button-retry-contact-lookup-0"));
    fireEvent.click(screen.getByTestId("button-retry-contact-lookup-1"));
    expect(enrich).toHaveBeenCalledTimes(2);
    expect(enrich.mock.calls[0][0].data.leads[0].companyName).toBe("Acme");
    expect(enrich.mock.calls[1][0].data.leads[0].companyName).toBe("Second");
    await act(async () => requests[1].resolve({ results: [{ index: 0, status: "enriched", email: "person@second.com" }] }));
    expect(screen.getByTestId("text-contact-email-1")).toHaveTextContent("person@second.com");
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Looking up email");
    await act(async () => requests[0].resolve({ results: [{ index: 0, status: "enriched", email: "person@acme.com" }] }));
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("person@acme.com");
    expect(screen.getByTestId("text-contact-email-1")).toHaveTextContent("person@second.com");
  });

  it("does not save synthetic emails while the initial lookup is pending or after not_found", async () => {
    snapshot(sample);
    search.mockImplementation((_vars, callbacks) => callbacks.onSuccess(sample));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Search again" }));
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Looking up email");
    expect(screen.getAllByRole("button", { name: "Add" })[0]).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add All to Pipeline" }));
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(bulk.mock.calls[0][0].data.prospects).toHaveLength(1);
    expect(bulk.mock.calls[0][0].data.prospects[0].email).toBe("person@company.com");
    await act(async () => requests[0].resolve({ results: [
      { index: 0, status: "not_found" }, { index: 1, status: "enriched", email: "person@company.com" },
    ] }));
    expect(screen.getByTestId("text-contact-email-0")).toHaveTextContent("Email not found");
    expect(screen.getByTestId("button-retry-contact-lookup-0")).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { search, enrich, refresh, resultState } = vi.hoisted(() => ({
  search: vi.fn(),
  enrich: vi.fn(() => new Promise(() => {})),
  refresh: vi.fn(() => new Promise(() => {})),
  resultState: { isSuccess: false, isError: false, error: null as Error | null },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/prospecting", vi.fn()] }));
vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { id: "count_test" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// Keep the page's real options and state handlers; avoid Radix's pointer APIs
// (not implemented by jsdom) in this request-contract test.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => (
    <select value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
vi.mock("@workspace/api-client-react", () => ({
  useProspectSearch: () => ({ mutate: search, isPending: false, isIdle: true, ...resultState }),
  useCreateProspect: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkCreateProspects: () => ({ mutateAsync: vi.fn() }),
  useEnrichLeads: () => ({ mutateAsync: enrich, isPending: false }),
  useRefreshOpportunityIntelligence: () => ({ mutateAsync: refresh, isPending: false }),
  getListProspectsQueryKey: () => ["prospects"],
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: async () => [] }),
}));

import Prospecting from "./prospecting";

beforeEach(() => {
  search.mockClear();
  enrich.mockClear();
  refresh.mockClear();
  refresh.mockImplementation(() => new Promise(() => {}));
  resultState.isSuccess = false;
  resultState.isError = false;
  resultState.error = null;
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ businessName: "Synthetic Seller", vertical: "janitorial", website: "https://example.com/" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
});

describe("prospect search count", () => {
  it("offers up to 100 while retaining the default and sends the selected numeric count", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    const countSelect = screen.getByRole("option", { name: "100 prospects" }).closest("select")!;
    expect(countSelect.value).toBe("10");
    for (const count of [5, 10, 15, 20, 25, 50, 75, 100]) {
      expect(screen.getByRole("option", { name: `${count} prospects` })).toBeInTheDocument();
    }
    fireEvent.change(countSelect, { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Chicago"), { target: { value: "Chicago" } });
    const stateSelect = screen.getByRole("option", { name: "IL" }).closest("select")!;
    fireEvent.change(stateSelect, { target: { value: "IL" } });
    const industrySelect = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    fireEvent.change(industrySelect, { target: { value: industrySelect.options[0].value } });
    const generate = screen.getByRole("button", { name: /Generate Leads/i });
    await waitFor(() => expect(generate).not.toBeDisabled());
    fireEvent.click(generate);
    await waitFor(() => expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ city: "Chicago", state: "IL", count: 100 }) }),
      expect.anything(),
    ));
  });
  it("shows an explicit empty-results state", () => {
    resultState.isSuccess = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    expect(screen.getByText("No matching employers found")).toBeInTheDocument();
  });
  it("keeps search errors visible rather than displaying a generic empty result", () => {
    resultState.isError = true;
    resultState.error = new Error("Found employers, but research failed for the selected filters.");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Found employers, but research failed");
    expect(screen.queryByText("No matching employers found")).not.toBeInTheDocument();
  });
  it("lets users review already discovered employers without another search or contact lookup", async () => {
    resultState.isError = true;
    resultState.error = Object.assign(new Error("No verified filter matches."), {
      data: {
        error: "Ten businesses found; no employers matched the selected filters.",
        discoveredCount: 10, researchFailures: 3,
        activeFilters: ["Only employers matching confirmed services"],
        discoveredLeads: [{
          companyName: "Development-only discovered employer", contactName: "Owner",
          contactTitle: "Pending verification", email: "fixture@contact.invalid",
          phone: "", city: "Houston", state: "TX", industry: "Manufacturing",
          confidence: "low", whyTarget: "Hiring needs need validation.",
          outsideSelectedFilters: true,
        }],
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    expect(screen.getByText("Businesses found — no verified filter matches")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review 1 discovered employers" }));
    expect(screen.getByText("Development-only discovered employer")).toBeInTheDocument();
    expect(screen.getByText("Needs filter review")).toBeInTheDocument();
    expect(screen.getByText(/Discovery review only/)).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
    expect(enrich).not.toHaveBeenCalled();
  });

  it("retains postings and enables manual contact lookup after a verified refresh passes the original filters", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      businessName: "Synthetic Recruiter", vertical: "recruiting_staffing",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Manufacturing" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Chicago"), { target: { value: "Dallas" } });
    fireEvent.change(screen.getByRole("option", { name: "TX" }).closest("select")!, { target: { value: "TX" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Only employers matching/ }));
    const generate = screen.getByRole("button", { name: /Generate Leads/i });
    await waitFor(() => expect(generate).not.toBeDisabled());
    fireEvent.click(generate);
    await waitFor(() => expect(search).toHaveBeenCalled());
    const posting = { id: "engineer", title: "Manufacturing Engineer", employer: "Synthetic Employer", location: "Dallas, TX",
      sourceURL: "https://example.com/careers/engineer", status: "unknown", noAgencies: false };
    act(() => search.mock.calls[0][1].onSuccess([{
      companyName: "Synthetic Employer", contactName: "Owner", contactTitle: "Pending verification",
      email: "fixture@contact.invalid", city: "Dallas", state: "TX", industry: "Manufacturing",
      vertical: "recruiting_staffing", researchError: "Research timed out.",
      outsideSelectedFilters: true,
      opportunityScore: 0, scoreLabel: "Research unavailable",
      confidence: "low",
      opportunityIntelligence: { score: 0, label: "Research unavailable", signals: [], itResearch: {
        sellerVertical: "recruiting_staffing", industryChallenges: [], prospectConcerns: [], recommendations: [],
        warnings: [], industrySources: [], recruiting: { jobs: [posting], growthSignals: [],
          employerIdentity: "unverified", automationSuppressed: true, suppressionReasons: [],
          commercialFit: 0, uniqueActiveJobs: 0, sourceCoverage: [] },
      } },
    }]));
    expect(screen.getByTestId("button-retry-contact-lookup-0")).toBeDisabled();
    refresh.mockResolvedValueOnce({ outsideSelectedFilters: false, opportunityIntelligence: {
      score: 40, label: "Possible Fit", signals: [], itResearch: {
        sellerVertical: "recruiting_staffing", industryRelationship: "match", industryChallenges: [],
        prospectConcerns: [], industrySources: [], warnings: [], recommendations: [{
          concernId: "engineer", offering: "temp to hire", howItHelps: "Fill the engineering opening",
          businessValue: "Production coverage", sellerEvidence: { availability: "user_approved", sources: [] },
        }], recruiting: { jobs: [{ ...posting, status: "active" }], growthSignals: [],
          employerIdentity: "confirmed", automationSuppressed: false, suppressionReasons: [],
          commercialFit: 80, uniqueActiveJobs: 1, sourceCoverage: [] },
      },
    } });
    fireEvent.click(screen.getByText("View Score Breakdown"));
    fireEvent.click(screen.getAllByRole("button", { name: /Refresh Intelligence/i })[0]);
    expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      discoveredHiring: [posting], selectedIndustry: "Manufacturing",
      searchContext: expect.objectContaining({ city: "Dallas", state: "TX" }),
    }) }));
    expect(enrich).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("button-retry-contact-lookup-0")).not.toBeDisabled());
    expect(screen.queryByText("Needs filter review")).not.toBeInTheDocument();
    expect(screen.queryByText("low fit")).not.toBeInTheDocument();
    expect(screen.getByTestId("badge-prospect-fit-0")).toHaveTextContent("Possible Fit");
    enrich.mockResolvedValueOnce({ results: [{ index: 0, status: "enriched",
      contactName: "Synthetic Manager", email: "manager@example.com", title: "Plant Manager", phone: "+18775550101",
    }] });
    fireEvent.click(screen.getByTestId("button-retry-contact-lookup-0"));
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("manager@example.com")).toBeInTheDocument();
    expect(screen.getByText("(toll-free; direct line unverified)")).toBeInTheDocument();
  });
  it("warns an unreviewed recruiting seller before a confirmed-service search", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        businessName: "Development-only unreviewed seller", vertical: "recruiting_staffing",
        sellerIntelligenceProfile: { status: "needs_review" },
      }), { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    expect(await screen.findByText(/Your Recruiting company profile needs review/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review services in Settings" })).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });
  it("displays a research-failed employer without automatically spending a contact lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ businessName: "Synthetic Recruiter", vertical: "recruiting_staffing" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);
    const manufacturing = await screen.findByRole("button", { name: "Manufacturing" });
    fireEvent.click(manufacturing);
    fireEvent.change(screen.getByPlaceholderText("e.g. Chicago"), { target: { value: "Houston" } });
    fireEvent.change(screen.getByRole("option", { name: "TX" }).closest("select")!, { target: { value: "TX" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Only employers matching/ }));
    const generate = screen.getByRole("button", { name: /Generate Leads/i });
    await waitFor(() => expect(generate).not.toBeDisabled());
    fireEvent.click(generate);
    await waitFor(() => expect(search).toHaveBeenCalled());
    act(() => search.mock.calls[0][1].onSuccess([{
      companyName: "Development-only employer fixture", contactName: "Owner",
      contactTitle: "Decision maker (pending enrichment)", email: "fixture@contact.invalid",
      phone: "", city: "Houston", state: "TX", industry: "Manufacturing",
      vertical: "recruiting_staffing", confidence: "low",
      whyTarget: "Hiring needs remain unverified.", researchError: "Research timed out.",
    }]));
    expect(screen.getByText("Development-only employer fixture")).toBeInTheDocument();
    expect(screen.getByText(/Automatic contact lookup was skipped/)).toBeInTheDocument();
    expect(screen.getByText("Research error: Research timed out.")).toBeInTheDocument();
    expect(screen.getByText("Hiring fit unverified")).toBeInTheDocument();
    expect(enrich).not.toHaveBeenCalled();
  });
});

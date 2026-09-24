import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { search, create } = vi.hoisted(() => ({ search: vi.fn(), create: vi.fn() }));
vi.mock("wouter", () => ({ useLocation: () => ["/prospecting", vi.fn()] }));
vi.mock("@clerk/react", () => ({ useUser: () => ({ user: { id: "gift-search-test" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ Layout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/gift-record-editor", () => ({
  GiftSuggestionsPanel: ({ prospectId }: { prospectId: number }) => <div>saved suggestions for {prospectId}</div>,
}));
vi.mock("@/components/prospect-gift-suggestion-preview", () => ({
  ProspectGiftSuggestionPreview: ({ identity }: { identity: { companyName: string } }) => <div>unsaved preview for {identity.companyName}</div>,
}));
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
  useProspectSearch: () => ({ mutate: search, isPending: false, isIdle: false }),
  useCreateProspect: () => ({ mutate: create, isPending: false }),
  useBulkCreateProspects: () => ({ mutateAsync: vi.fn() }),
  useEnrichLeads: () => ({ mutateAsync: vi.fn(() => new Promise(() => {})), isPending: false }),
  useRefreshOpportunityIntelligence: () => ({ mutate: vi.fn(), isPending: false }),
  refreshOpportunityIntelligence: vi.fn(),
  getListProspectsQueryKey: () => ["prospects"],
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: async () => [] }),
}));

import Prospecting from "./prospecting";

const lead = {
  companyName: "Acme Manufacturing",
  contactName: "Jamie Rivera",
  contactTitle: "Operations Director",
  email: "jamie@acme.example",
  phone: "555-0100",
  industry: "Manufacturing",
  city: "Columbus",
  state: "OH",
  address: "1 Main St",
  website: "https://acme.example",
  confidence: "high",
  whyTarget: "Commercial prospect",
  potentialNeeds: [],
};

beforeEach(() => {
  search.mockReset();
  create.mockReset();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(
    JSON.stringify({ businessName: "Seller", vertical: "janitorial" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )));
});

describe("prospect search gift suggestions", () => {
  it("opens stateless preview before save and the saved panel after an explicit Add", async () => {
    search.mockImplementation((_input, options) => options.onSuccess([lead]));
    create.mockImplementation((_input, options) => options.onSuccess({ id: 99 }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Prospecting /></QueryClientProvider>);

    fireEvent.change(screen.getByPlaceholderText("e.g. Chicago"), { target: { value: "Columbus" } });
    fireEvent.change(screen.getByRole("option", { name: "OH" }).closest("select")!, { target: { value: "OH" } });
    const industry = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    fireEvent.change(industry, { target: { value: industry.options[0].value } });
    const generate = screen.getByRole("button", { name: /Generate Leads/i });
    await waitFor(() => expect(generate).not.toBeDisabled());
    fireEvent.click(generate);

    const giftButton = await screen.findByRole("button", { name: "Gift Suggestions" });
    fireEvent.click(giftButton);
    expect(await screen.findByText("unsaved preview for Acme Manufacturing")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Gift Suggestions" }));
    expect(await screen.findByText("saved suggestions for 99")).toBeInTheDocument();
  });
});
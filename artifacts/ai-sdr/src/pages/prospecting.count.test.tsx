import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
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
  useProspectSearch: () => ({ mutate: search, isPending: false, isIdle: true }),
  useCreateProspect: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkCreateProspects: () => ({ mutateAsync: vi.fn() }),
  useEnrichLeads: () => ({ mutateAsync: vi.fn(() => new Promise(() => {})), isPending: false }),
  useRefreshOpportunityIntelligence: () => ({ mutate: vi.fn(), isPending: false }),
  getListProspectsQueryKey: () => ["prospects"],
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: async () => [] }),
}));

import Prospecting from "./prospecting";

beforeEach(() => {
  search.mockClear();
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
});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProspectLead } from "@workspace/api-client-react";

// setLocation captured from the mocked wouter hook so we can assert in-app
// navigation actually happened (or didn't).
const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/prospecting", setLocationMock],
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "user_test" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// The real Layout drags in Clerk, react-query fetches, etc. We only need a
// sidebar anchor so the document-level click interceptor has something to catch.
// wouter <Link> renders a plain <a>, so a plain anchor faithfully reproduces the
// element the guard actually intercepts.
vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => (
    <div>
      <nav>
        {/* Mimics a wouter <Link>: real SPA anchor that suppresses the browser's
            full-document navigation. The guard's capture-phase interceptor runs
            before this handler and stops propagation when it fires. */}
        <a href="/dashboard" onClick={(e) => e.preventDefault()}>
          Dashboard
        </a>
      </nav>
      {children}
    </div>
  ),
}));

vi.mock("@workspace/api-client-react", () => ({
  useProspectSearch: () => ({ mutate: vi.fn(), isPending: false, isIdle: true }),
  // Immediately resolve the add so we can drive a lead from un-added to added.
  useCreateProspect: () => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    isPending: false,
  }),
  useBulkCreateProspects: () => ({ mutateAsync: vi.fn() }),
  getListProspectsQueryKey: () => ["prospects"],
  // Restore reconciles against the pipeline; an empty pipeline leaves the
  // restored state untouched, which is what these guard tests rely on.
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: async () => [] }),
}));

import Prospecting from "./prospecting";

const makeLead = (name: string): ProspectLead =>
  ({
    companyName: name,
    contactName: "Jane Doe",
    contactTitle: "Facilities Manager",
    email: `${name.toLowerCase()}@example.com`,
    phone: "555-0100",
    industry: "Healthcare",
    city: "Chicago",
    state: "IL",
    website: "https://example.com",
    whyTarget: "Large facility with cleaning needs",
    estimatedEmployees: 120,
    estimatedSquareFootage: 50000,
    confidence: "high",
  }) as ProspectLead;

type Snapshot = {
  savedAt: number;
  params: { city: string; state: string; industry: string; count: string };
  leads: ProspectLead[];
  added: number[];
  skipped: number[];
  failures: [number, string][];
  cancelledRemaining: number[] | null;
  duplicateStrategy: "skip" | "update";
};

const seedSnapshot = (snap: Partial<Snapshot>) => {
  const full: Snapshot = {
    savedAt: Date.now(),
    params: { city: "Chicago", state: "IL", industry: "Healthcare", count: "10" },
    leads: [],
    added: [],
    skipped: [],
    failures: [],
    cancelledRemaining: null,
    duplicateStrategy: "skip",
    ...snap,
  };
  localStorage.setItem("prospecting:inprogress:user_test", JSON.stringify(full));
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Prospecting />
    </QueryClientProvider>,
  );
};

// Restore a seeded in-progress list into component state, which is the cleanest
// deterministic way to put the page into an "unsaved list" state without driving
// the full search + add flow.
const restoreList = async () => {
  const restoreBtn = await screen.findByRole("button", { name: /Restore list/i });
  fireEvent.click(restoreBtn);
};

const leaveDialog = () =>
  screen.queryByText(/Leave without adding these prospects\?/i);

beforeEach(() => {
  setLocationMock.mockClear();
  localStorage.clear();
});

describe("Prospecting leave-page guard", () => {
  it("triggers the confirm dialog on sidebar link navigation while un-added leads remain", async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    expect(leaveDialog()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));

    await waitFor(() => expect(leaveDialog()).toBeInTheDocument());
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it('"Stay on this page" keeps the list intact and does not navigate', async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    await waitFor(() => expect(leaveDialog()).toBeInTheDocument());

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Stay on this page/i }));

    await waitFor(() => expect(leaveDialog()).not.toBeInTheDocument());
    expect(setLocationMock).not.toHaveBeenCalled();
    // The list is still on screen — nothing was cleared.
    expect(screen.getByText("Globex")).toBeInTheDocument();
  });

  it('"Leave anyway" navigates to the target route', async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    await waitFor(() => expect(leaveDialog()).toBeInTheDocument());

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Leave anyway/i }));

    await waitFor(() => expect(setLocationMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("triggers the warning from a cancelled Add-all highlight even with no other un-added leads", async () => {
    // All leads are added, so hasUnaddedLeads is false; the only trigger is the
    // cancelledRemaining highlight. This guards against a refactor that computes
    // the unsaved state from un-added leads alone.
    seedSnapshot({
      leads: [makeLead("Acme"), makeLead("Globex")],
      added: [0, 1],
      cancelledRemaining: [1],
    });
    renderPage();
    await restoreList();

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));

    await waitFor(() => expect(leaveDialog()).toBeInTheDocument());
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it("does NOT trigger the warning once every lead has been added", async () => {
    // Restore a list with one lead still un-added, then add it so the whole list
    // is saved. Navigation should now be silent.
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    await waitFor(() => expect(screen.getAllByText(/Added/i).length).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));

    // Give any effect a chance to attach; the guard should stay silent.
    await waitFor(() => expect(screen.getByText("Globex")).toBeInTheDocument());
    expect(leaveDialog()).not.toBeInTheDocument();
  });

  it("does NOT trigger the warning when no search has run", async () => {
    renderPage();

    // No restore affordance because there's nothing saved.
    expect(screen.queryByRole("button", { name: /Restore list/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));

    await waitFor(() => expect(screen.getByText("Prospect Search")).toBeInTheDocument());
    expect(leaveDialog()).not.toBeInTheDocument();
  });
});

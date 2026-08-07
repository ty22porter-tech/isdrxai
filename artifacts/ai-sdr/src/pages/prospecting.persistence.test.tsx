import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProspectLead } from "@workspace/api-client-react";

vi.mock("wouter", () => ({
  useLocation: () => ["/prospecting", vi.fn()],
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "user_test" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Leads the mocked prospect-search mutation returns. Mutated per-test.
let searchResults: ProspectLead[] = [];

vi.mock("@workspace/api-client-react", () => ({
  useProspectSearch: () => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: (data: ProspectLead[]) => void }) => {
      opts?.onSuccess?.(searchResults);
    },
    isPending: false,
    isIdle: false,
  }),
  useCreateProspect: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkCreateProspects: () => ({ mutateAsync: vi.fn() }),
  useEnrichLeads: () => ({ mutate: vi.fn(), isPending: false }),
  getListProspectsQueryKey: () => ["prospects"],
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: async () => [] }),
}));

import Prospecting from "./prospecting";

const STORAGE_KEY = "prospecting:inprogress:user_test";

const makeLead = (name: string): ProspectLead =>
  ({
    companyName: name,
    contactName: "Jane Doe",
    contactTitle: "Facilities Manager",
    email: `${name.toLowerCase()}@example.com`,
    phone: "555-0100",
    industry: "Technology",
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

const seedSnapshot = (snap: Partial<Snapshot>): Snapshot => {
  const full: Snapshot = {
    savedAt: Date.now(),
    params: { city: "Chicago", state: "IL", industry: "Technology", count: "10" },
    leads: [],
    added: [],
    skipped: [],
    failures: [],
    cancelledRemaining: null,
    duplicateStrategy: "skip",
    ...snap,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  return full;
};

const readSnapshot = (): Snapshot | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Snapshot) : null;
};

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Prospecting />
    </QueryClientProvider>,
  );
};

const restoreList = async () => {
  const restoreBtn = await screen.findByRole("button", { name: /Restore list/i });
  fireEvent.click(restoreBtn);
};

beforeEach(() => {
  localStorage.clear();
  searchResults = [];
  // The component gates hydration on the /api/users/me query succeeding
  // (verticalLoaded). Provide a minimal stub so the effect can run.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/users/me")) {
        return new Response(JSON.stringify({ vertical: "janitorial" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
});

describe("Prospecting persistence: leaving and returning", () => {
  it("offers a restore banner on return instead of auto-restoring the list", async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();

    expect(await screen.findByText("Pick up where you left off")).toBeInTheDocument();
    expect(
      screen.getByText(/unfinished list of 2 prospects in Chicago, IL — Technology \(1 not yet added\)/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Restore list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start fresh/i })).toBeInTheDocument();
    // The list itself is not shown until the user chooses to restore.
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();
  });

  it("does not clobber the saved snapshot while the restore decision is pending", async () => {
    const seeded = seedSnapshot({
      savedAt: Date.now() - 60_000,
      leads: [makeLead("Acme"), makeLead("Globex")],
      added: [0],
    });
    renderPage();

    await screen.findByText("Pick up where you left off");
    // The save effect must hold off while the banner is up — the snapshot on
    // disk is byte-for-byte what was seeded, not an empty-state overwrite.
    const current = readSnapshot();
    expect(current).not.toBeNull();
    expect(current!.savedAt).toBe(seeded.savedAt);
    expect(current!.leads).toHaveLength(2);
    expect(current!.added).toEqual([0]);
  });

  it("Restore list brings back the leads with added/skipped status and search params intact", async () => {
    seedSnapshot({
      leads: [makeLead("Acme"), makeLead("Globex"), makeLead("Initech")],
      added: [0],
      skipped: [1],
    });
    renderPage();
    await restoreList();

    // All three leads are back.
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Globex")).toBeInTheDocument();
    expect(screen.getByText("Initech")).toBeInTheDocument();
    // Added status intact on lead 0.
    expect(screen.getByRole("button", { name: /Added/i })).toBeDisabled();
    // Skipped ("already in pipeline") status intact on lead 1.
    expect(screen.getByText("Already in pipeline")).toBeInTheDocument();
    // Summary counts both without double-counting.
    expect(screen.getByText(/1 of 3 added · 1 already in pipeline/)).toBeInTheDocument();
    // Search params are repopulated.
    expect(screen.getByPlaceholderText("e.g. Chicago")).toHaveValue("Chicago");
  });

  it("re-saves the restored list so leaving and returning again still offers restore", async () => {
    // Lead 0 added, lead 1 skipped (already in pipeline), lead 2 genuinely
    // unadded — the list still has work to do, so it must be re-persisted.
    seedSnapshot({
      leads: [makeLead("Acme"), makeLead("Globex"), makeLead("Initech")],
      added: [0],
      skipped: [1],
    });
    const first = renderPage();
    await restoreList();
    await screen.findByText("Initech");

    // The save effect re-persists the restored (still unfinished) list.
    await waitFor(() => {
      const snap = readSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.leads).toHaveLength(3);
      expect(snap!.added).toEqual([0]);
      expect(snap!.skipped).toEqual([1]);
    });

    // Simulate leaving and returning: unmount, then mount a fresh instance.
    first.unmount();
    renderPage();

    expect(await screen.findByText("Pick up where you left off")).toBeInTheDocument();
    await restoreList();
    expect(await screen.findByText("Initech")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Added/i })).toBeDisabled();
    expect(screen.getByText("Already in pipeline")).toBeInTheDocument();
  });

  it("generating a new list after restore overwrites the snapshot with the new leads", async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    searchResults = [makeLead("Hooli"), makeLead("Umbrella"), makeLead("Soylent")];
    renderPage();
    await restoreList();
    await screen.findByText("Acme");

    // Re-running the search (params were repopulated by restore) first warns
    // about discarding, then replaces the list.
    fireEvent.click(screen.getByRole("button", { name: /Generate Leads/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Discard and search/i }));

    expect(await screen.findByText("Hooli")).toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    await waitFor(() => {
      const snap = readSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.leads.map((l) => l.companyName)).toEqual(["Hooli", "Umbrella", "Soylent"]);
      expect(snap!.added).toEqual([]);
    });
  });
});

describe("Prospecting persistence: Start fresh", () => {
  it("clears the saved snapshot and hides the banner", async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")] });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Start fresh/i }));

    expect(screen.queryByText("Pick up where you left off")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not offer the snapshot again on a later return", async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")] });
    const first = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Start fresh/i }));
    first.unmount();

    renderPage();
    // Give the hydration effect a tick to run, then assert nothing is offered.
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(screen.queryByText("Pick up where you left off")).not.toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
  });
});

describe("Prospecting persistence: snapshots that should not be offered", () => {
  it("discards a snapshot older than the max age instead of offering it", async () => {
    seedSnapshot({
      savedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
      leads: [makeLead("Acme")],
    });
    renderPage();

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(screen.queryByText("Pick up where you left off")).not.toBeInTheDocument();
  });

  it("discards a fully-added snapshot instead of offering it", async () => {
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0, 1] });
    renderPage();

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(screen.queryByText("Pick up where you left off")).not.toBeInTheDocument();
  });

  it("clears a corrupt snapshot instead of crashing", async () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    renderPage();

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    expect(screen.queryByText("Pick up where you left off")).not.toBeInTheDocument();
  });
});

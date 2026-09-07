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

// Pipeline contents the restore reconciliation will fetch. Mutated per-test.
let pipeline: { email: string }[] = [];
let pipelineFetch: () => Promise<{ email: string }[]>;

vi.mock("@workspace/api-client-react", () => ({
  useProspectSearch: () => ({ mutate: vi.fn(), isPending: false, isIdle: true }),
  useCreateProspect: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkCreateProspects: () => ({ mutateAsync: vi.fn() }),
  useEnrichLeads: () => ({ mutate: vi.fn(), isPending: false }),
  getListProspectsQueryKey: () => ["prospects"],
  getListProspectsQueryOptions: () => ({ queryKey: ["prospects"], queryFn: () => pipelineFetch() }),
}));

import Prospecting from "./prospecting";

const makeLead = (name: string, email?: string): ProspectLead =>
  ({
    companyName: name,
    contactName: "Jane Doe",
    contactTitle: "Facilities Manager",
    email: email ?? `${name.toLowerCase()}@example.com`,
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

const restoreList = async () => {
  const restoreBtn = await screen.findByRole("button", { name: /Restore list/i });
  fireEvent.click(restoreBtn);
};

beforeEach(() => {
  localStorage.clear();
  pipeline = [];
  pipelineFetch = async () => pipeline;
  // The component gates hydration on the /api/users/me query succeeding
  // (verticalLoaded). Provide a minimal stub so the effect can run.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/users/me")) {
        return new Response(JSON.stringify({ vertical: "janitorial", website: "https://example.com/" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
});

describe("Prospecting restore pipeline reconciliation", () => {
  it("marks a not-yet-added lead as already in pipeline when its email exists in the pipeline", async () => {
    // Snapshot thinks Globex was never added, but it was added elsewhere since.
    pipeline = [{ email: "globex@example.com" }];
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    await waitFor(() => expect(screen.getByText("Already in pipeline")).toBeInTheDocument());
    // Summary shows the reconciled lead separately — no double-counting as "added".
    expect(screen.getByText(/1 of 2 added · 1 already in pipeline/)).toBeInTheDocument();
  });

  it("matches emails case-insensitively and with surrounding whitespace, like the server", async () => {
    pipeline = [{ email: "  GLOBEX@Example.COM " }];
    seedSnapshot({ leads: [makeLead("Globex")] });
    renderPage();
    await restoreList();

    await waitFor(() => expect(screen.getByText("Already in pipeline")).toBeInTheDocument());
  });

  it("does not touch leads the snapshot already counts as added", async () => {
    // Acme is in the pipeline AND already marked added in the snapshot; Globex
    // is un-added and not in the pipeline (so the snapshot is still restorable).
    pipeline = [{ email: "acme@example.com" }];
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    // Acme stays "Added" — never re-labelled or double-counted.
    await waitFor(() => expect(screen.getByText(/1 of 2 added/)).toBeInTheDocument());
    expect(screen.queryByText("Already in pipeline")).not.toBeInTheDocument();
    expect(screen.queryByText(/already in pipeline/)).not.toBeInTheDocument();
  });

  it("clears a stale failure and the cancelled-run highlight for reconciled leads", async () => {
    pipeline = [{ email: "globex@example.com" }];
    seedSnapshot({
      leads: [makeLead("Acme"), makeLead("Globex")],
      added: [0],
      failures: [[1, "Network error"]],
      cancelledRemaining: [1],
    });
    renderPage();
    await restoreList();

    await waitFor(() => expect(screen.getByText("Already in pipeline")).toBeInTheDocument());
    expect(screen.queryByText(/Couldn't add/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still need adding/)).not.toBeInTheDocument();
    expect(screen.queryByText("Not yet added")).not.toBeInTheDocument();
  });

  it("leaves restored state untouched when the pipeline fetch fails", async () => {
    pipelineFetch = async () => {
      throw new Error("network down");
    };
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")], added: [0] });
    renderPage();
    await restoreList();

    await waitFor(() => expect(screen.getByText("Globex")).toBeInTheDocument());
    expect(screen.getByText(/1 of 2 added/)).toBeInTheDocument();
    expect(screen.queryByText("Already in pipeline")).not.toBeInTheDocument();
  });

  it("leaves leads alone when their emails are not in the pipeline", async () => {
    pipeline = [{ email: "someone-else@example.com" }];
    seedSnapshot({ leads: [makeLead("Acme"), makeLead("Globex")] });
    renderPage();
    await restoreList();

    await waitFor(() => expect(screen.getByText("Globex")).toBeInTheDocument());
    expect(screen.getByText(/0 of 2 added/)).toBeInTheDocument();
    expect(screen.queryByText("Already in pipeline")).not.toBeInTheDocument();
  });
});

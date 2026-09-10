import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { addToAutopilotProspectSelection } from "@/lib/autopilot-prospect-selection";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { id: "user_test" }, isLoaded: true }),
}));

vi.mock("@/components/layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import AutopilotPage from "./autopilot";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AutopilotPage />
    </QueryClientProvider>,
  );
}

async function openDialog() {
  const button = await screen.findByRole("button", { name: /Add Prospects/i });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe("Autopilot prospect selection dialog", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/users/me")) return jsonResponse({ autopilotReady: true });
        if (url.endsWith("/api/autopilot/enrollments")) return jsonResponse([]);
        if (url.endsWith("/api/campaigns")) return jsonResponse([]);
        if (url.endsWith("/api/prospects")) {
          return jsonResponse([
            { id: 1, companyName: "Older Pipeline Prospect", contactName: "Old Contact", email: "old@example.com", status: "new" },
            { id: 2, companyName: "Selected Company One", contactName: "Jane One", email: "one@example.com", status: "new" },
            { id: 3, companyName: "Selected Company Two", contactName: "Jane Two", email: "two@example.com", status: "new" },
          ]);
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
  });

  it("shows only prospects just added from search and selects all of them", async () => {
    addToAutopilotProspectSelection("user_test", [2, 3]);
    renderPage();

    await openDialog();

    expect(await screen.findByText("Selected Company One")).toBeInTheDocument();
    expect(screen.getByText("Selected Company Two")).toBeInTheDocument();
    expect(screen.queryByText("Older Pipeline Prospect")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Select all \(2\)/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start Autopilot (2)" })).toBeEnabled();
    });
  });

  it("shows guidance instead of all pipeline prospects when nothing was just added", async () => {
    renderPage();

    await openDialog();

    expect(await screen.findByText("No newly added prospects")).toBeInTheDocument();
    expect(screen.queryByText("Older Pipeline Prospect")).not.toBeInTheDocument();
  });
});
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
vi.mock("@/components/layout", () => ({ Layout: ({ children }: any) => <div>{children}</div> }));
import HelpTraining from "./help";
import guide from "../../../../docs/training/isdrxai-user-guide.md?raw";
import { parseGuide, searchGuide } from "@/lib/training-guide";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState(null, "", "/");
});
afterEach(() => window.history.replaceState(null, "", "/"));

describe("Help & Training", () => {
  it("renders the actual guide with navigation, accessible tables, and literal merge fields", () => {
    render(<HelpTraining />);
    expect(screen.getByRole("heading", { name: "Help & Training", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search the training guide" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Training sections" });
    for (const name of ["Settings", "Prospect Search", "Campaigns", "Gift Outreach", "Calls", "Caller Workspace", "Billing"]) {
      expect(within(nav).getByRole("link", { name, exact: true })).toHaveAttribute("href", expect.stringMatching(/^#/));
      expect(screen.getByRole("heading", { name, level: 2, exact: true })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("table").length).toBeGreaterThan(5);
    expect(screen.getAllByText("{{jobOpenings}}", { exact: true }).length).toBeGreaterThan(0);
  });

  it("filters by content, announces no results, and restores the guide", () => {
    render(<HelpTraining />);
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "callback requested" } });
    expect(screen.getByRole("heading", { name: "Caller Workspace", exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Billing", exact: true })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zzzznoresults" } });
    expect(screen.getByRole("heading", { name: "No matching sections" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 matching sections");
    fireEvent.click(screen.getByRole("button", { name: "Show all topics" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Billing", exact: true })).toBeInTheDocument();
  });

  it("clears filtering before navigating to a section and keeps a shareable anchor", async () => {
    render(<HelpTraining />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "gift" } });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Training sections" })).getByRole("link", { name: "Gift Outreach", exact: true }));
    expect(window.location.hash).toBe("#gift-outreach");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("keeps every guide section and internal section link discoverable", () => {
    const sections = parseGuide(guide);
    expect(new Set(sections.map(section => section.id)).size).toBe(sections.length);
    const links = [...guide.matchAll(/\]\(#([^)]*)\)/g)].map(match => match[1]);
    expect(links.every(id => sections.some(section => section.id === id))).toBe(true);
    expect(searchGuide(sections, "  FIT   scores ").length).toBeGreaterThan(0);
  });
});

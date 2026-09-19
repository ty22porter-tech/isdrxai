import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GiftShoppingLinks, giftShoppingLinks } from "./gift-shopping-links";

afterEach(cleanup);

describe("gift shopping links", () => {
  it("encodes the gift name without allowing it to change retailer destinations", () => {
    const name = 'Notebook & pen / café? #gift https://untrusted.example';
    const links = giftShoppingLinks(name);
    expect(links.map(link => new URL(link.url).hostname)).toEqual([
      "www.amazon.com", "www.target.com", "www.etsy.com",
    ]);
    expect(new URL(links[0].url).searchParams.get("k")).toBe(name);
    expect(new URL(links[1].url).searchParams.get("searchTerm")).toBe(name);
    expect(new URL(links[2].url).searchParams.get("q")).toBe(name);
  });

  it("renders clearly labeled safe search links for existing saved ideas", () => {
    render(<GiftShoppingLinks giftName="Desk notebook" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("aria-label")).toContain("Desk notebook");
    }
    expect(screen.getByText(/not verified product listings/)).toBeTruthy();
  });

  it("does not render empty searches", () => {
    const { container } = render(<GiftShoppingLinks giftName="  " />);
    expect(container.innerHTML).toBe("");
  });
});
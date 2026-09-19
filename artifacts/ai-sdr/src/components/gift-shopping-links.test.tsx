import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

  it("shows precise checked-offer ranking, unknown tax, and real purchase links", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <GiftShoppingLinks
          giftName="Desk notebook"
          prospectId={7}
          ideaIndex={0}
          savedComparison={{
            giftName: "Desk notebook",
            ideaSignature: "saved-signature",
            checkedAt: "2025-01-01T00:00:00.000Z",
            status: "offers_found",
            rankingBasis: "lowest_listed_item_price_delivery_unconfirmed",
            taxKnown: false,
            offers: [{
              itemName: "Hardcover notebook",
              merchant: "Example Stationer",
              itemPriceUsd: 12.5,
              shippingKnown: false,
              shippingPriceUsd: null,
              availability: "available",
              url: "https://stationer.example/products/notebook",
              priceExcerpt: "Hardcover notebook $12.50",
              sourceCheckedAt: "2025-01-01T00:00:00.000Z",
            }],
          }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Lowest listed item price among checked offers; delivery unconfirmed/)).toBeTruthy();
    expect(screen.getByText(/Taxes are unknown and excluded/)).toBeTruthy();
    const purchaseLink = screen.getByRole("link", { name: /Example Stationer/ });
    expect(purchaseLink.getAttribute("href")).toBe("https://stationer.example/products/notebook");
    expect(purchaseLink.getAttribute("target")).toBe("_blank");
  });
});
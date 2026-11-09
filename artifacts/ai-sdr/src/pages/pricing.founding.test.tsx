import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/layout", () => ({ Layout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), trackConversionClick: vi.fn() }));
import Pricing from "./pricing";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/products") ? { products: [{ name: "iSDRX AI", monthlyPriceId: "price_base_499" }, { name: "iSDRX AI Growth", monthlyPriceId: "price_growth_749" }] } : {}), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it.each(["", "Founding20"])("sends the code only when entered, through the standard plan checkout: %s", async code => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Pricing /></QueryClientProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByRole("heading", { name: "iSDRX AI Starter" })).not.toBeInTheDocument();
  expect(screen.getAllByText(/3,000/).length).toBeGreaterThan(0);
  await waitFor(() => expect(client.getQueryData(["products"])).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Promotional code (optional)"), { target: { value: code } });
  fireEvent.click(screen.getAllByRole("button", { name: "Buy Now", exact: true })[0]);
  const dialog = screen.getByRole("dialog");
  fireEvent.scroll(within(dialog).getByRole("region", { name: "Subscription terms" }));
  fireEvent.click(within(dialog).getByRole("checkbox"));
  const continueButton = within(dialog).getByRole("button", { name: /continue/i });
  fireEvent.click(continueButton);
  await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith("/checkout"))).toBe(true));
  const call = fetchMock.mock.calls.find(call => String(call[0]).endsWith("/checkout")) as any;
  expect(JSON.parse(call[1].body)).toEqual({ priceId: "price_base_499", acceptTerms: true, checkoutIntent: "buy_now", ...(code ? { promoCode: code } : {}) });
});

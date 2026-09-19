import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  useCompareGiftSuggestionOffers,
  getGetProspectGiftSuggestionsQueryKey,
  type GiftOfferComparison,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

/** Fixed retailer destinations: AI supplies a search term, never a URL. */
export function giftShoppingLinks(giftName: string) {
  const query = encodeURIComponent(giftName.trim());
  return [
    { name: "Amazon", url: `https://www.amazon.com/s?k=${query}` },
    { name: "Target", url: `https://www.target.com/s?searchTerm=${query}` },
    { name: "Etsy", url: `https://www.etsy.com/search?q=${query}` },
  ];
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function GiftShoppingLinks({
  giftName,
  prospectId,
  ideaIndex,
  savedComparison,
}: {
  giftName: string;
  prospectId?: number;
  ideaIndex?: number;
  savedComparison?: GiftOfferComparison | null;
}) {
  if (!giftName.trim()) return null;
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Where to buy</p>
        {prospectId != null && ideaIndex != null && (
          <LiveComparison
            giftName={giftName}
            prospectId={prospectId}
            ideaIndex={ideaIndex}
            savedComparison={savedComparison}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {giftShoppingLinks(giftName).map(retailer => (
          <a
            key={retailer.name}
            href={retailer.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Search ${retailer.name} for ${giftName} (opens in a new tab)`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {retailer.name} search <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Search links are not verified product listings. Check the current price, availability,
        shipping, and seller before buying. Opening a link does not purchase or mark the gift as sent.
      </p>
    </div>
  );
}

function LiveComparison({
  giftName,
  prospectId,
  ideaIndex,
  savedComparison,
}: {
  giftName: string;
  prospectId: number;
  ideaIndex: number;
  savedComparison?: GiftOfferComparison | null;
}) {
  const queryClient = useQueryClient();
  const compare = useCompareGiftSuggestionOffers({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: getGetProspectGiftSuggestionsQueryKey(prospectId),
        });
      },
    },
  });
  const comparison = compare.data ?? savedComparison;
  const runComparison = () => {
    compare.mutate({ prospectId, ideaIndex });
  };
  return (
    <div className="basis-full space-y-2">
      <Button size="sm" variant="outline" onClick={runComparison} disabled={compare.isPending}>
        {compare.isPending
          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          : comparison ? <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> : null}
        {compare.isPending ? "Checking live offers…" : comparison ? "Check prices again" : "Compare prices"}
      </Button>
      {compare.error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-red-500">{compare.error.message || "Price comparison failed."}</p>
          <Button size="sm" variant="outline" onClick={runComparison}>Retry</Button>
        </div>
      )}
      {comparison?.status === "offers_found" && (
        <div className="space-y-2" aria-label={`Current offers for ${giftName}`}>
          {comparison.offers.map((offer, index) => {
            const knownTotal = offer.shippingKnown && offer.shippingPriceUsd != null
              ? offer.itemPriceUsd + offer.shippingPriceUsd : null;
            return (
              <div key={offer.url} className="rounded-md border bg-muted/20 p-2.5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a className="font-medium text-primary hover:underline" href={offer.url} target="_blank" rel="noopener noreferrer">
                      {offer.merchant}: {offer.itemName} <ExternalLink className="inline h-3 w-3" aria-hidden="true" />
                    </a>
                    <p className="mt-0.5 text-muted-foreground">
                      Item {money(offer.itemPriceUsd)} · {knownTotal != null
                        ? `shipping ${money(offer.shippingPriceUsd!)} · pre-tax item + shipping ${money(knownTotal)}`
                        : "shipping unknown / delivery cost unconfirmed"}
                      {" · "}{offer.availability}
                    </p>
                  </div>
                  {index === 0 && offer.availability === "available" && (
                    <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                      {comparison.rankingBasis === "lowest_verified_total"
                        ? "Lowest pre-tax item + shipping total among checked offers with confirmed shipping"
                        : "Lowest listed item price among checked offers; delivery unconfirmed"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Checked {new Date(comparison.checkedAt).toLocaleString()}. Taxes are unknown and excluded.
            Prices and availability can change; confirm on the merchant page.
            {comparison.rankingBasis === "lowest_verified_total"
              ? " Offers with unknown shipping may have a lower delivered cost."
              : ""}
          </p>
        </div>
      )}
      {comparison?.status === "no_verified_offers" && (
        <p className="text-xs text-muted-foreground">
          No reliable, currently priced comparable offers were verified. Try the retailer searches below.
        </p>
      )}
    </div>
  );
}
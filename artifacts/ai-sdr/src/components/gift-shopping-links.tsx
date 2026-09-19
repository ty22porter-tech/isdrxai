import { ExternalLink } from "lucide-react";

/** Fixed retailer destinations: AI supplies a search term, never a URL. */
export function giftShoppingLinks(giftName: string) {
  const query = encodeURIComponent(giftName.trim());
  return [
    { name: "Amazon", url: `https://www.amazon.com/s?k=${query}` },
    { name: "Target", url: `https://www.target.com/s?searchTerm=${query}` },
    { name: "Etsy", url: `https://www.etsy.com/search?q=${query}` },
  ];
}

export function GiftShoppingLinks({ giftName }: { giftName: string }) {
  if (!giftName.trim()) return null;
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-medium">Where to buy</p>
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
        Retailer search results—not verified product listings. Check the current price, availability,
        shipping, and seller before buying. Opening a link does not purchase or mark the gift as sent.
      </p>
    </div>
  );
}
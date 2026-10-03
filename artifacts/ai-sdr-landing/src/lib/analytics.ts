export type ConversionIntent = "book_demo" | "start_trial" | "get_started";

type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

const VISITOR_KEY = "isdrx_conversion_visitor";
const LOCATION_KEY = "isdrx_last_conversion_location";

export function getConversionVisitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const visitorId = window.crypto.randomUUID();
  window.localStorage.setItem(VISITOR_KEY, visitorId);
  return visitorId;
}

export function getLastConversionLocation(): string {
  return window.localStorage.getItem(LOCATION_KEY) || "book_demo_page";
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;
  try {
    void Promise.resolve(window.umami?.track(name, data)).catch(() => {});
  } catch {
    // Analytics must never interrupt the customer journey.
  }
}

export function trackConversionClick(
  intent: ConversionIntent,
  location: string,
): void {
  trackEvent("conversion_cta_click", { intent, location });

  try {
    window.localStorage.setItem(LOCATION_KEY, location);
    void fetch("/api/conversion-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: window.crypto.randomUUID(),
        intent,
        location,
        visitorId: getConversionVisitorId(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Conversion tracking must never interrupt navigation.
  }
}
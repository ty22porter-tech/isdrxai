type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

const VISITOR_KEY = "isdrx_conversion_visitor";

function visitorId(): string {
  const existing = window.localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const id = window.crypto.randomUUID();
  window.localStorage.setItem(VISITOR_KEY, id);
  return id;
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
  intent: "book_demo" | "start_trial" | "buy_now" | "get_started",
  location: string,
): void {
  trackEvent("conversion_cta_click", { intent, location });

  try {
    void fetch("/api/conversion-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: window.crypto.randomUUID(),
        intent,
        location,
        visitorId: visitorId(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Conversion tracking must never interrupt the customer journey.
  }
}
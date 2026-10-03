import { trackPrivateActivity } from "./visitor-activity";
export type ConversionIntent = "book_demo" | "start_trial" | "get_started";

// Capture links in headers, mobile menus, cards, and the guided assistant.
// Keep these click metrics separate from completed conversions.
export function installMarketingClickTracking(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.type === "auxclick" && event.button !== 1) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    try {
      const url = new URL(link.getAttribute("href")!, window.location.href);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname.replace(/\/+$/, "");
      const name = path === "/book-demo" ? "book_demo_clicked"
        : path === "/pricing" || path === "/app/pricing" || url.hash === "#plans" ? "pricing_clicked" : null;
      if (name) trackEvent(name, { source: "landing", location: link.closest("nav") ? "navigation" : "content" });
    } catch { /* Tracking must not interrupt navigation. */ }
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("auxclick", onClick, true);
  };
}

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
  // Private, opt-in activity (no-op unless consented and allowlisted).
  trackPrivateActivity(name);
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
import { useEffect, useState } from "react";

export function validTimeZone(timeZone?: string | null): string | undefined {
  if (!timeZone?.trim()) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() }).format();
    return timeZone.trim();
  } catch {
    // Older profiles may contain an invalid zone; use the device's local zone.
    return undefined;
  }
}

export function getDashboardGreeting(now: Date, timeZone?: string | null): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone),
    hour: "numeric",
    hourCycle: "h23",
  }).format(now));
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

export function useDashboardClock(timeZone?: string | null) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return {
    greeting: getDashboardGreeting(now, timeZone),
    dateLabel: now.toLocaleDateString(undefined, {
      timeZone: validTimeZone(timeZone),
      weekday: "long",
      month: "short",
      day: "numeric",
    }),
  };
}
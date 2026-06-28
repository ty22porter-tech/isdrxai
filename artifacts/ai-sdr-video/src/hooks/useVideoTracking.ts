import { useEffect, useRef } from "react";
import { SCENE_DURATIONS } from "../components/video/VideoTemplate";

const TOTAL_MS = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);
const MILESTONES = [
  { label: "25", ms: TOTAL_MS * 0.25 },
  { label: "50", ms: TOTAL_MS * 0.5 },
  { label: "75", ms: TOTAL_MS * 0.75 },
  { label: "100", ms: TOTAL_MS },
];

function getParams() {
  if (typeof window === "undefined") return { ref: null, clientId: null };
  const p = new URLSearchParams(window.location.search);
  return { ref: p.get("ref"), clientId: p.get("c") };
}

async function track(clientId: string, ref: string, event: string) {
  try {
    await fetch("/api/video-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, ref, event }),
    });
  } catch {
  }
}

export function useVideoTracking() {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const { ref, clientId } = getParams();
    if (!ref || !clientId) return;

    track(clientId, ref, "loaded");

    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      for (const { label, ms } of MILESTONES) {
        if (!firedRef.current.has(label) && elapsed >= ms) {
          firedRef.current.add(label);
          track(clientId, ref, label);
        }
      }
      if (firedRef.current.size === MILESTONES.length) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);
}

// Opt-in, consented visitor activity. Separate from anonymous Umami analytics.
// Payloads never contain PII, query strings, or path IDs — only allowlisted enums.
// Keep this file identical in ai-sdr and ai-sdr-landing (shared origin, shared keys/lock).

export type ActivityConsent = "granted" | "denied" | null;

const CONSENT_KEY = "isdrx_activity_consent";
const REVOKE_PENDING_KEY = "isdrx_activity_revoke_pending";
const LOCK_NAME = "isdrx-activity-consent";
const GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Stored =
  | { v: "granted"; at: number; expiresAt: number }
  | { v: "denied"; at: number };

const EVENTS = new Set([
  "page_view",
  "book_demo_clicked",
  "free_trial_clicked",
  "pricing_clicked",
  "settings_saved",
  "calendly_authorization_started",
]);

type Page =
  | "home" | "features" | "pricing" | "book_demo" | "contact" | "settings"
  | "dashboard" | "prospecting" | "campaigns" | "other";

export function currentActivityPage(): Page {
  let path = window.location.pathname.replace(/\/+$/, "").toLowerCase();
  if (path === "/app" || path.startsWith("/app/")) path = path.slice(4);
  const first = path.split("/")[1] ?? "";
  const hash = window.location.hash.toLowerCase();
  switch (first) {
    case "":
      if (hash === "#features") return "features";
      if (hash === "#plans" || hash === "#pricing") return "pricing";
      return "home";
    case "features": return "features";
    case "pricing": return "pricing";
    case "book-demo": return "book_demo";
    case "contact-us":
    case "contact": return "contact";
    case "settings": return "settings";
    case "dashboard": return "dashboard";
    case "prospecting": return "prospecting";
    case "campaigns": return "campaigns";
    default: return "other";
  }
}

function readStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Stored> & { expiresAt?: number };
    if (p.v === "denied" && typeof p.at === "number") return { v: "denied", at: p.at };
    if (p.v === "granted" && typeof p.at === "number" && typeof p.expiresAt === "number") {
      return { v: "granted", at: p.at, expiresAt: p.expiresAt };
    }
    return null; // legacy/unknown values are treated as no choice (Off)
  } catch {
    return null;
  }
}

/** Effective consent: expired grants read as null (Off). */
function readConsent(): ActivityConsent {
  const s = readStored();
  if (!s) return null;
  if (s.v === "granted" && s.expiresAt <= Date.now()) return null;
  return s.v;
}

function writeStored(s: Stored) {
  try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function setRevokePending(pending: boolean) {
  try {
    if (pending) window.localStorage.setItem(REVOKE_PENDING_KEY, "1");
    else window.localStorage.removeItem(REVOKE_PENDING_KEY);
  } catch { /* storage unavailable */ }
}

function revokePending() {
  try { return window.localStorage.getItem(REVOKE_PENDING_KEY) === "1"; } catch { return false; }
}

let consent: ActivityConsent = null;
let serverReady = false;
let generation = 0;
let fallbackQueue: Promise<unknown> = Promise.resolve();
let installed = false;
let lastTrackedKey: string | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function subscribeActivityConsent(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getActivityConsent(): ActivityConsent { return consent; }
export function isActivityServerReady() { return serverReady; }

function scheduleExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  const s = readStored();
  if (s?.v !== "granted") return;
  const ms = Math.min(Math.max(s.expiresAt - Date.now(), 0), 2 ** 31 - 1);
  expiryTimer = setTimeout(refreshFromStorage, ms);
}

/** Re-read storage; drops to Off if the grant expired. */
function refreshFromStorage() {
  const v = readConsent();
  if (v !== consent) {
    if (v !== "granted") { serverReady = false; ++generation; }
    consent = v;
    emit();
  }
  scheduleExpiry();
}

/** True only when the server confirmed consent and the local grant is current. */
export function activityLinkingAllowed(): boolean {
  if (!serverReady || consent !== "granted") return false;
  if (readConsent() !== "granted") {
    refreshFromStorage();
    return false;
  }
  return true;
}

async function postConsent(allow: boolean): Promise<void> {
  const res = await fetch("/api/visitor-activity/consent", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allow }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { message?: string; error?: string }));
    throw new Error(body.message || body.error || `Request failed (${res.status})`);
  }
}

// Serialize all consent work across tabs (Web Locks) or within this tab (fallback queue).
function withConsentLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.request) return locks.request(LOCK_NAME, fn) as Promise<T>;
  const next = fallbackQueue.catch(() => {}).then(fn);
  fallbackQueue = next.catch(() => {});
  return next;
}

function send(event: string) {
  if (!EVENTS.has(event) || !activityLinkingAllowed()) return;
  try {
    void fetch("/api/visitor-activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: window.crypto.randomUUID(), event, page: currentActivityPage() }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never interrupt the visitor */ }
}

function trackPageView(force = false) {
  const key = `${window.location.pathname}|${currentActivityPage()}`;
  if (!force && key === lastTrackedKey) return;
  if (!activityLinkingAllowed()) return;
  lastTrackedKey = key;
  send("page_view");
}

/** Called from trackEvent; ignores anything outside the allowlist or without consent. */
export function trackPrivateActivity(name: string) {
  if (name === "page_view") return;
  send(name);
}

export function enableActivityTracking(): Promise<void> {
  const g = ++generation;
  const requestedAt = Date.now();
  return withConsentLock(async () => {
    // An opt-out issued after this click (this tab or another) wins.
    const s = readStored();
    if (g !== generation || (s?.v === "denied" && s.at > requestedAt)) return;
    await postConsent(true);
    const after = readStored();
    if (g !== generation || (after?.v === "denied" && after.at > requestedAt)) {
      await postConsent(false).catch(() => setRevokePending(true));
      return;
    }
    const now = Date.now();
    writeStored({ v: "granted", at: now, expiresAt: now + GRANT_TTL_MS });
    setRevokePending(false);
    consent = "granted";
    serverReady = true;
    scheduleExpiry();
    emit();
    trackPageView(true);
  });
}

export function disableActivityTracking(): Promise<void> {
  ++generation;
  // Stop immediately, before the server confirms.
  consent = "denied";
  serverReady = false;
  writeStored({ v: "denied", at: Date.now() });
  setRevokePending(true);
  scheduleExpiry();
  emit();
  return withConsentLock(async () => {
    await postConsent(false);
    if (readConsent() === "denied") setRevokePending(false);
  });
}

function onRouteChange() { queueMicrotask(() => trackPageView()); }

let origPush: History["pushState"] | null = null;
let origReplace: History["replaceState"] | null = null;

const onStorage = (e: StorageEvent) => {
  if (e.key !== CONSENT_KEY) return;
  const v = readConsent();
  ++generation;
  consent = v;
  // The consent cookie is shared across same-origin tabs; the other tab confirmed it.
  serverReady = v === "granted";
  scheduleExpiry();
  emit();
  if (v === "granted") trackPageView(true);
};

export function installVisitorActivity(): () => void {
  if (installed) return () => {};
  installed = true;
  consent = readConsent();
  serverReady = false;
  lastTrackedKey = null;
  scheduleExpiry();

  const g = generation;
  if (consent === "granted") {
    void withConsentLock(async () => {
      if (g !== generation || readConsent() !== "granted") return;
      await postConsent(true);
      if (g !== generation || readConsent() !== "granted") {
        if (readConsent() === "denied") await postConsent(false).catch(() => setRevokePending(true));
        return;
      }
      serverReady = true;
      emit();
      trackPageView(true);
    }).catch(() => { /* stay off; control offers Reconnect */ });
  } else if (consent === "denied" && revokePending()) {
    void withConsentLock(async () => {
      if (readConsent() !== "denied" || !revokePending()) return;
      await postConsent(false);
      setRevokePending(false);
    }).catch(() => { /* retried next load */ });
  }

  origPush = history.pushState;
  origReplace = history.replaceState;
  const push = origPush;
  const replace = origReplace;
  history.pushState = function (...args: Parameters<History["pushState"]>) {
    const r = push.apply(this, args);
    onRouteChange();
    return r;
  };
  history.replaceState = function (...args: Parameters<History["replaceState"]>) {
    const r = replace.apply(this, args);
    onRouteChange();
    return r;
  };
  window.addEventListener("popstate", onRouteChange);
  window.addEventListener("hashchange", onRouteChange);
  window.addEventListener("storage", onStorage);

  return () => {
    if (origPush) history.pushState = origPush;
    if (origReplace) history.replaceState = origReplace;
    origPush = origReplace = null;
    window.removeEventListener("popstate", onRouteChange);
    window.removeEventListener("hashchange", onRouteChange);
    window.removeEventListener("storage", onStorage);
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    ++generation;
    serverReady = false;
    lastTrackedKey = null;
    installed = false;
  };
}

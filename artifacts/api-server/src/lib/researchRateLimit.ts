/** Retry-After supports seconds or an HTTP date. Never retry before that time. */
export function retryAfterMs(headers?: Headers, now = Date.now()): number {
  const milliseconds = headers?.get("retry-after-ms");
  if (milliseconds && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0) {
    return Math.max(1000, Number(milliseconds));
  }
  const value = headers?.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return seconds >= 0 ? Math.max(1000, seconds * 1000) : 30_000;
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(1000, date - now);
  }
  return 30_000;
}

// Bound provider pressure across searches in this API process. Durable job
// checkpoints and retry times handle recovery and retries across restarts.
let tail: Promise<void> = Promise.resolve();
export async function researchRequest<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { signal?.throwIfAborted(); return await operation(); } finally { release(); }
}

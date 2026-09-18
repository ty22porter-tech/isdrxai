export interface PlaybackSample {
  position: number;
  playing: boolean;
  seeking: boolean;
  ranges: Array<[number, number]>;
}
export interface PlaybackAcknowledgment {
  accepted: boolean;
  retryAfterMs?: number;
  stop?: boolean;
}

/**
 * Dependency-free browser function, embedded verbatim in the nonce-protected
 * player. In particular, an ended snapshot survives an in-flight heartbeat,
 * minimum-interval rejection, and transient transport errors.
 */
export function createPlaybackReporter(deps: {
  send: (sample: PlaybackSample) => Promise<PlaybackAcknowledgment>;
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  minimumIntervalMs?: number;
}) {
  let sending = false;
  let stopped = false;
  let pending: { sample: PlaybackSample; final: boolean } | null = null;
  let scheduled = false;
  let nextAt = 0;
  const interval = deps.minimumIntervalMs ?? 550;

  function wake(delay: number) {
    if (scheduled || stopped) return;
    scheduled = true;
    deps.schedule(() => { scheduled = false; void flush(); }, Math.max(1, delay));
  }
  async function flush(): Promise<void> {
    if (stopped || sending || !pending) return;
    if (deps.now() < nextAt) { wake(nextAt - deps.now()); return; }
    const job = pending;
    pending = null;
    sending = true;
    try {
      const ack = await deps.send(job.sample);
      if (ack.stop) { stopped = true; pending = null; return; }
      // Wait AFTER the response, not the request start: the server's previous
      // transaction may have committed long after the request was dispatched.
      nextAt = deps.now() + Math.max(interval, ack.retryAfterMs ?? 0);
      if (!ack.accepted && job.final) pending = job;
    } catch {
      nextAt = deps.now() + Math.max(interval, 1000);
      if (job.final) pending = job;
    } finally {
      sending = false;
      if (pending && !stopped) wake(nextAt - deps.now());
    }
  }
  return {
    report(sample: PlaybackSample, final = false) {
      if (stopped || pending?.final && !final) return;
      pending = { sample, final };
      void flush();
    },
  };
}
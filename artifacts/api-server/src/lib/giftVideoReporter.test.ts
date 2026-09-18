import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaybackReporter, type PlaybackAcknowledgment, type PlaybackSample } from "./giftVideoReporter";
import { acceptPlayback } from "./giftVideoMetrics";

const sample = (position: number): PlaybackSample => ({ position, playing: true, seeking: false, ranges: [[0, position]] });
const clock = () => ({ now: () => Date.now(), schedule: (fn: () => void, delay: number) => setTimeout(fn, delay) });
afterEach(() => vi.useRealTimers());

describe("final playback report delivery", () => {
  it("queues ended while a heartbeat is in flight, then waits after its acknowledgment", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    let finishHeartbeat!: (ack: PlaybackAcknowledgment) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<PlaybackAcknowledgment>(resolve => { finishHeartbeat = resolve; }))
      .mockResolvedValue({ accepted: true });
    const reporter = createPlaybackReporter({ ...clock(), send });
    reporter.report(sample(8));
    await vi.advanceTimersByTimeAsync(150);
    reporter.report(sample(8.15), true);
    expect(send).toHaveBeenCalledTimes(1);
    finishHeartbeat({ accepted: true });
    await vi.advanceTimersByTimeAsync(549);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].position).toBe(8.15);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("retries a final snapshot rejected by the server minimum interval", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const send = vi.fn().mockResolvedValueOnce({ accepted: false, retryAfterMs: 500 }).mockResolvedValue({ accepted: true });
    const reporter = createPlaybackReporter({ ...clock(), send });
    reporter.report(sample(8.15), true);
    await vi.advanceTimersByTimeAsync(550);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(sample(8.15));
  });
  it("retries terminal transport failures without needing another video event", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ accepted: true });
    createPlaybackReporter({ ...clock(), send }).report(sample(8.15), true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("records completion for a clip ending 150ms after the last heartbeat", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    let lastAt = 0;
    let lastPosition = 7;
    let ranges: Array<[number, number]> = [[0, 7]];
    let percentage = 0;
    const send = vi.fn(async (payload: PlaybackSample) => {
      const elapsedSeconds = (Date.now() - lastAt) / 1000;
      if (elapsedSeconds < 0.5) return { accepted: false, retryAfterMs: 500 - elapsedSeconds * 1000 };
      const accepted = acceptPlayback({ previous: ranges, position: payload.position, lastPosition, elapsedSeconds,
        duration: 8.15, playing: payload.playing, seeking: payload.seeking, ranges: payload.ranges });
      ranges = accepted.ranges; percentage = accepted.percentage;
      lastAt = Date.now(); lastPosition = payload.position;
      return { accepted: true };
    });
    const reporter = createPlaybackReporter({ ...clock(), send });
    reporter.report(sample(8));
    await vi.advanceTimersByTimeAsync(150);
    expect(percentage).toBeLessThan(100);
    reporter.report(sample(8.15), true);
    await vi.advanceTimersByTimeAsync(400);
    expect(send).toHaveBeenCalledTimes(2);
    expect(percentage).toBe(100);
  });
  it("stops retrying on expired or revoked sessions", async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const send = vi.fn().mockResolvedValue({ accepted: false, stop: true });
    createPlaybackReporter({ ...clock(), send }).report(sample(10), true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
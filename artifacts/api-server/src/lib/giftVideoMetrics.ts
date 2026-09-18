/** Pure, conservative playback validation shared by the player handler and tests. */
export type PlayedRange = [number, number];
export function mergePlayedRanges(ranges: PlayedRange[]): PlayedRange[] {
  const sorted = ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a && a >= 0)
    .sort((a, b) => a[0] - b[0]);
  const merged: PlayedRange[] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}
export function acceptPlayback(input: {
  previous: PlayedRange[]; position: number; lastPosition: number; elapsedSeconds: number;
  duration: number; playing: boolean; seeking: boolean; ranges: PlayedRange[];
}): { ranges: PlayedRange[]; percentage: number; acceptedSeconds: number } {
  const old = mergePlayedRanges(input.previous);
  const watched = (rs: PlayedRange[]) => rs.reduce((sum, [a, b]) => sum + b - a, 0);
  const oldSeconds = watched(old);
  const finish = (ranges: PlayedRange[]) => {
    const seconds = watched(ranges);
    // A 100% event needs effectively the whole clip, not simply currentTime=end.
    const pct = seconds >= input.duration - Math.min(0.35, input.duration * 0.005)
      ? 100 : Math.min(99, Math.floor(seconds / input.duration * 100));
    return { ranges, percentage: Math.max(0, pct), acceptedSeconds: seconds - oldSeconds };
  };
  if (!input.playing || input.seeking || input.elapsedSeconds <= 0 || input.elapsedSeconds > 20
    || input.duration <= 0 || input.position < 0 || input.position > input.duration + 0.5) return finish(old);
  const delta = input.position - input.lastPosition;
  if (delta <= 0 || delta > input.elapsedSeconds * 1.25 + 0.25) return finish(old);
  // Only the interval actually advanced since the last server heartbeat can be
  // admitted. Client-supplied historical ranges cannot backfill skipped material.
  const added: PlayedRange[] = input.ranges.map(([a, b]): PlayedRange => [
    Math.max(a, input.lastPosition), Math.min(b, input.position, input.duration),
  ]).filter(([a, b]) => b > a);
  const merged = mergePlayedRanges([...old, ...added]);
  if (watched(merged) - oldSeconds > input.elapsedSeconds * 1.25 + 0.25) return finish(old);
  return finish(merged);
}

export function tokenIsActive(video: { deletedAt: Date | null; expiresAt: Date | null }, now = Date.now()): boolean {
  return !video.deletedAt && (!video.expiresAt || video.expiresAt.getTime() > now);
}
export function classifyVisit(recent: Array<{ type: string; isValid: boolean; createdAt: Date }>, type: string, botReason: string | null, now: number) {
  const reason = botReason ?? (recent.some(e => e.type !== type && now - e.createdAt.getTime() < 10_000) ? "click-burst" : null);
  const duplicate = recent.some(e => e.type === type && e.isValid && now - e.createdAt.getTime() < 30_000);
  return { reason, duplicate, valid: !reason && !duplicate };
}
export function isOwnedUpload(upload: { clientId: string; kind: string; claimedAt: Date | null; expiresAt: Date }, clientId: string, kind: string, now = Date.now()): boolean {
  return upload.clientId === clientId && upload.kind === kind && !upload.claimedAt && upload.expiresAt.getTime() > now;
}
export function videoStatus(f: {
  booked: boolean; schedule: boolean; percentage: number; started: boolean; clicked: boolean;
  opened: boolean; delivered: boolean; sentAt: Date | null; scheduled?: boolean;
}, now = Date.now()): string {
  if (f.booked) return "Discovery Call Booked";
  if (f.schedule) return "Scheduling Link Clicked";
  if (f.percentage >= 100) return "Video Completed";
  if (f.percentage >= 25) return "Video Partially Watched";
  if (f.started) return "Video Started";
  if (f.clicked) return "Video Clicked";
  if (f.sentAt && now - f.sentAt.getTime() >= 86400_000) return "Video Not Clicked";
  if (f.opened) return "Email Opened";
  if (f.delivered) return "Video Email Delivered";
  return f.sentAt ? "Video Email Sent" : f.scheduled === false ? "Video Not Clicked" : "Video Email Scheduled";
}

/** MP4 box parser: duration comes from mvhd, never from a browser claim. */
export function mp4Duration(bytes: Buffer): number {
  if (bytes.length < 24 || bytes.toString("ascii", 4, 8) !== "ftyp") throw new Error("Upload is not an MP4 file");
  function scan(start: number, end: number): number | null {
    let offset = start;
    while (offset + 8 <= end) {
      let size = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      let header = 8;
      if (size === 1) { if (offset + 16 > end) break; size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16; }
      if (size === 0) size = end - offset;
      if (size < header || offset + size > end || !Number.isSafeInteger(size)) break;
      const payload = offset + header;
      if (type === "moov") { const found = scan(payload, offset + size); if (found) return found; }
      if (type === "mvhd" && payload + 32 <= offset + size) {
        const version = bytes[payload];
        const scaleOffset = payload + (version === 1 ? 20 : 12);
        const scale = bytes.readUInt32BE(scaleOffset);
        const duration = version === 1 ? Number(bytes.readBigUInt64BE(scaleOffset + 4)) : bytes.readUInt32BE(scaleOffset + 4);
        const seconds = duration / scale;
        if (Number.isFinite(seconds) && seconds > 0 && seconds <= 7200) return seconds;
      }
      offset += size;
    }
    return null;
  }
  const duration = scan(0, bytes.length);
  if (!duration) throw new Error("MP4 must include a valid duration (maximum two hours); export a standard MP4 and retry");
  return duration;
}
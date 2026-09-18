import { describe, it, expect } from "vitest";
import { acceptPlayback, classifyVisit, isOwnedUpload, mp4Duration, tokenIsActive, videoStatus } from "./giftVideoMetrics";
import { botReason, videoBotReason } from "./trackingClassification";

describe("gift video access boundaries", () => {
  it("expires the token at the same instant and revokes deleted links", () => {
    const now = 100000;
    expect(tokenIsActive({ deletedAt: null, expiresAt: new Date(now) }, now)).toBe(false);
    expect(tokenIsActive({ deletedAt: null, expiresAt: new Date(now + 1) }, now)).toBe(true);
    expect(tokenIsActive({ deletedAt: new Date(1), expiresAt: null }, now)).toBe(false);
  });
  it("will not claim another tenant's otherwise unowned object", () => {
    const reservation = { clientId: "a", kind: "video", claimedAt: null, expiresAt: new Date(200000) };
    expect(isOwnedUpload(reservation, "b", "video", 100000)).toBe(false);
    expect(isOwnedUpload(reservation, "a", "thumbnail", 100000)).toBe(false);
    expect(isOwnedUpload({ ...reservation, claimedAt: new Date() }, "a", "video", 100000)).toBe(false);
    expect(isOwnedUpload(reservation, "a", "video", 200000)).toBe(false);
    expect(isOwnedUpload(reservation, "a", "video", 100000)).toBe(true);
  });
});
describe("shared bot filtering and visit deduplication", () => {
  it("filters scanners, purpose prefetch, and the post-send grace period, not Gmail proxies", () => {
    expect(botReason("Proofpoint")).toBe("security-scanner");
    expect(botReason("GoogleImageProxy")).toBeNull();
    expect(videoBotReason("Mozilla/5.0", null, "prefetch")).toBe("prefetch-header");
    expect(videoBotReason("Mozilla/5.0", new Date(100000), "", 110000)).toBe("prefetch-window");
    expect(videoBotReason("Mozilla/5.0", new Date(100000), "", 120000)).toBeNull();
  });
  it("deduplicates immediate retries, permits later timeline clicks, and rejects scanner sweeps", () => {
    const recent = [{ type: "video_clicked", isValid: true, createdAt: new Date(100000) }];
    expect(classifyVisit(recent, "video_clicked", null, 110000).valid).toBe(false);
    expect(classifyVisit(recent, "video_clicked", null, 131000).valid).toBe(true);
    expect(classifyVisit(recent, "scheduling_clicked", null, 105000).reason).toBe("click-burst");
    expect(classifyVisit([], "video_clicked", "security-scanner", 105000).valid).toBe(false);
  });
});
describe("played-range milestones, not seeking", () => {
  const common = { previous: [] as [number, number][], lastPosition: 0, position: 2, elapsedSeconds: 2,
    duration: 10, playing: true, seeking: false, ranges: [[0,2]] as [number, number][] };
  it("does not infer completion from currentTime at the end", () => {
    expect(acceptPlayback({ ...common, position: 10, ranges: [[0,10]] }).percentage).toBe(0);
    expect(acceptPlayback({ ...common, seeking: true }).percentage).toBe(0);
    expect(acceptPlayback({ ...common, playing: false }).percentage).toBe(0);
    expect(acceptPlayback({ ...common, elapsedSeconds: 0 }).percentage).toBe(0);
  });
  it("cannot backfill historical ranges after seeking near the end", () => {
    expect(acceptPlayback({ ...common, lastPosition: 8, position: 10, ranges: [[0,10]] }).percentage).toBe(20);
  });
  it("awards exact milestones only after elapsed time across actual ranges", () => {
    let ranges: [number, number][] = [];
    for (let i = 0; i < 5; i++) {
      const result = acceptPlayback({ ...common, previous: ranges, lastPosition: i * 2,
        position: (i + 1) * 2, ranges: [[0,(i + 1) * 2]] });
      ranges = result.ranges;
      expect(result.percentage).toBe((i + 1) * 20);
    }
    expect(acceptPlayback({ ...common, previous: ranges, ranges: [[0,2]] }).acceptedSeconds).toBe(0);
  });
});
describe("source-authoritative dashboard", () => {
  const facts = { booked: false, schedule: false, percentage: 0, started: false, clicked: false,
    opened: false, delivered: false, sentAt: new Date(100000) };
  it("never assumes delivered from sent or clicks from opens", () => {
    expect(videoStatus(facts, 110000)).toBe("Video Email Sent");
    expect(videoStatus({ ...facts, opened: true }, 110000)).toBe("Email Opened");
    expect(videoStatus({ ...facts, delivered: true }, 110000)).toBe("Video Email Delivered");
    expect(videoStatus(facts, 100000000)).toBe("Video Not Clicked");
  });
  it("only a real booking fact takes booking precedence", () => {
    expect(videoStatus({ ...facts, schedule: true, percentage: 100 })).toBe("Scheduling Link Clicked");
    expect(videoStatus({ ...facts, booked: true, clicked: true })).toBe("Discovery Call Booked");
  });
  it("rejects non-MP4 and incomplete headers", () => {
    expect(() => mp4Duration(Buffer.from("not an MP4"))).toThrow("not an MP4");
    const ftyp = Buffer.alloc(24); ftyp.writeUInt32BE(24); ftyp.write("ftyp", 4);
    expect(() => mp4Duration(ftyp)).toThrow("valid duration");
  });
});
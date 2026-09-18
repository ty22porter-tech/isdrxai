import { describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import type { GiftVideo } from "@workspace/db";
vi.mock("./giftVideoOutreach", () => ({
  escapeHtml: (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)),
}));
import { giftVideoPoster, renderGiftVideoPlayer } from "./giftVideoPlayer";

const video = { title: "Hello <script> from your team", prospectName: "Dedrick & Company", showNameOnThumbnail: true,
  token: "a".repeat(64), giftName: "Notebook", giftSentDate: "2026-01-01", cta: "Let's talk",
  introduction: "", transcript: "" } as GiftVideo;

describe("email-compatible raster poster", () => {
  it("returns genuine PNG bytes with a personalized name and play graphic", async () => {
    const poster = await giftVideoPoster(video);
    expect(poster.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect(await sharp(poster).metadata()).toMatchObject({ width: 1120, height: 630, format: "png" });
    const unnamed = await giftVideoPoster({ ...video, showNameOnThumbnail: false });
    expect(poster.equals(unnamed)).toBe(false);
    const pixel = await sharp(poster).extract({ left: 560, top: 275, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    expect([...pixel]).toEqual([27,84,84]); // center of the rendered play triangle
  });
  it("rasterizes a custom thumbnail underneath the text and play graphic", async () => {
    const thumb = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const poster = await giftVideoPoster(video, thumb);
    expect((await sharp(poster).metadata()).format).toBe("png");
    const pixel = await sharp(poster).extract({ left: 20, top: 20, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    expect(pixel[0]).toBeGreaterThan(pixel[1]);
    expect(poster.equals(await giftVideoPoster(video))).toBe(false);
  });
});

describe("embedded native player reporting", () => {
  it("embeds a self-contained reporter that runs without server closure dependencies", () => {
    const page = renderGiftVideoPlayer(video, "b".repeat(48));
    const script = page.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];
    const listeners: Record<string, () => void> = {};
    const player = { addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; } };
    expect(() => runInNewContext(script, {
      document: { getElementById: (id: string) => id === "player" ? player : {}, addEventListener: vi.fn() },
      setTimeout: vi.fn(), setInterval: vi.fn(), fetch: vi.fn(),
    })).not.toThrow();
    expect(listeners.ended).toBeTypeOf("function");
    expect(page.html).toContain(`/api/gift-videos/watch/${video.token}/poster`);
    expect(page.html).not.toContain("<script> from your team");
  });
});
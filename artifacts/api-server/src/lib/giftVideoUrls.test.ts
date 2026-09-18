import { describe, expect, it, vi } from "vitest";
import type { GiftVideo } from "@workspace/db";

vi.mock("./publicUrl", () => ({ getPublicAppUrl: () => "https://mail.example.test" }));
import { serializeGiftVideo } from "./giftVideoOutreach";

const video = { id: 1, token: "a".repeat(64), thumbnailPath: null } as GiftVideo;

describe("gift video environment boundaries", () => {
  it("keeps private dashboard previews and posters on the current origin", () => {
    const result = serializeGiftVideo(video);
    expect(result.watchUrl).toBe(`/api/gift-videos/watch/${video.token}`);
    expect(result.posterUrl).toBe(`/api/gift-videos/watch/${video.token}/poster`);
  });

  it("uses the configured published origin for outbound email links", () => {
    const result = serializeGiftVideo(video, true);
    expect(result.watchUrl).toBe(`https://mail.example.test/api/gift-videos/watch/${video.token}`);
    expect(result.posterUrl).toBe(`${result.watchUrl}/poster`);
  });
});
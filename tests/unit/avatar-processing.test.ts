import { describe, expect, it } from "vitest";
import sharp, { type Sharp } from "sharp";
import { processAvatarImage } from "@/lib/avatar-processing";
import { AVATAR_UPLOAD } from "@/lib/constants";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 22, g: 163, b: 74 } } });

describe("processAvatarImage", () => {
  it("re-encodes JPEG, PNG and WebP to a 512×512 WebP", async () => {
    for (const encode of [(s: Sharp) => s.jpeg(), (s: Sharp) => s.png(), (s: Sharp) => s.webp()]) {
      const input = await encode(solid(900, 600)).toBuffer();
      const result = await processAvatarImage(input);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const meta = await sharp(result.data).metadata();
      expect(meta.format).toBe("webp");
      expect([meta.width, meta.height]).toEqual([AVATAR_UPLOAD.size, AVATAR_UPLOAD.size]);
    }
  });

  it("strips EXIF metadata (camera, location, comments)", async () => {
    const withExif = await solid(400, 400)
      .withExif({ IFD0: { Copyright: "secret-owner", ImageDescription: "home address" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processAvatarImage(withExif);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(result.data.includes(Buffer.from("secret-owner"))).toBe(false);
  });

  it("rejects anything that is not a real JPEG, PNG or WebP", async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script><rect width="200" height="200"/></svg>`);
    const html = Buffer.from("<!doctype html><script>alert(document.cookie)</script>");
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(400, 0x90)]);
    const gif = await solid(200, 200).gif().toBuffer();
    // A PNG header followed by garbage: claims to be an image but does not decode.
    const truncated = (await solid(200, 200).png().toBuffer()).subarray(0, 40);

    for (const [label, bytes, expected] of [
      ["svg", svg, "unsupported"],
      ["html", html, "unreadable"],
      ["exe", exe, "unreadable"],
      ["gif", gif, "unsupported"],
      ["truncated png", truncated, "unreadable"],
    ] as const) {
      const result = await processAvatarImage(bytes);
      expect(result.ok, label).toBe(false);
      if (!result.ok) expect(result.error, label).toBe(expected);
    }
  });

  it("enforces size limits", async () => {
    expect(await processAvatarImage(new Uint8Array())).toEqual({ ok: false, error: "empty" });
    expect(await processAvatarImage(new Uint8Array(AVATAR_UPLOAD.maxBytes + 1))).toEqual({ ok: false, error: "too_large" });
    expect(await processAvatarImage(await solid(32, 32).png().toBuffer())).toEqual({ ok: false, error: "too_small" });
  });
});

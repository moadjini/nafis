import sharp from "sharp";
import { AVATAR_UPLOAD } from "@/lib/constants";

export type AvatarProcessingError = "too_large" | "empty" | "unsupported" | "unreadable" | "too_small";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

/**
 * Turns an uploaded file into a safe profile picture. The bytes must decode as
 * a real JPEG, PNG or WebP (SVG, GIF, HTML, scripts and executables are
 * rejected whatever their declared type or extension). The result is a fresh
 * 512×512 WebP: orientation applied, and all metadata (EXIF, GPS, ICC profiles,
 * comments) dropped because sharp writes none unless asked to.
 */
export async function processAvatarImage(
  input: ArrayBuffer | Uint8Array,
): Promise<{ ok: true; data: Buffer } | { ok: false; error: AvatarProcessingError }> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength === 0) return { ok: false, error: "empty" };
  if (bytes.byteLength > AVATAR_UPLOAD.maxBytes) return { ok: false, error: "too_large" };

  try {
    // ~40 MP cap guards against decompression bombs.
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) return { ok: false, error: "unsupported" };
    if ((meta.pages ?? 1) > 1) return { ok: false, error: "unsupported" }; // animated images
    if (!meta.width || !meta.height) return { ok: false, error: "unreadable" };
    if (meta.width < 64 || meta.height < 64) return { ok: false, error: "too_small" };

    const data = await image
      .rotate()
      .resize(AVATAR_UPLOAD.size, AVATAR_UPLOAD.size, { fit: "cover", position: "centre" })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "unreadable" };
  }
}

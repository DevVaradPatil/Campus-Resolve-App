import "server-only";
import sharp from "sharp";
import { HttpError } from "./http";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Identifies JPEG/PNG/WebP by magic bytes. The filename and declared type are never trusted (FR-04). */
export function sniffImage(b: Buffer): "jpeg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG)) return "png";
  if (
    b.length >= 12 &&
    b.toString("latin1", 0, 4) === "RIFF" &&
    b.toString("latin1", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

/**
 * Decodes and re-encodes to WebP: applies EXIF orientation, then drops all metadata (GPS,
 * camera, timestamps) because sharp only keeps metadata when asked to. Caps size at 2048px.
 */
export async function reencodeImage(input: Buffer) {
  if (!sniffImage(input)) throw new HttpError(400, "Only JPEG, PNG or WebP photos are allowed.");
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new HttpError(400, "That photo couldn't be read. Try a different one.");
  }
}

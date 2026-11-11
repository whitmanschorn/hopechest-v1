import { createHash } from "node:crypto";
import exifr from "exifr";
import sharp from "sharp";
import type { FuzzyDate } from "@/lib/fuzzyDate";
import { takenAt, takenDate } from "@/lib/photos/exif";

export interface ProcessedImage {
  sha256: string;
  width: number;
  height: number;
  /** At most 2000px on the long side, for viewing. */
  display: Buffer;
  /** At most 480px on the long side, for grids. */
  thumb: Buffer;
  taken: FuzzyDate | null;
  position: { lat: number; lng: number } | null;
  /** The few camera fields worth keeping. */
  exif: Record<string, string | number> | null;
}

const KEEP = [
  "Make",
  "Model",
  "LensModel",
  "Software",
  "ISO",
  "FNumber",
  "ExposureTime",
  "FocalLength",
];

/**
 * Checks that the bytes really are an image and makes the two smaller copies.
 * Throws if they are not: the content type a browser sends proves nothing.
 */
export async function processImage(original: Buffer): Promise<ProcessedImage> {
  // rotate() with no angle turns the picture the way its camera data says is up.
  const upright = sharp(original, { failOn: "error", limitInputPixels: 400_000_000 }).rotate();
  const { width, height } = await upright
    .clone()
    .toBuffer({ resolveWithObject: true })
    .then((result) => result.info);

  const resized = (edge: number, quality: number) =>
    upright
      .clone()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  const [display, thumb] = await Promise.all([resized(2000, 85), resized(480, 78)]);

  // Camera data is optional and often malformed; a photo without it is still a photo.
  const raw: Record<string, unknown> =
    (await exifr.parse(original, { gps: true }).catch(() => null)) ?? {};
  const exif: Record<string, string | number> = {};
  for (const key of KEEP) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) exif[key] = value;
    else if (typeof value === "string" && value.trim()) exif[key] = value.trim().slice(0, 120);
  }

  return {
    sha256: createHash("sha256").update(original).digest("hex"),
    width,
    height,
    display,
    thumb,
    taken: takenDate(raw),
    position: takenAt(raw),
    exif: Object.keys(exif).length > 0 ? exif : null,
  };
}

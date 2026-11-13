import type { Box } from "@/lib/photos/box";

/**
 * How to place a whole photo inside a square window so that only one face
 * shows, with a little room around it. Percentages of the window, for an
 * absolutely positioned <img>. Pure.
 */
export function faceCrop(
  box: Box,
  width: number,
  height: number,
): { width: string; left: string; top: string } {
  const faceW = (box.w / 100) * width;
  const faceH = (box.h / 100) * height;
  // Room for hair and chin, but never more than the photo has.
  const side = Math.min(Math.max(faceW, faceH) * 1.5, width, height);
  const centreX = ((box.x + box.w / 2) / 100) * width;
  const centreY = ((box.y + box.h / 2) / 100) * height;
  const left = Math.min(Math.max(centreX - side / 2, 0), width - side);
  const top = Math.min(Math.max(centreY - side / 2, 0), height - side);
  const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;
  return { width: percent(width / side), left: percent(-left / side), top: percent(-top / side) };
}

/** How much two boxes overlap: 0 for not at all, 1 for the same box. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const shared = w * h;
  return shared / (a.w * a.h + b.w * b.h - shared);
}

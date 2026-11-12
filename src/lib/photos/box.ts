/**
 * Where someone is in a photo: a rectangle in percentages of the picture
 * (0–100), so it holds at any display size. Pure, safe in the browser.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smaller than this in either direction is a slip of the finger, not a box. */
export const MIN_BOX_PERCENT = 3;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const percent = (value: number) => Math.round(value * 10000) / 100;

/**
 * The box between where a drag started and where it ended. Points are
 * fractions of the picture (0–1) and may lie outside it; the box never does.
 */
export function boxFromDrag(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Box | null {
  const left = clamp(Math.min(from.x, to.x));
  const top = clamp(Math.min(from.y, to.y));
  const right = clamp(Math.max(from.x, to.x));
  const bottom = clamp(Math.max(from.y, to.y));
  const box = {
    x: percent(left),
    y: percent(top),
    w: percent(right - left),
    h: percent(bottom - top),
  };
  return box.w < MIN_BOX_PERCENT || box.h < MIN_BOX_PERCENT ? null : box;
}

/** Reads a box sent by a browser; null unless it is a rectangle inside the picture. */
export function parseBox(value: unknown): Box | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  const numbers = [x, y, w, h];
  if (!numbers.every((n): n is number => typeof n === "number" && Number.isFinite(n))) return null;
  const [bx, by, bw, bh] = numbers as number[];
  if (bx < 0 || by < 0 || bw < MIN_BOX_PERCENT || bh < MIN_BOX_PERCENT) return null;
  // A hair over 100 is rounding, not a bad box.
  if (bx + bw > 100.01 || by + bh > 100.01) return null;
  return { x: bx, y: by, w: bw, h: bh };
}

/** From the four nullable columns a tag is stored in. */
export function boxFromColumns(row: {
  boxX: number | null;
  boxY: number | null;
  boxW: number | null;
  boxH: number | null;
}): Box | null {
  const { boxX, boxY, boxW, boxH } = row;
  if (boxX === null || boxY === null || boxW === null || boxH === null) return null;
  return { x: boxX, y: boxY, w: boxW, h: boxH };
}

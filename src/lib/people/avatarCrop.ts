/**
 * The maths behind choosing a profile picture: a square window onto a photo
 * that can be zoomed and dragged, shown as a circle. Pure, safe in the browser.
 */

/** Where the window sits: its centre as a fraction of the photo, and how far zoomed in. */
export interface CropView {
  cx: number;
  cy: number;
  zoom: number;
}

/** The window in the photo's own pixels. */
export interface Square {
  x: number;
  y: number;
  size: number;
}

/** What is kept with the person: percentages of the photo's width, height and shorter side. */
export interface StoredCrop {
  x: number;
  y: number;
  size: number;
}

export const MAX_ZOOM = 4;
/** Width and height of the saved picture. */
export const AVATAR_PIXELS = 512;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Keeps the zoom in range and the window inside the photo. */
export function clampView(view: CropView, width: number, height: number): CropView {
  const zoom = clamp(Number.isFinite(view.zoom) ? view.zoom : 1, 1, MAX_ZOOM);
  const half = Math.min(width, height) / zoom / 2;
  return {
    zoom,
    cx: clamp(view.cx, half / width, 1 - half / width),
    cy: clamp(view.cy, half / height, 1 - half / height),
  };
}

export function sourceSquare(view: CropView, width: number, height: number): Square {
  const { cx, cy, zoom } = clampView(view, width, height);
  const size = Math.min(width, height) / zoom;
  return { x: cx * width - size / 2, y: cy * height - size / 2, size };
}

/**
 * Drags the photo under the window. `dx` and `dy` are fractions of the
 * window's width: dragging the photo right shows more of its left side.
 */
export function pan(
  view: CropView,
  dx: number,
  dy: number,
  width: number,
  height: number,
): CropView {
  const { size } = sourceSquare(view, width, height);
  return clampView(
    { ...view, cx: view.cx - (dx * size) / width, cy: view.cy - (dy * size) / height },
    width,
    height,
  );
}

const percent = (value: number) => Math.round(value * 10000) / 100;

export function toStored(square: Square, width: number, height: number): StoredCrop {
  return {
    x: percent(square.x / width),
    y: percent(square.y / height),
    size: percent(square.size / Math.min(width, height)),
  };
}

/** Reads a crop sent by a browser; null unless it is three sensible percentages. */
export function parseStoredCrop(value: unknown): StoredCrop | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y, size } = value as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 100;
  return ok(x) && ok(y) && ok(size) && size > 0 ? { x, y, size } : null;
}

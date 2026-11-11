/**
 * Names of stored files ("keys") and the address the app serves them from.
 * Files are private: they are only ever read through /api/files, which checks
 * the session. Pure, safe in the browser.
 */

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/tiff": "tif",
  "image/gif": "gif",
};

/** 50 MB: enough for a high-resolution scan. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const KEY = /^[a-z0-9]+(?:[/._-][A-Za-z0-9]+)*$/;

/** True for keys this app writes: plain path segments, no "..", no leading slash. */
export function isSafeKey(key: string): boolean {
  return key.length <= 300 && KEY.test(key) && !key.includes("..");
}

/** Where a browser uploads a new original: originals/<uuid>.<ext>. */
export function originalKey(uploadId: string, contentType: string): string | null {
  const extension = IMAGE_TYPES[contentType];
  if (!extension || !/^[0-9a-f-]{36}$/.test(uploadId)) return null;
  return `originals/${uploadId}.${extension}`;
}

export function isOriginalKey(key: string): boolean {
  return /^originals\/[0-9a-f-]{36}\.(jpg|png|webp|tif|gif)$/.test(key);
}

export function derivedKeys(photoId: string): { display: string; thumb: string } {
  return { display: `photos/${photoId}/display.jpg`, thumb: `photos/${photoId}/thumb.jpg` };
}

export function fileUrl(key: string): string {
  return `/api/files/${key}`;
}

/** The key behind a /api/files address, or null if it is not one. */
export function keyFromUrl(url: string): string | null {
  const key = url.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;
  return key && isSafeKey(key) ? key : null;
}

export function contentTypeForKey(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const found = Object.entries(IMAGE_TYPES).find(([, ext]) => ext === extension);
  return found?.[0] ?? "application/octet-stream";
}

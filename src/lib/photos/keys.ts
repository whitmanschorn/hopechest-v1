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

/** A person's cropped profile picture. A new one gets a new key, so browsers never show a stale one. */
export function avatarKey(personId: string, pictureId: string): string {
  return `avatars/${personId}/${pictureId}.jpg`;
}

/** What a document can be uploaded as: papers, typed text, or a picture of a page. */
export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  ...IMAGE_TYPES,
};

/** A document file's type: what the browser says, else what its name says. */
export function documentContentType(filename: string, type: string): string | null {
  if (DOCUMENT_TYPES[type]) return type;
  const extension = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  const byName: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    tif: "image/tiff",
    tiff: "image/tiff",
    gif: "image/gif",
  };
  return byName[extension] ?? null;
}

/** Where a new document's file is uploaded: documents/files/<uuid>.<ext>. */
export function documentFileKey(uploadId: string, contentType: string): string | null {
  const extension = DOCUMENT_TYPES[contentType];
  if (!extension || !/^[0-9a-f-]{36}$/.test(uploadId)) return null;
  return `documents/files/${uploadId}.${extension}`;
}

export function isDocumentFileKey(key: string): boolean {
  return /^documents\/files\/[0-9a-f-]{36}\.(pdf|txt|md|jpg|png|webp|tif|gif)$/.test(key);
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
  const found = Object.entries(DOCUMENT_TYPES).find(([, ext]) => ext === extension);
  return found?.[0] ?? "application/octet-stream";
}

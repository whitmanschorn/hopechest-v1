import { getChestConfig } from "@/lib/chest";
import { blobStorage } from "./blob";
import { localStorage } from "./local";

export interface StoredFile {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number | null;
}

/**
 * Where photo and document files live. Keys are paths like
 * "photos/<id>/display.jpg" (see src/lib/photos/keys.ts). Nothing here is
 * public: files are read back only through /api/files.
 */
export interface Storage {
  kind: "blob" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  /** The whole file in memory. For originals about to be processed. */
  read(key: string): Promise<Buffer | null>;
  delete(keys: string[]): Promise<void>;
}

/**
 * Vercel Blob when its token is set (staging and the family sites); a folder
 * on disk otherwise, which is only allowed outside production.
 */
export function getStorage(): Storage {
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobStorage();
  if (getChestConfig().env === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is required when HOPECHEST_ENV=production");
  }
  return localStorage();
}

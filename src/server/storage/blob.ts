import { del, get, put } from "@vercel/blob";
import { contentTypeForKey, isSafeKey } from "@/lib/photos/keys";
import type { Storage } from "./index";

function check(key: string): string {
  if (!isSafeKey(key)) throw new Error(`Unsafe file key: ${key}`);
  return key;
}

/** A private Vercel Blob store. Reads need the store's token, which only the server has. */
export function blobStorage(): Storage {
  return {
    kind: "blob",
    async put(key, body, contentType) {
      await put(check(key), body, {
        access: "private",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    },
    async get(key) {
      const found = await get(check(key), { access: "private" });
      if (!found || !found.stream) return null;
      return {
        body: found.stream,
        contentType: found.blob.contentType ?? contentTypeForKey(key),
        size: found.blob.size ?? null,
      };
    },
    async read(key) {
      const found = await get(check(key), { access: "private", useCache: false });
      if (!found || !found.stream) return null;
      return Buffer.from(await new Response(found.stream).arrayBuffer());
    },
    async delete(keys) {
      if (keys.length > 0) await del(keys.map(check));
    },
  };
}

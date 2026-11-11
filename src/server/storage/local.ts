import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { contentTypeForKey, isSafeKey } from "@/lib/photos/keys";
import type { Storage } from "./index";

/** Files on this machine, for development and CI. Set FILES_DIR to move it. */
export function localStorage(): Storage {
  // The comments below stop the bundler from packing the whole project into the
  // hosted build on account of these paths; this store never runs there.
  const root = resolve(/*turbopackIgnore: true*/ process.env.FILES_DIR ?? ".data/files");

  const pathFor = (key: string): string => {
    const path = resolve(/*turbopackIgnore: true*/ join(root, key));
    if (!isSafeKey(key) || !path.startsWith(root + sep)) throw new Error(`Unsafe file key: ${key}`);
    return path;
  };

  return {
    kind: "local",
    async put(key, body) {
      const path = pathFor(key);
      await mkdir(/*turbopackIgnore: true*/ dirname(path), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ path, body);
    },
    async get(key) {
      const path = pathFor(key);
      const info = await stat(/*turbopackIgnore: true*/ path).catch(() => null);
      if (!info?.isFile()) return null;
      return {
        body: Readable.toWeb(
          createReadStream(/*turbopackIgnore: true*/ path),
        ) as ReadableStream<Uint8Array>,
        contentType: contentTypeForKey(key),
        size: info.size,
      };
    },
    async read(key) {
      return readFile(/*turbopackIgnore: true*/ pathFor(key)).catch(() => null);
    },
    async delete(keys) {
      await Promise.all(
        keys.map((key) => rm(/*turbopackIgnore: true*/ pathFor(key), { force: true })),
      );
    },
  };
}

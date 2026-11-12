import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { IMAGE_TYPES, isOriginalKey, MAX_UPLOAD_BYTES, originalKey } from "@/lib/photos/keys";
import { can } from "@/server/actor";
import { actorFromRequest } from "@/server/api/http";
import { getStorage } from "@/server/storage";

/** A signed-in member, or a program with an API key, who may add photos. */
async function uploader(request: Request) {
  const actor = await actorFromRequest(request);
  return actor && can(actor, "write") ? actor : null;
}

/**
 * Hosted sites: the browser sends the file straight to the file store, which
 * has no size limit, and asks here first for a short-lived permission to write
 * one named original. (Requests through the app itself are capped at a few MB.)
 */
export async function POST(request: Request) {
  if (getStorage().kind !== "blob") return new Response("Not available here", { status: 404 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await uploader(request))) throw new Error("Not allowed");
        if (!isOriginalKey(pathname)) throw new Error("Unexpected file name");
        return {
          allowedContentTypes: Object.keys(IMAGE_TYPES),
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

/**
 * Development and CI: the file comes through the app and is written to disk.
 * PUT /api/uploads?id=<uuid> with the file as the body.
 */
export async function PUT(request: Request) {
  const storage = getStorage();
  if (storage.kind !== "local") return new Response("Not available here", { status: 404 });
  if (!(await uploader(request))) return new Response("Not allowed", { status: 401 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
  const key = originalKey(id, contentType);
  if (!key) return Response.json({ error: "That kind of file is not accepted." }, { status: 415 });

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is too large." }, { status: 413 });
  }
  await storage.put(key, bytes, contentType);
  return Response.json({ key });
}

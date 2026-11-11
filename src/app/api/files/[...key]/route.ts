import { isSafeKey } from "@/lib/photos/keys";
import { can } from "@/server/actor";
import { currentActor } from "@/server/auth/session";
import { getStorage } from "@/server/storage";

/**
 * Serves a stored photo or document to signed-in family members only. Stored
 * files have no public address; this is the one way to read them.
 */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const actor = await currentActor();
  if (!actor || !can(actor, "read")) return new Response("Sign in to see this.", { status: 401 });

  const key = (await params).key.join("/");
  if (!isSafeKey(key)) return new Response("Not found", { status: 404 });
  const file = await getStorage().get(key);
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      ...(file.size !== null ? { "Content-Length": String(file.size) } : {}),
      // A key's content never changes, so the browser may keep it; shared caches may not.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

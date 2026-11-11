import { can } from "@/server/actor";
import { currentActor } from "@/server/auth/session";
import { registerPhoto } from "@/server/photos/service";

// Making the smaller copies of a large scan takes a few seconds.
export const maxDuration = 60;

/** POST { key, filename }: turn an uploaded original into a photo. */
export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor || !can(actor, "write"))
    return Response.json({ error: "Not allowed" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    key?: unknown;
    filename?: unknown;
  } | null;
  if (typeof body?.key !== "string")
    return Response.json({ error: "Missing key" }, { status: 400 });

  const result = await registerPhoto(actor, {
    key: body.key,
    filename: typeof body.filename === "string" ? body.filename : undefined,
  });
  if (!result.ok) return Response.json({ error: result.message }, { status: 422 });
  return Response.json({ id: result.id, duplicate: result.duplicate });
}

import { matchPath } from "@/lib/api/match";
import { can, ForbiddenError, type Actor } from "@/server/actor";
import { actorForApiKey } from "@/server/apiKeys/service";
import { currentActor } from "@/server/auth/session";
import { describeApi, ROUTES } from "./routes";

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const problem = (status: number, error: string, message: string) =>
  json(status, { error, message });

/**
 * Who is calling: the owner of the key in `Authorization: Bearer hc_...`, or
 * failing that the signed-in member (so the API can be explored in a browser).
 */
async function actorFromRequest(request: Request): Promise<Actor | null> {
  const header = request.headers.get("authorization");
  if (header) {
    const [scheme, key] = header.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !key) return null;
    return actorForApiKey(key);
  }
  return currentActor();
}

/** Larger than any real request to these routes; photos are uploaded elsewhere. */
const MAX_BODY_BYTES = 256 * 1024;

/** Answers one request to /api/v1/<path>. */
export async function handleApi(request: Request, path: readonly string[]): Promise<Response> {
  const actor = await actorFromRequest(request);
  if (!actor) {
    return problem(
      401,
      "unauthorized",
      "Send an API key as `Authorization: Bearer hc_...`. An admin makes keys under Settings.",
    );
  }

  if (path.length === 0) {
    if (request.method !== "GET") return problem(405, "method_not_allowed", "Use GET here.");
    return json(
      200,
      describeApi(actor, (permission) => can(actor, permission)),
    );
  }

  const matches = ROUTES.map((route) => ({ route, params: matchPath(route.path, path) })).filter(
    (entry): entry is { route: (typeof ROUTES)[number]; params: Record<string, string> } =>
      entry.params !== null,
  );
  if (matches.length === 0) {
    return problem(404, "not_found", "No such address. GET /api/v1 lists them all.");
  }
  const match = matches.find((entry) => entry.route.method === request.method);
  if (!match) {
    const allowed = matches.map((entry) => entry.route.method).join(", ");
    return problem(405, "method_not_allowed", `This address takes ${allowed}.`);
  }

  let body: Record<string, unknown> = {};
  if (request.method === "POST" || request.method === "PATCH") {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return problem(413, "too_large", "That request is too large.");
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return problem(400, "bad_json", "The body must be a JSON object.");
    }
  }

  try {
    const reply = await match.route.run({
      actor,
      params: match.params,
      query: new URL(request.url).searchParams,
      body,
    });
    return json(reply.status, reply.body);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return problem(
        403,
        "forbidden",
        `This key may not do that: it needs "${match.route.needs}".`,
      );
    }
    console.error("API request failed", request.method, path.join("/"), error);
    return problem(500, "server_error", "Something went wrong on our side.");
  }
}

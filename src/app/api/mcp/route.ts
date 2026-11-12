import { actorForApiKey } from "@/server/apiKeys/service";
import { handleMcp } from "@/server/mcp/server";

/**
 * The MCP server (Streamable HTTP): the same operations as /api/v1, offered
 * as tools to assistants such as Claude Code. Callers send an API key, as for
 * the REST API. See docs/mcp.md.
 */
async function handle(request: Request): Promise<Response> {
  const [scheme, key] = (request.headers.get("authorization") ?? "").split(/\s+/, 2);
  const actor = scheme?.toLowerCase() === "bearer" && key ? await actorForApiKey(key) : null;
  if (!actor) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Send an API key as `Authorization: Bearer hc_...`. An admin makes keys under Settings.",
        },
        id: null,
      },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }
  return handleMcp(request, actor);
}

export { handle as GET, handle as POST, handle as DELETE };

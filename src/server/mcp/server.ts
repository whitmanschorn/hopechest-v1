import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { splitArguments } from "@/lib/api/match";
import { getChestConfig } from "@/lib/chest";
import { can, ForbiddenError, type Actor } from "@/server/actor";
import { ROUTES } from "@/server/api/routes";
import { TOOLS } from "./tools";

const routeFor = (tool: (typeof TOOLS)[number]) => {
  const [method, path] = tool.route.split(" ");
  const route = ROUTES.find((entry) => entry.method === method && entry.path === path);
  if (!route)
    throw new Error(`MCP tool ${tool.name} names a route that does not exist: ${tool.route}`);
  return route;
};

/** Every tool with the route it runs. Throws at start-up if one points nowhere. */
export const TOOL_ROUTES = TOOLS.map((tool) => ({ tool, route: routeFor(tool) }));

/**
 * An MCP server for one caller. It offers only the tools that caller may
 * use, so a read-only key never sees the ones that change things.
 */
function serverFor(actor: Actor): McpServer {
  const chest = getChestConfig();
  const server = new McpServer(
    { name: `hopechest-${chest.slug}`, version: "1.0.0" },
    {
      instructions:
        `This is the ${chest.name} chest: a private family archive of people, relationships, ` +
        "dated events, places, photos and documents. People and places are addressed by slug; " +
        "events, photos, albums and documents by id. Dates are text as a person would write them " +
        '("1967-12-14", "1989", "around 1964") and come back with a precision and, when they were ' +
        "worked out rather than recorded, a `deduced` flag and a clue: say so when you answer. " +
        "Answer from what is recorded and cite the sources an event carries; if something is not " +
        "recorded, say that instead of guessing." +
        (chest.env === "production"
          ? ""
          : " This deployment holds the fictional Bluth family as sample data."),
    },
  );

  for (const { tool, route } of TOOL_ROUTES) {
    if (!can(actor, route.needs)) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: {
          readOnlyHint: route.method === "GET",
          destructiveHint: route.method === "DELETE",
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const reply = await route.run({
            actor,
            ...splitArguments(route.method, route.path, args),
          });
          return {
            content: [{ type: "text" as const, text: JSON.stringify(reply.body, null, 1) }],
            isError: reply.status >= 400,
          };
        } catch (error) {
          if (!(error instanceof ForbiddenError)) {
            console.error("MCP tool failed", tool.name, error);
          }
          const message =
            error instanceof ForbiddenError
              ? `This key may not do that: it needs "${route.needs}".`
              : "Something went wrong on our side.";
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }
  return server;
}

/**
 * Answers one MCP request. Nothing is kept between requests (no sessions), so
 * it works on serverless hosting where each request may land somewhere new.
 */
export async function handleMcp(request: Request, actor: Actor): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = serverFor(actor);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // The answer is complete JSON by now, so the pair can be let go.
    void server.close().catch(() => undefined);
  }
}

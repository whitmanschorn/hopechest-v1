#!/usr/bin/env -S node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
// The hopechest command-line tool: reads and changes a chest through its REST
// API (docs/api.md). Usage: node cli/hopechest.ts help   (see docs/cli.md)
import { TOOLS } from "../src/server/mcp/tools.ts";
import {
  buildRequest,
  commandName,
  describeFields,
  parseCommandLine,
  readInput,
  readLooseInput,
  readPairs,
  UsageError,
  type ApiRequest,
} from "./lib/args.ts";
import { resolveTarget, type Target } from "./lib/config.ts";

const RAW_METHODS = ["get", "post", "patch", "delete"];

function overview(): string {
  const width = Math.max(...TOOLS.map((tool) => tool.name.length));
  const commands = TOOLS.map(
    (tool) => `  ${commandName(tool.name).padEnd(width)}  ${tool.title}`,
  ).join("\n");
  return `hopechest: read and change a family chest from the command line.

Usage
  hopechest [--env <name>] <command> [name=value ...]

  --env, -e   Which deployment: local (default), staging, or any name with
              HOPECHEST_<NAME>_URL set. HOPECHEST_TARGET changes the default.
  --body      A JSON object to send, instead of or as well as name=value.
  --help      With a command, lists its fields.

The key comes from HOPECHEST_<NAME>_API_KEY (e.g. HOPECHEST_STAGING_API_KEY).

Commands
  whoami${" ".repeat(Math.max(1, width - 4))}Which chest this is and what the key may do
  routes${" ".repeat(Math.max(1, width - 4))}Every route of the REST API
${commands}

Any route directly
  hopechest get <path> [name=value ...]        hopechest get people q=lucille
  hopechest post|patch|delete <path> [name=value ...]

Examples
  hopechest find-people q=lucille
  hopechest --env staging list-events kind=marriage person=lucille
  hopechest add-event --help
`;
}

function commandHelp(tool: (typeof TOOLS)[number]): string {
  const fields = describeFields(tool.input);
  return (
    `hopechest ${commandName(tool.name)}: ${tool.title}\n\n${tool.description}\n\n` +
    `Runs ${tool.route.replace(" ", " /api/v1/")}\n\n` +
    (fields.length > 0 ? `Fields (name=value)\n${fields.map((f) => `  ${f}`).join("\n")}\n` : "")
  );
}

async function send(target: Target, request: ApiRequest): Promise<number> {
  let response: Response;
  try {
    response = await fetch(`${target.url}/api/v1/${request.path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${target.key}`,
        ...(request.body ? { "Content-Type": "application/json" } : {}),
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
  } catch (error) {
    console.error(`Could not reach ${target.url}: ${(error as Error).message}`);
    return 1;
  }
  const text = await response.text();
  let shown = text;
  try {
    shown = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Not JSON (a proxy's error page, say): show it as it came.
  }
  if (response.ok) {
    if (shown) console.log(shown);
    return 0;
  }
  console.error(`${response.status} from ${target.name} (${target.url})`);
  if (shown) console.error(shown);
  return 1;
}

async function main(argv: string[]): Promise<number> {
  const line = parseCommandLine(argv);
  const command = line.command?.toLowerCase();
  if (!command || command === "help") {
    console.log(overview());
    return 0;
  }
  const tool = TOOLS.find((entry) => commandName(entry.name) === commandName(command));
  if (line.help) {
    console.log(tool ? commandHelp(tool) : overview());
    return 0;
  }

  if (command === "whoami" || command === "routes") {
    const target = resolveTarget(line.env, process.env);
    if (command === "routes") return send(target, { method: "GET", path: "" });
    const response = await fetch(`${target.url}/api/v1`, {
      headers: { Authorization: `Bearer ${target.key}` },
    });
    if (!response.ok) return send(target, { method: "GET", path: "" });
    const index = (await response.json()) as {
      chest: unknown;
      caller: unknown;
      routes: { allowed: boolean }[];
    };
    const allowed = index.routes.filter((route) => route.allowed).length;
    console.log(
      JSON.stringify(
        {
          target: target.name,
          url: target.url,
          chest: index.chest,
          caller: index.caller,
          routes: { allowed, of: index.routes.length },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (RAW_METHODS.includes(command)) {
    const [path, ...words] = line.rest;
    if (!path || path.includes("=")) {
      throw new UsageError(`${command} needs a path, e.g. hopechest ${command} people`);
    }
    const input = readLooseInput(readPairs(words), line.body);
    const clean = path.replace(/^\/?(api\/v1\/)?/, "");
    return send(
      resolveTarget(line.env, process.env),
      buildRequest(`${command.toUpperCase()} ${clean}`, input),
    );
  }

  if (!tool) throw new UsageError(`No command "${line.command}". Try: hopechest help`);
  const input = readInput(tool.input, readPairs(line.rest), line.body);
  return send(resolveTarget(line.env, process.env), buildRequest(tool.route, input));
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exitCode = 2;
}

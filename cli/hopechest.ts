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
  type CommandLine,
} from "./lib/args.ts";
import { parseSidecar } from "../src/lib/ingest/sidecar.ts";
import { convertFacebookExport } from "./facebook.ts";
import { runScan } from "./faces.ts";
import { runIngest } from "./ingest.ts";
import { loadDetector } from "./lib/detect.ts";
import { callApi, UnreachableError } from "./lib/api.ts";
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
  ingest${" ".repeat(Math.max(1, width - 4))}Bring in a folder of pictures and documents (see below)
  facebook-export${" ".repeat(Math.max(1, width - 13))}Turn a Facebook export into a folder to ingest
  scan-faces${" ".repeat(Math.max(1, width - 8))}Find the faces in photos not yet looked over (see below)
${commands}

Any route directly
  hopechest get <path> [name=value ...]        hopechest get people q=lucille
  hopechest post|patch|delete <path> [name=value ...]

Bringing in a folder
  hopechest ingest <folder> [--label "Box 12"] [--date 1974] [--album "Box 12"]
                            [--people "lucille, george-sr"] [--photographer ...]
                            [--source scan] [--dry-run]
  New photos wait in the review queue until someone publishes them. Safe to
  run again: files already in the chest are not sent twice. A picture's own
  details go in a JSON file beside it (slide-001.json); see docs/ingest.md.

Faces
  hopechest scan-faces [limit=<how many photos>] [photo=<id>]
  Finds faces on this computer and sends where they are; no photo leaves the
  chest for anywhere else. Safe to stop and run again. With photo=, looks
  over that one photo again. Then name them on the
  website under Review, "Who is this?". See docs/faces.md.

From Facebook
  hopechest facebook-export <unzipped-export-folder> --out <folder>
  Sends nothing. Writes each photo with what Facebook knew about it, ready
  for "hopechest ingest <folder> --source facebook_export". See docs/facebook.md.

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
  const answer = await callApi(target, request);
  const shown = answer.json === null ? answer.text : JSON.stringify(answer.json, null, 2);
  if (answer.ok) {
    if (shown) console.log(shown);
    return 0;
  }
  console.error(`${answer.status} from ${target.name} (${target.url})`);
  if (shown) console.error(shown);
  return 1;
}

async function ingest(line: CommandLine): Promise<number> {
  const [folder, ...extra] = line.rest;
  if (!folder || extra.length > 0) {
    throw new UsageError(
      "Usage: hopechest ingest <folder> [--label ...] [--date ...] [--album ...]",
    );
  }
  const { label, source, ...details } = line.options;
  const dryRun = details["dry-run"] === "yes";
  delete details["dry-run"];
  const report = await runIngest(
    dryRun ? null : () => resolveTarget(line.env, process.env),
    folder,
    { label, source, dryRun, defaults: parseSidecar(details) },
    (text) => console.error(text),
  );
  console.log(JSON.stringify(report, null, 2));
  return report.failed.length > 0 ? 1 : 0;
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

  if (command === "facebook-export") {
    const { out, ...others } = line.options;
    const [folder, ...extra] = line.rest;
    if (!folder || extra.length > 0 || Object.keys(others).length > 0) {
      throw new UsageError(
        "Usage: hopechest facebook-export <unzipped-export-folder> --out <folder>",
      );
    }
    const report = convertFacebookExport(folder, out, (text) => console.error(text));
    console.log(JSON.stringify(report, null, 2));
    return 0;
  }
  if (line.options.out) throw new UsageError('--out only goes with "hopechest facebook-export".');
  if (command === "ingest") return ingest(line);
  if (Object.keys(line.options).length > 0) {
    throw new UsageError(`--${Object.keys(line.options)[0]} only goes with "hopechest ingest".`);
  }

  if (command === "scan-faces") {
    const asked = Object.fromEntries(
      line.rest.map((word) => {
        const pair = /^(limit|photo)=(.+)$/.exec(word);
        if (!pair || (pair[1] === "limit" && !/^\d+$/.test(pair[2]))) {
          throw new UsageError(
            "Usage: hopechest scan-faces [limit=<how many photos>] [photo=<id>]",
          );
        }
        return [pair[1], pair[2]];
      }),
    );
    const report = await runScan(
      resolveTarget(line.env, process.env),
      loadDetector,
      { limit: asked.limit ? Number(asked.limit) : undefined, photo: asked.photo },
      (text) => console.error(text),
    );
    console.log(JSON.stringify(report, null, 2));
    return report.failed.length > 0 ? 1 : 0;
  }

  if (command === "whoami" || command === "routes") {
    const target = resolveTarget(line.env, process.env);
    if (command === "routes") return send(target, { method: "GET", path: "" });
    const answer = await callApi(target, { method: "GET", path: "" });
    if (!answer.ok) return send(target, { method: "GET", path: "" });
    const index = answer.json as {
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
  if (!(error instanceof UsageError) && !(error instanceof UnreachableError)) throw error;
  console.error(error.message);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

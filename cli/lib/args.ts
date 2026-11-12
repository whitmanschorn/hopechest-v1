/**
 * Pure helpers for the command-line tool: reading the command line, turning
 * name=value pairs into typed input, and building the request for a route.
 */
import { z } from "zod";
import { splitArguments } from "../../src/lib/api/match.ts";

export class UsageError extends Error {}

export interface CommandLine {
  /** Which deployment to talk to, when given with --env. */
  env?: string;
  /** A whole JSON body given with --body. */
  body?: Record<string, unknown>;
  help: boolean;
  /** Options only some commands take (see COMMAND_OPTIONS), by name. */
  options: Record<string, string>;
  command?: string;
  /** What follows the command: positional words and name=value pairs, in order. */
  rest: string[];
}

/** Options of `hopechest ingest`: those that take a value, and those that do not. */
export const COMMAND_OPTIONS = {
  values: ["label", "source", "date", "album", "photographer", "people"],
  flags: ["dry-run"],
} as const;

/** Splits the words after `hopechest` into options, the command and its arguments. */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  const line: CommandLine = { help: false, options: {}, rest: [] };
  const values: readonly string[] = COMMAND_OPTIONS.values;
  const flags: readonly string[] = COMMAND_OPTIONS.flags;
  for (let index = 0; index < argv.length; index++) {
    const word = argv[index];
    const option = /^--?([a-z][a-z-]*)(?:=(.*))?$/.exec(word);
    if (!option) {
      if (line.command === undefined) line.command = word;
      else line.rest.push(word);
      continue;
    }
    const [, name, inline] = option;
    if (name === "help" || name === "h") {
      line.help = true;
      continue;
    }
    if (flags.includes(name)) {
      line.options[name] = "yes";
      continue;
    }
    if (name !== "env" && name !== "e" && name !== "body" && !values.includes(name)) {
      throw new UsageError(`Unknown option ${word}.`);
    }
    const value = inline ?? argv[++index];
    if (value === undefined) throw new UsageError(`${word} needs a value.`);
    if (name === "body") line.body = parseBody(value);
    else if (name === "env" || name === "e") line.env = value;
    else line.options[name] = value;
  }
  return line;
}

function parseBody(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new UsageError("--body must be JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new UsageError('--body must be a JSON object, such as \'{"title":"Wedding"}\'.');
  }
  return value as Record<string, unknown>;
}

/** name=value words as [name, value] pairs; anything else is refused. */
export function readPairs(words: readonly string[]): [string, string][] {
  return words.map((word) => {
    const at = word.indexOf("=");
    if (at < 1) throw new UsageError(`Expected name=value, got "${word}".`);
    return [word.slice(0, at), word.slice(at + 1)];
  });
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Typed input for a command from name=value pairs. Each value is read the way
 * its field wants it: as text, as JSON (true, 3, a list of objects), or as a
 * comma-separated list. A bare `name=` clears a field.
 */
export function readInput(
  shape: z.ZodRawShape,
  pairs: readonly [string, string][],
  body: Record<string, unknown> = {},
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...body };
  for (const [name, text] of pairs) {
    const field = shape[name] as z.ZodType | undefined;
    if (!field) {
      const known = Object.keys(shape).join(", ") || "none";
      throw new UsageError(`No field "${name}". Fields: ${known}.`);
    }
    const candidates = [
      text,
      tryJson(text),
      text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ];
    const fit = candidates.find(
      (candidate) => candidate !== undefined && field.safeParse(candidate).success,
    );
    if (fit === undefined) {
      const reason = field.safeParse(text).error?.issues[0]?.message ?? "not valid";
      throw new UsageError(`${name}: ${reason}.`);
    }
    input[name] = fit;
  }
  const checked = z.object(shape).safeParse(input);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    const missing = issue.path.length === 1 && !(String(issue.path[0]) in input);
    throw new UsageError(
      missing
        ? `Missing ${String(issue.path[0])}=...`
        : `${issue.path.join(".") || "input"}: ${issue.message}.`,
    );
  }
  return input;
}

/**
 * Input for a raw call (`hopechest post events title=...`), where there is no
 * description of the fields: a value that reads as a JSON list, object or
 * true/false is taken as that, anything else as text.
 */
export function readLooseInput(
  pairs: readonly [string, string][],
  body: Record<string, unknown> = {},
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...body };
  for (const [name, text] of pairs) {
    const parsed = tryJson(text);
    input[name] = typeof parsed === "object" || typeof parsed === "boolean" ? parsed : text;
  }
  return input;
}

export interface ApiRequest {
  method: string;
  /** Path and query below /api/v1/, e.g. "people?q=lucille". */
  path: string;
  body?: Record<string, unknown>;
}

/** The request that runs `route` ("GET people/:slug") with this input. */
export function buildRequest(route: string, input: Record<string, unknown>): ApiRequest {
  const [method, pattern] = route.split(" ");
  const { params, query, body } = splitArguments(method, pattern, input);
  const path = pattern
    .split("/")
    .map((part) => {
      if (!part.startsWith(":")) return part;
      const value = params[part.slice(1)];
      if (!value) throw new UsageError(`Missing ${part.slice(1)}=...`);
      return encodeURIComponent(value);
    })
    .join("/");
  const search = query.toString();
  return {
    method,
    path: search ? `${path}?${search}` : path,
    ...(method === "GET" || method === "DELETE" ? {} : { body }),
  };
}

/** "find_people" and "find-people" are the same command. */
export const commandName = (toolName: string) => toolName.replaceAll("_", "-");

/** One line per field for a command's help: name, whether needed, what it is. */
export function describeFields(shape: z.ZodRawShape): string[] {
  const schema = z.toJSONSchema(z.object(shape)) as {
    properties?: Record<
      string,
      { type?: string; enum?: string[]; description?: string; items?: { type?: string } }
    >;
    required?: string[];
  };
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, field]) => {
    const kind = field.enum
      ? field.enum.join(" | ")
      : field.type === "array"
        ? field.items?.type === "object"
          ? "JSON list"
          : "list, comma-separated"
        : field.type === "boolean"
          ? "true | false"
          : field.type === "string" || !field.type
            ? "text"
            : field.type;
    const detail = field.description ? `  ${field.description}` : "";
    return `${name}${required.has(name) ? " (needed)" : ""}  [${kind}]${detail}`;
  });
}

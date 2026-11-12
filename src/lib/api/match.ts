/**
 * Small helpers for the REST API: matching a path against a pattern such as
 * "people/:slug", and turning JSON values into the text the forms take.
 * Pure, so the same rules are easy to test.
 */

/** The captured parts if `path` fits `pattern`, else null. */
export function matchPath(pattern: string, path: readonly string[]): Record<string, string> | null {
  const parts = pattern === "" ? [] : pattern.split("/");
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.startsWith(":")) params[part.slice(1)] = path[index];
    else if (part !== path[index]) return null;
  }
  return params;
}

/**
 * JSON to form text: the services take what a person would type. true/false
 * become "yes"/"no", lists become comma-separated, nothing becomes "".
 */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  return "";
}

/** A list of strings from a JSON list, or from comma-separated text. */
export function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean);
  return asText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * `current` with the fields present in `body` replaced, each as form text.
 * Fields the body does not mention are left as they are; unknown ones are ignored.
 */
export function mergeText<T extends { [K in keyof T]: string }>(
  current: T,
  body: Record<string, unknown>,
): T {
  const merged = { ...current } as Record<string, string>;
  for (const key of Object.keys(current)) {
    if (key in body) merged[key] = asText(body[key]);
  }
  return merged as T;
}

/** Calls a deployment's REST API with its key. */
import type { ApiRequest } from "./args.ts";
import type { Target } from "./config.ts";

export interface ApiAnswer {
  status: number;
  ok: boolean;
  /** The answer read as JSON, or null if it was not JSON. */
  // Answers are free-form JSON; callers read the fields they expect.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
  text: string;
}

/** The server could not be reached, or would not do what was asked. Exit code 1. */
export class UnreachableError extends Error {}

export async function callApi(target: Target, request: ApiRequest): Promise<ApiAnswer> {
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
    throw new UnreachableError(`Could not reach ${target.url}: ${(error as Error).message}`);
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON (a proxy's error page, say).
  }
  return { status: response.status, ok: response.ok, json, text };
}

/** What the server said went wrong, in one line. */
export function refusal(answer: ApiAnswer): string {
  const fields = Object.values((answer.json?.fields ?? {}) as Record<string, string>).join(" ");
  return [`${answer.status}:`, answer.json?.message ?? answer.text.slice(0, 200), fields]
    .filter(Boolean)
    .join(" ");
}

/**
 * Where each deployment lives and which key to send. Addresses and keys come
 * from the environment, never from a file in this (public) repository.
 */
import { UsageError } from "./args.ts";

const DEFAULT_URLS: Record<string, string> = {
  local: "http://localhost:3000",
  staging: "https://hopechest-staging.vercel.app",
};

export interface Target {
  name: string;
  url: string;
  key: string;
}

/** The variables that configure a deployment called `name`. */
export function variablesFor(name: string): { url: string; key: string } {
  const stem = `HOPECHEST_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  return { url: `${stem}_URL`, key: `${stem}_API_KEY` };
}

/**
 * The deployment to talk to: the one named with --env, else HOPECHEST_TARGET,
 * else the local server.
 */
export function resolveTarget(
  requested: string | undefined,
  env: Record<string, string | undefined>,
): Target {
  const name = (requested ?? env.HOPECHEST_TARGET ?? "local").toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new UsageError(`"${name}" is not a deployment name.`);
  const variables = variablesFor(name);
  const url = (env[variables.url] ?? DEFAULT_URLS[name] ?? "").replace(/\/+$/, "");
  if (!url) {
    throw new UsageError(
      `No address for "${name}". Set ${variables.url}, e.g. export ${variables.url}=https://...`,
    );
  }
  const key = env[variables.key] ?? "";
  if (!key) {
    throw new UsageError(
      `No key for "${name}". Sign in to ${url} as an admin, make a key under Settings, ` +
        `then: export ${variables.key}=hc_...`,
    );
  }
  return { name, url, key };
}

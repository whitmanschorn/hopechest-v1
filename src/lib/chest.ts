export type HopechestEnv = "development" | "preview" | "staging" | "production";

export interface ChestConfig {
  /** Which deployment this is. Production refuses dev-only shortcuts. */
  env: HopechestEnv;
  /** Display name, e.g. "Schorn family". */
  name: string;
  /** URL-safe id of the family this deployment serves, e.g. "schorn". */
  slug: string;
}

const ENVS: readonly HopechestEnv[] = ["development", "preview", "staging", "production"];

/**
 * Each deployment serves exactly one family, chosen by environment variables.
 * Pass `source` in tests; it defaults to `process.env`.
 */
export function getChestConfig(
  source: Record<string, string | undefined> = process.env,
): ChestConfig {
  const rawEnv = source.HOPECHEST_ENV ?? "development";
  if (!ENVS.includes(rawEnv as HopechestEnv)) {
    throw new Error(`HOPECHEST_ENV must be one of ${ENVS.join(", ")}; got "${rawEnv}"`);
  }
  const env = rawEnv as HopechestEnv;
  const name = source.CHEST_NAME?.trim();
  const slug = source.CHEST_SLUG?.trim();
  if (env === "production" && (!name || !slug)) {
    throw new Error("CHEST_NAME and CHEST_SLUG are required when HOPECHEST_ENV=production");
  }
  if (slug && !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`CHEST_SLUG must be lowercase letters, digits and dashes; got "${slug}"`);
  }
  return { env, name: name || "Bluth family", slug: slug || "bluth" };
}

export function isProduction(config: ChestConfig = getChestConfig()): boolean {
  return config.env === "production";
}

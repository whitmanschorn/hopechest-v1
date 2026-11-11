/** Rules that keep migration pull requests from blocking each other. */

export interface Migration {
  /** Directory name, e.g. "20261111000000_init". */
  name: string;
  sql: string;
}

const NAME = /^(\d{14})_[a-z0-9_]+$/;

/** Statements that remove or rewrite existing data or columns. */
const DESTRUCTIVE: readonly RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+TYPE\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
  /\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i,
  /\bRENAME\s+(COLUMN|TO)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];

/** A migration may opt out by explaining itself: `-- destructive: <reason>`. */
const ALLOWED = /^--\s*destructive:\s*\S+/im;

/**
 * @param all       every migration in the working tree
 * @param baseNames migration directory names on the base branch
 * @param changed   names of base-branch migrations whose SQL differs from base
 */
export function checkMigrations(
  all: readonly Migration[],
  baseNames: readonly string[],
  changed: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  const base = new Set(baseNames);

  for (const migration of all) {
    const match = NAME.exec(migration.name);
    if (!match) {
      problems.push(`${migration.name}: name must be <14-digit timestamp>_<snake_case_name>`);
      continue;
    }
    const other = seen.get(match[1]);
    if (other) {
      problems.push(
        `${migration.name}: same timestamp as ${other}; rename the newer one with a later timestamp`,
      );
    }
    seen.set(match[1], migration.name);

    if (base.has(migration.name)) continue;
    const stripped = migration.sql.replace(/--.*$/gm, "");
    const hit = DESTRUCTIVE.find((pattern) => pattern.test(stripped));
    if (hit && !ALLOWED.test(migration.sql)) {
      problems.push(
        `${migration.name}: removes or rewrites existing data (${hit.source}). Migrations add; ` +
          `remove in a later pull request once nothing reads the old shape, and say why with a ` +
          `"-- destructive: <reason>" comment.`,
      );
    }
  }

  const present = new Set(all.map((migration) => migration.name));
  for (const name of baseNames) {
    if (!present.has(name)) problems.push(`${name}: merged migrations must not be deleted`);
  }
  for (const name of changed) {
    problems.push(`${name}: merged migrations must not be edited; add a new migration instead`);
  }
  return problems;
}

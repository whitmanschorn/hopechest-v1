// Checks prisma/migrations against the base branch.
// Usage: node scripts/check-migrations.ts [base-ref]   (default origin/main)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMigrations } from "./lib/migrations.ts";

const DIR = "prisma/migrations";
const base = process.argv[2] ?? "origin/main";

function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

const all = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const file = join(DIR, entry.name, "migration.sql");
    return { name: entry.name, sql: existsSync(file) ? readFileSync(file, "utf8") : "" };
  });

// Without the base ref (a fresh clone with no remote), only the local rules apply.
const listing = git("ls-tree", "-d", "--name-only", `${base}:${DIR}`);
const baseNames = listing ? listing.split("\n").filter(Boolean) : [];
const changed = baseNames.filter((name) => {
  const merged = git("show", `${base}:${DIR}/${name}/migration.sql`);
  const current = all.find((migration) => migration.name === name);
  return merged !== null && current !== undefined && merged !== current.sql;
});

const problems = checkMigrations(all, baseNames, changed);
if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log(
  `${all.length} migration(s) OK (${all.length - baseNames.length} new against ${base}).`,
);

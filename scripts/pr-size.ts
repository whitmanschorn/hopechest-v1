// Fails when a pull request changes more than the allowed number of lines.
// Usage: node scripts/pr-size.ts <base-ref> [limit]
// Set SIZE_EXCEPTION=true (CI does this for the "size-exception" label) to
// report without failing.
import { execFileSync } from "node:child_process";
import { DEFAULT_LIMIT, measure } from "./lib/prSize.ts";

const base = process.argv[2] ?? "origin/main";
const limit = Number(process.argv[3] ?? DEFAULT_LIMIT);
const numstat = execFileSync("git", ["diff", "--numstat", `${base}...HEAD`], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const report = measure(numstat);

console.log(`Changed lines counted: ${report.counted} (limit ${limit})`);
console.log(`Excluded (lockfiles, seed data, generated files): ${report.excluded}`);
for (const file of report.largest) console.log(`  ${String(file.lines).padStart(6)}  ${file.path}`);

if (report.counted > limit) {
  if (process.env.SIZE_EXCEPTION === "true") {
    console.log("Over the limit, allowed by the size-exception label.");
  } else {
    console.error(
      `Over the ${limit}-line limit. Split the pull request, or add the "size-exception" label.`,
    );
    process.exit(1);
  }
}

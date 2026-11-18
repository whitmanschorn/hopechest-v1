import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every page here is drawn from the database for whoever is signed in. Next
 * would otherwise fetch each linked page as soon as its link is on screen, so
 * one page view made the server draw every page in the menu, and every photo
 * in a grid: about ten times the database work. Links say `prefetch={false}`.
 */
const files = (readdirSync(join(__dirname, "../.."), { recursive: true }) as string[])
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => join(__dirname, "../..", file));

it("no link fetches its page before it is asked for", () => {
  const eager: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<Link\b[^>]*>|component=\{Link\}[^>]*>/g)) {
      if (!match[0].includes("prefetch={false}")) eager.push(`${file}: ${match[0].slice(0, 60)}`);
    }
  }
  expect(eager).toEqual([]);
});

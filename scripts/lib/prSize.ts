/** Paths that do not count toward the pull-request size limit. */
export const EXCLUDED: readonly RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /^seed\//,
  /^prisma\/migrations\/.*\/migration\.sql$/,
  /^src\/generated\//,
  /\.snap$/,
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?)$/i,
];

export const DEFAULT_LIMIT = 10_000;

export interface SizeReport {
  counted: number;
  excluded: number;
  largest: { path: string; lines: number }[];
}

/** Sums added + deleted lines from `git diff --numstat` output. */
export function measure(numstat: string): SizeReport {
  let counted = 0;
  let excluded = 0;
  const files: { path: string; lines: number }[] = [];
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [added, deleted, ...rest] = line.split("\t");
    const path = rest.join("\t");
    // Binary files report "-" for both counts.
    const lines = (Number(added) || 0) + (Number(deleted) || 0);
    if (EXCLUDED.some((pattern) => pattern.test(path))) {
      excluded += lines;
    } else {
      counted += lines;
      files.push({ path, lines });
    }
  }
  files.sort((a, b) => b.lines - a.lines);
  return { counted, excluded, largest: files.slice(0, 5) };
}

/** "Lindsay Bluth Fünke" -> "lindsay-bluth-funke". Empty input gives "". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The first of `base`, `base-2`, `base-3`... that `taken` does not hold. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, fallback = "item"): string {
  const root = base || fallback;
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

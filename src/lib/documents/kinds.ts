/** The kinds of document a chest keeps, and small pure helpers for showing them. */

export const DOCUMENT_KINDS = ["letter", "record", "recipe", "story", "article", "other"] as const;
export type DocumentKindName = (typeof DOCUMENT_KINDS)[number];

export const KIND_LABELS: Record<string, string> = {
  record: "Record",
  letter: "Letter",
  recipe: "Recipe",
  story: "Story",
  article: "Article",
  other: "Document",
};

export const KIND_HINTS: Record<DocumentKindName, string> = {
  letter: "Letters, cards, notes",
  record: "Certificates, licences, deeds, census pages",
  recipe: "Recipes",
  story: "Memoirs, eulogies, things written down to be remembered",
  article: "Newspaper clippings and pieces written about the family",
  other: "Anything else",
};

export const isKind = (value: string): value is DocumentKindName =>
  (DOCUMENT_KINDS as readonly string[]).includes(value);

/** The longest text a document may hold: about 500 pages. */
export const MAX_TEXT_LENGTH = 1_000_000;

/** Marks put around matched words in a search result's excerpt. */
export const HIT_START = "‹‹";
export const HIT_END = "››";

/** An excerpt split into plain and matched pieces, for drawing the matches in bold. */
export function splitExcerpt(excerpt: string): { text: string; hit: boolean }[] {
  const pieces: { text: string; hit: boolean }[] = [];
  let rest = excerpt;
  while (rest) {
    const start = rest.indexOf(HIT_START);
    const end = start < 0 ? -1 : rest.indexOf(HIT_END, start);
    if (start < 0 || end < 0) {
      pieces.push({ text: rest, hit: false });
      break;
    }
    if (start > 0) pieces.push({ text: rest.slice(0, start), hit: false });
    pieces.push({ text: rest.slice(start + HIT_START.length, end), hit: true });
    rest = rest.slice(end + HIT_END.length);
  }
  return pieces.filter((piece) => piece.text);
}

/** A title from a file name: "klara-letter_1933.pdf" becomes "klara letter 1933". */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Text as people expect it kept: one kind of line ending, no trailing space, no runs of blank lines. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Citations in an answer. The model marks what it relied on as [person:lucille]
 * or [event:<id>]; a mark is kept only if that very thing came back from a
 * lookup made for this question, so an answer cannot cite what it never read.
 * Pure, safe in the browser.
 */

export const REF_TYPES = ["person", "event", "document", "place", "page", "photo"] as const;
export type RefType = (typeof REF_TYPES)[number];

export interface Ref {
  type: RefType;
  /** A slug (person, place, page) or an id (event, document, photo). */
  id: string;
}

const MARK = new RegExp(String.raw`\s*\[(${REF_TYPES.join("|")}):\s*([A-Za-z0-9-]{1,80})\]`, "gi");

/** True if a lookup's JSON mentions this slug or id as one. */
export function wasSeen(results: readonly string[], ref: Ref): boolean {
  const needles = [`"slug":"${ref.id}"`, `"id":"${ref.id}"`];
  return results.some((result) => needles.some((needle) => result.includes(needle)));
}

/**
 * Turns the model's marks into numbered ones ("[1]") and lists what each
 * number stands for. Marks for things no lookup returned are removed.
 */
export function readAnswer(
  text: string,
  results: readonly string[],
): { text: string; refs: Ref[] } {
  const refs: Ref[] = [];
  const compact = results.map((result) => result.replace(/"\s*:\s*"/g, '":"'));
  const numbered = text.replace(MARK, (_, type: string, id: string) => {
    const ref = { type: type.toLowerCase() as RefType, id };
    if (!wasSeen(compact, ref)) return "";
    let at = refs.findIndex((entry) => entry.type === ref.type && entry.id === ref.id);
    if (at < 0) at = refs.push(ref) - 1;
    return ` [${at + 1}]`;
  });
  return {
    // The same source twice in a row says nothing more than once.
    text: numbered
      .replace(/( \[\d+\])\1+/g, "$1")
      .replace(/[ \t]+([.,;:])/g, "$1")
      .trim(),
    refs,
  };
}

/** Drops numbers whose source could not be found, and renumbers the rest. */
export function renumber(text: string, keep: readonly boolean[]): string {
  const next = new Map<number, number>();
  keep.forEach((kept, index) => {
    if (kept) next.set(index + 1, next.size + 1);
  });
  return text
    .replace(/ ?\[(\d+)\]/g, (_, n: string) =>
      next.has(Number(n)) ? ` [${next.get(Number(n))}]` : "",
    )
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
}

export type AnswerPiece =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "cite"; number: number };

/** One line of an answer as pieces to draw: words, **bold** words and [n] marks. */
export function answerPieces(line: string): AnswerPiece[] {
  const pieces: AnswerPiece[] = [];
  let last = 0;
  for (const match of line.matchAll(/\*\*([^*]+)\*\*|\[(\d+)\]/g)) {
    if (match.index > last) pieces.push({ kind: "text", text: line.slice(last, match.index) });
    if (match[1] !== undefined) pieces.push({ kind: "bold", text: match[1] });
    else pieces.push({ kind: "cite", number: Number(match[2]) });
    last = match.index + match[0].length;
  }
  if (last < line.length) pieces.push({ kind: "text", text: line.slice(last) });
  return pieces;
}

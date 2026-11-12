/**
 * The light markup articles are written in, read into a tree the page draws.
 * Pure, so the editor's preview and the saved page cannot disagree.
 *
 *   ## Heading          ### Smaller heading
 *   - a list item       1. a numbered item
 *   > a quotation
 *   **bold**  *italic*  [[Lucille Bluth]]  [[lucille|Gangy]]  [words](https://…)
 *
 * Nothing here produces HTML: unknown markup stays as the text that was typed.
 */
import { slugify } from "../slug";

export { slugify };

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  /** [[target]] or [[target|label]]: another page of the chest. */
  | { type: "wiki"; target: string; label: string }
  | { type: "link"; href: string; label: string };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[]; id: string }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] };

const INLINE =
  /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) out.push({ type: "text", text: rest.slice(0, match.index) });
    const [whole, target, label, linkLabel, href, bold, italic] = match;
    if (target !== undefined) {
      out.push({ type: "wiki", target: target.trim(), label: (label ?? target).trim() });
    } else if (href !== undefined) out.push({ type: "link", href, label: linkLabel });
    else if (bold !== undefined) out.push({ type: "bold", children: parseInline(bold) });
    else out.push({ type: "italic", children: parseInline(italic) });
    rest = rest.slice(match.index + whole.length);
  }
  return out;
}

/** The words of some inline markup, without the markup. */
export function plainText(inline: readonly Inline[]): string {
  return inline
    .map((node) =>
      node.type === "text"
        ? node.text
        : node.type === "wiki" || node.type === "link"
          ? node.label
          : plainText(node.children),
    )
    .join("");
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkup(source: string): Block[] {
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
      paragraph = [];
    }
    if (list) {
      blocks.push({ type: "list", ...list });
      list = null;
    }
    if (quote.length > 0) {
      blocks.push({ type: "quote", children: parseInline(quote.join(" ")) });
      quote = [];
    }
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      const children = parseInline(heading[2].trim());
      // The page has one title; every heading in the text sits under it.
      const level = heading[1].length <= 2 ? 2 : 3;
      const base = slugify(plainText(children)) || "section";
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      blocks.push({ type: "heading", level, children, id: seen ? `${base}-${seen + 1}` : base });
    } else if (bullet || numbered) {
      const ordered = !bullet;
      if (paragraph.length > 0 || quote.length > 0 || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]));
    } else if (line.startsWith(">")) {
      if (paragraph.length > 0 || list) flush();
      quote.push(line.replace(/^>\s?/, ""));
    } else {
      if (list || quote.length > 0) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Every [[target]] in a text, once each, in order of appearance. */
export function wikiTargets(source: string): string[] {
  const found = new Set<string>();
  const visit = (nodes: readonly Inline[]) => {
    for (const node of nodes) {
      if (node.type === "wiki") found.add(node.target);
      else if (node.type === "bold" || node.type === "italic") visit(node.children);
    }
  };
  for (const block of parseMarkup(source)) {
    if (block.type === "list") block.items.forEach(visit);
    else visit(block.children);
  }
  return [...found];
}

export interface LinkTarget {
  href: string;
  /** Every way this page may be written inside [[ ]]: its slug, title and other names. */
  names: string[];
  /**
   * Which kind wins when two kinds of page share a name: a person (0) before
   * a topic page (1) before a place (2).
   */
  rank: number;
}

/**
 * Finds the page a [[target]] means. A name shared by two pages of the same
 * kind points at neither: a wrong link is worse than an unmade one.
 */
export function makeResolver(targets: readonly LinkTarget[]): (target: string) => string | null {
  const byName = new Map<string, { href: string | null; rank: number }>();
  for (const target of targets) {
    for (const name of new Set(target.names.map(slugify))) {
      if (!name) continue;
      const held = byName.get(name);
      if (!held || target.rank < held.rank)
        byName.set(name, { href: target.href, rank: target.rank });
      else if (target.rank === held.rank && held.href !== target.href) held.href = null;
    }
  }
  return (target) => byName.get(slugify(target))?.href ?? null;
}

/** The longest an article may be: about 100 pages. */
export const MAX_BODY_LENGTH = 200_000;

/**
 * Cutting a document's text into passages. Pure, shared by the app and the
 * seed script.
 */

export interface Chunk {
  heading: string | null;
  text: string;
}

/**
 * Cuts markdown into passages small enough to cite: one per `##` section,
 * and long sections again at paragraph breaks.
 */
export function chunkMarkdown(text: string, maxChars = 1800): Chunk[] {
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let paragraphs: string[] = [];

  const flush = () => {
    let current = "";
    for (const paragraph of paragraphs) {
      if (current && current.length + paragraph.length + 2 > maxChars) {
        chunks.push({ heading, text: current });
        current = "";
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    if (current) chunks.push({ heading, text: current });
    paragraphs = [];
  };

  for (const block of text.split(/\n{2,}/)) {
    for (const part of block.split(/\n(?=#{1,6} )/)) {
      const title = /^#{1,6} +(.+?)\s*(?:\n|$)/.exec(part);
      if (title) {
        flush();
        heading = title[1];
        const rest = part.slice(title[0].length).trim();
        if (rest) paragraphs.push(rest);
      } else if (part.trim()) {
        paragraphs.push(part.trim());
      }
    }
  }
  flush();
  return chunks;
}

import { tidyText } from "@/lib/documents/kinds";

/**
 * The text inside an uploaded file, where a program can read it. A PDF made
 * from scanned pages, and any picture, has no text to read: the answer is
 * null, and someone (or an assistant) types it in afterwards.
 * Throws if the file claims to be a PDF and is not one.
 */
export async function extractText(bytes: Buffer, contentType: string): Promise<string | null> {
  if (contentType === "text/plain" || contentType === "text/markdown") {
    return tidyText(new TextDecoder("utf-8").decode(bytes)) || null;
  }
  if (contentType === "application/pdf") {
    const { extractText: read, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await read(pdf, { mergePages: false });
    return tidyText(text.join("\n\n")) || null;
  }
  return null;
}

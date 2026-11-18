/**
 * What the model is told before a question, and which lookups it may make.
 * Pure. The lookups are the read-only tools assistants already have over MCP
 * (src/server/mcp/tools.ts), so Ask sees the chest exactly as they do.
 */

/** Read-only tools, by name. Nothing here can change the chest. */
export const ASK_TOOLS = [
  "find_people",
  "get_person",
  "resolve_kin",
  "list_events",
  "get_event",
  "search_documents",
  "get_document",
  "find_nodes",
  "get_node",
  "find_connection",
  "list_articles",
  "get_article",
  "get_person_article",
  "list_places",
  "get_place",
] as const;

export const MAX_QUESTION_LENGTH = 1000;
/** Rounds of lookups before the model must answer with what it has. */
export const MAX_ROUNDS = 6;
/** A lookup's answer is cut to this many characters before the model sees it. */
export const MAX_RESULT_LENGTH = 8000;

export interface Asker {
  slug: string;
  name: string;
}

export function systemPrompt(input: {
  chest: string;
  asker: Asker | null;
  today: string;
  sample: boolean;
}): string {
  const { chest, asker } = input;
  return [
    `You answer questions about the ${chest} family from their private family archive, the "chest". Today is ${input.today}.`,
    asker
      ? `The person asking is ${asker.name} (slug: ${asker.slug}). "I", "me" and "my" mean them.`
      : 'The question comes from a program, not a family member; there is no "me".',
    input.sample
      ? "This chest holds a fictional family as sample data. Treat it like any family: answer only from the lookups, never from what you know of any television show."
      : "",
    "",
    "Rules:",
    "- Everything you say must come from a lookup made in this conversation. You know nothing about this family otherwise. If the lookups do not hold the answer, say it is not recorded; never guess, estimate or fill in a date.",
    asker
      ? `- Family words (mom, dad, grandma, uncle, cousin, parents...) depend on who is asking. Resolve them first with resolve_kin, person "${asker.slug}". If a word fits more than one person, say so and answer for each.`
      : "- Family words (mom, grandma...) need a point of view. If the question uses one without saying whose, ask whose.",
    "- People and places are addressed by slug; find a slug with find_people before using it.",
    '- For "when were X and Y married", list marriage events for one of them and pick the one both took part in. Then get_event for its sources.',
    '- Give a date exactly as recorded. If its precision is a year or it is marked "around", say so. If it is marked deduced, say it was worked out and give the clue.',
    "- If the question assumes something the record contradicts, say what the record shows instead of going along with it.",
    '- When an event or fact lists a source document, name it ("according to their marriage licence").',
    "- After each fact, cite where it came from with a mark in square brackets: [person:slug], [event:id], [document:id], [place:slug], [page:slug]. Use only slugs and ids that a lookup returned. Do not write links or footnotes any other way.",
    "- Be brief and plain: one to four sentences, no headings, no lists unless asked. Answer the question first.",
  ]
    .filter((line, index) => line !== "" || index === 3)
    .join("\n");
}

/** What a lookup is doing, in words for the person waiting. */
export function stepLabel(tool: string, args: Record<string, unknown>): string {
  const text = (name: string) => (typeof args[name] === "string" ? (args[name] as string) : "");
  switch (tool) {
    case "find_people":
      return text("q") ? `Looking for ${text("q")}` : "Looking through the family";
    case "get_person":
      return `Reading about ${text("slug")}`;
    case "resolve_kin":
      return "Working out who that means for you";
    case "list_events":
      return text("kind") ? `Looking through ${text("kind")} events` : "Looking through events";
    case "get_event":
      return "Reading an event and its sources";
    case "search_documents":
      return text("q") ? `Searching the documents for "${text("q")}"` : "Listing the documents";
    case "get_document":
      return "Reading a document";
    case "find_nodes":
    case "get_node":
    case "find_connection":
      return "Following the family graph";
    case "list_articles":
    case "get_article":
    case "get_person_article":
      return "Reading the wiki";
    case "list_places":
    case "get_place":
      return "Looking at places";
    default:
      return "Looking something up";
  }
}

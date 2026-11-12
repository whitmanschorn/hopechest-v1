/**
 * What a proposed fact may ask for. Each action is one of the tools that
 * change the family graph (src/server/mcp/tools.ts), so a proposal is simply
 * a change someone has described but not yet made. Pure.
 */

export const CLAIM_ACTIONS = [
  "add_person",
  "update_person",
  "add_relationship",
  "add_event",
  "update_event",
  "add_place",
  "update_place",
] as const;
export type ClaimAction = (typeof CLAIM_ACTIONS)[number];

export const isClaimAction = (value: string): value is ClaimAction =>
  (CLAIM_ACTIONS as readonly string[]).includes(value);

export const ACTION_LABELS: Record<string, string> = {
  add_person: "Add a person",
  update_person: "Change a person",
  add_relationship: "Add a relationship",
  add_event: "Record an event",
  update_event: "Change an event",
  add_place: "Add a place",
  update_place: "Change a place",
  // Written by the seed for facts that came with the sample family.
  "event.create": "Record an event",
};

const FIELD_LABELS: Record<string, string> = {
  displayName: "Name",
  givenName: "Given name",
  familyName: "Family name",
  birthFamilyName: "Family name at birth",
  alternateNames: "Other names",
  born: "Born",
  died: "Died",
  slug: "Who or where",
  id: "Which",
  kind: "Kind",
  title: "Title",
  date: "Date",
  deduced: "Date was worked out",
  clue: "How it was worked out",
  place: "Place",
  participants: "People",
  role: "They are this person's",
  other: "Other person",
  qualifier: "How",
  endReason: "Ended by",
  label: "Name",
  relation: "Related to",
};

const sentence = (name: string) =>
  FIELD_LABELS[name] ??
  name
    .replace(
      /([a-z])([A-Z])/g,
      (_, before: string, after: string) => `${before} ${after.toLowerCase()}`,
    )
    .replace(/^./, (first) => first.toUpperCase());

function show(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map(show).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const entry = value as Record<string, unknown>;
    // A participant: { person, role }; a relation: { role, other, qualifier }.
    if (typeof entry.person === "string") {
      return entry.role && entry.role !== "subject"
        ? `${entry.person} (${show(entry.role)})`
        : entry.person;
    }
    return Object.entries(entry)
      .map(([key, inner]) => `${sentence(key).toLowerCase()} ${show(inner)}`)
      .join(", ");
  }
  return String(value);
}

/** A proposal's arguments as labelled lines a reviewer can read. */
export function describeArgs(args: unknown): { label: string; value: string }[] {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return [];
  return Object.entries(args as Record<string, unknown>)
    .map(([name, value]) => ({ label: sentence(name), value: show(value) }))
    .filter((line) => line.value);
}

/** The longest passage kept as the words a fact was read from. */
export const MAX_QUOTE_LENGTH = 1000;

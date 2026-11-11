/**
 * Turns what someone typed into the event form into checked values, and works
 * out what changed for the edit history. Pure: no database.
 */
import { parseFuzzyDate, type FuzzyDate } from "@/lib/fuzzyDate";

export const EVENT_KINDS = [
  "birth",
  "death",
  "marriage",
  "divorce",
  "move",
  "immigration",
  "military",
  "education",
  "work",
  "other",
] as const;
export type EventKindInput = (typeof EVENT_KINDS)[number];

export const KIND_LABELS: Record<EventKindInput, string> = {
  birth: "Birth",
  death: "Death",
  marriage: "Marriage",
  divorce: "Divorce",
  move: "Move",
  immigration: "Immigration",
  military: "Military service",
  education: "Education",
  work: "Work",
  other: "Other",
};

export const EVENT_ROLES = ["subject", "parent", "child", "officiant", "witness", "other"] as const;
export type EventRoleInput = (typeof EVENT_ROLES)[number];

export const ROLE_LABELS: Record<EventRoleInput, string> = {
  subject: "Subject",
  parent: "Parent",
  child: "Child",
  officiant: "Officiant",
  witness: "Witness",
  other: "Also there",
};

export function isEventKind(value: string): value is EventKindInput {
  return (EVENT_KINDS as readonly string[]).includes(value);
}

/** How many subjects (the people an event is about) each kind must have. */
const SUBJECTS_NEEDED: Partial<Record<EventKindInput, number>> = {
  birth: 1,
  death: 1,
  marriage: 2,
  divorce: 2,
};

export interface ParticipantInput {
  /** Person slug. */
  person: string;
  role: string;
}

/** The event form as submitted: every field is text. */
export interface EventFormInput {
  kind: string;
  title: string;
  description: string;
  /** Free text read by parseFuzzyDate: "1967-12-14", "1989", "c. 1964". */
  date: string;
  /** "yes" when the date was worked out rather than read off a record. */
  deduced: string;
  clue: string;
  /** Place slug, or "" for none. */
  place: string;
  participants: ParticipantInput[];
}

export interface EventParticipantValue {
  person: string;
  role: EventRoleInput;
}

export interface EventValues {
  kind: EventKindInput;
  title: string;
  description: string | null;
  date: FuzzyDate | null;
  place: string | null;
  participants: EventParticipantValue[];
}

export type EventErrors = Partial<
  Record<"kind" | "title" | "description" | "date" | "clue" | "place" | "participants", string>
>;

export const BLANK_EVENT: EventFormInput = {
  kind: "other",
  title: "",
  description: "",
  date: "",
  deduced: "",
  clue: "",
  place: "",
  participants: [],
};

/** Reads "role:person-slug" form values. Anything malformed is dropped. */
export function readParticipants(raw: readonly string[]): ParticipantInput[] {
  const participants: ParticipantInput[] = [];
  for (const entry of raw) {
    const at = entry.indexOf(":");
    if (at <= 0 || at === entry.length - 1) continue;
    participants.push({ role: entry.slice(0, at), person: entry.slice(at + 1) });
  }
  return participants;
}

export function parseEventForm(
  input: EventFormInput,
): { ok: true; values: EventValues } | { ok: false; errors: EventErrors } {
  const errors: EventErrors = {};

  const kind = input.kind.trim();
  if (!isEventKind(kind)) errors.kind = "Pick one of the choices.";

  const title = input.title.trim();
  if (!title) errors.title = "Say what happened.";
  else if (title.length > 200) errors.title = "That title is too long.";

  let date = parseFuzzyDate(input.date);
  if (date && date.year === undefined) {
    errors.date = 'Include a year, such as "1967-12-14", "1989" or "around 1964".';
    date = null;
  }
  const deduced = input.deduced === "yes";
  const clue = input.clue.trim();
  if (deduced) {
    if (!input.date.trim()) errors.date = "A deduced date needs a date.";
    if (!clue) errors.clue = "Say what the deduction rests on.";
    if (date) date = { ...date, deduced: true, clue };
  }

  const participants: EventParticipantValue[] = [];
  const seen = new Set<string>();
  for (const { person, role } of input.participants) {
    if (!(EVENT_ROLES as readonly string[]).includes(role)) {
      errors.participants = "Pick a part for each person.";
      continue;
    }
    if (seen.has(person)) {
      errors.participants = "Each person can be listed once.";
      continue;
    }
    seen.add(person);
    participants.push({ person, role: role as EventRoleInput });
  }
  if (!errors.participants && isEventKind(kind)) {
    const needed = SUBJECTS_NEEDED[kind];
    const subjects = participants.filter((p) => p.role === "subject").length;
    if (needed !== undefined && subjects !== needed) {
      const noun = KIND_LABELS[kind].toLowerCase();
      errors.participants =
        needed === 1
          ? `A ${noun} is about exactly one person. Mark one person as the subject.`
          : `A ${noun} is between exactly two people. Mark two people as subjects.`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      kind: kind as EventKindInput,
      title,
      description: input.description.trim() || null,
      date,
      place: input.place.trim() || null,
      participants,
    },
  };
}

/** A date as it should be typed back into the form. */
export function dateToText(value: FuzzyDate | null): string {
  if (!value) return "";
  const pad = (n: number | undefined) => String(n).padStart(2, "0");
  const plain =
    value.precision === "day"
      ? `${value.year}-${pad(value.month)}-${pad(value.day)}`
      : value.precision === "month"
        ? `${value.year}-${pad(value.month)}`
        : value.precision === "year"
          ? String(value.year)
          : value.display;
  // A date with its own wording ("Spring 2006") is given back as worded, so
  // saving the form again does not lose it.
  return parseFuzzyDate(plain)?.display === value.display ? plain : value.display;
}

/** Fills the form from stored values. */
export function toEventFormInput(values: EventValues): EventFormInput {
  return {
    kind: values.kind,
    title: values.title,
    description: values.description ?? "",
    date: dateToText(values.date),
    deduced: values.date?.deduced ? "yes" : "",
    clue: values.date?.clue ?? "",
    place: values.place ?? "",
    participants: values.participants.map((p) => ({ ...p })),
  };
}

export const EVENT_FIELD_LABELS = {
  kind: "Kind",
  title: "Title",
  description: "Description",
  date: "Date",
  clue: "Date deduced from",
  place: "Place",
  participants: "People",
} as const;
export type EventField = keyof typeof EVENT_FIELD_LABELS;

/** Names for the slugs in `values`, for writing history a person can read. */
export interface EventNames {
  people: ReadonlyMap<string, string>;
  places: ReadonlyMap<string, string>;
}

function showField(field: EventField, values: EventValues, names: EventNames): string | null {
  switch (field) {
    case "kind":
      return KIND_LABELS[values.kind];
    case "title":
      return values.title;
    case "description":
      return values.description;
    case "date":
      return values.date?.display ?? null;
    case "clue":
      return values.date?.deduced ? (values.date.clue ?? null) : null;
    case "place":
      return values.place ? (names.places.get(values.place) ?? values.place) : null;
    case "participants":
      return (
        values.participants
          .map((p) => `${names.people.get(p.person) ?? p.person} (${ROLE_LABELS[p.role]})`)
          .sort()
          .join(", ") || null
      );
  }
}

export interface EventChange {
  field: EventField;
  before: string | null;
  after: string | null;
}

/** The fields whose shown value differs, in form order. */
export function diffEvent(
  before: EventValues,
  after: EventValues,
  names: EventNames,
): EventChange[] {
  const changes: EventChange[] = [];
  for (const field of Object.keys(EVENT_FIELD_LABELS) as EventField[]) {
    const [was, now] = [showField(field, before, names), showField(field, after, names)];
    if (was !== now) changes.push({ field, before: was, after: now });
  }
  return changes;
}

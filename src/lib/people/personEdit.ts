/**
 * Turns what someone typed into the person form into checked values, and
 * works out what actually changed for the history page. Pure: no database.
 */
import { parseFuzzyDate, type FuzzyDate } from "@/lib/fuzzyDate";

export const GENDERS = ["female", "male", "other"] as const;
export type GenderInput = (typeof GENDERS)[number];
/** "yes" living, "no" died, "" not known. */
export type LivingInput = "yes" | "no" | "";

/** The person form, exactly as submitted: every field is text. */
export interface PersonFormInput {
  displayName: string;
  givenName: string;
  familyName: string;
  birthFamilyName: string;
  /** Comma-separated. */
  nicknames: string;
  /** Comma-separated. */
  alternateNames: string;
  gender: string;
  living: string;
  /** Free text read by parseFuzzyDate: "1967-12-14", "1989", "c. 1964". */
  born: string;
  died: string;
  notes: string;
}

export interface PersonValues {
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  birthFamilyName: string | null;
  nicknames: string[];
  alternateNames: string[];
  gender: GenderInput | null;
  isLiving: boolean | null;
  born: FuzzyDate | null;
  died: FuzzyDate | null;
  notes: string | null;
}

export type PersonField = keyof PersonValues;

export const FIELD_LABELS: Record<PersonField, string> = {
  displayName: "Name",
  givenName: "Given name",
  familyName: "Family name",
  birthFamilyName: "Family name at birth",
  nicknames: "Nicknames",
  alternateNames: "Also known as",
  gender: "Gender",
  isLiving: "Living",
  born: "Born",
  died: "Died",
  notes: "Notes",
};

export type PersonErrors = Partial<Record<keyof PersonFormInput, string>>;

/** Trimmed, de-duplicated, non-empty values from a comma-separated field. */
export function parseList(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

const text = (raw: string) => raw.trim() || null;

function readDate(raw: string, field: "born" | "died", errors: PersonErrors): FuzzyDate | null {
  const date = parseFuzzyDate(raw);
  if (date && date.year === undefined) {
    errors[field] = 'Include a year, such as "1967-12-14", "1989" or "around 1964".';
    return null;
  }
  return date;
}

export function parsePersonForm(
  input: PersonFormInput,
): { ok: true; values: PersonValues } | { ok: false; errors: PersonErrors } {
  const errors: PersonErrors = {};
  const displayName = input.displayName.trim();
  if (!displayName) errors.displayName = "A name is needed.";
  if (displayName.length > 120) errors.displayName = "That name is too long.";

  const gender = input.gender.trim();
  if (gender && !(GENDERS as readonly string[]).includes(gender))
    errors.gender = "Pick one of the choices.";

  const born = readDate(input.born, "born", errors);
  const died = readDate(input.died, "died", errors);
  if (born?.year !== undefined && died?.year !== undefined && died.year < born.year) {
    errors.died = "This is before the birth date.";
  }
  if (died && input.living === "yes") errors.living = "Someone with a death date cannot be living.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      displayName,
      givenName: text(input.givenName),
      familyName: text(input.familyName),
      birthFamilyName: text(input.birthFamilyName),
      nicknames: parseList(input.nicknames),
      alternateNames: parseList(input.alternateNames),
      gender: (gender as GenderInput) || null,
      // A death date settles it.
      isLiving: died ? false : input.living === "yes" ? true : input.living === "no" ? false : null,
      born,
      died,
      notes: text(input.notes),
    },
  };
}

/** How a value reads in the history: lists joined, dates as displayed, blanks as null. */
export function showValue(field: PersonField, values: PersonValues): string | null {
  const value = values[field];
  if (value === null || value === "") return null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return value.display;
  if (field === "gender") return value[0].toUpperCase() + value.slice(1);
  return value;
}

export interface FieldChange {
  field: PersonField;
  before: string | null;
  after: string | null;
}

/** The fields whose shown value differs, in form order. */
export function diffPerson(before: PersonValues, after: PersonValues): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of Object.keys(FIELD_LABELS) as PersonField[]) {
    const [was, now] = [showValue(field, before), showValue(field, after)];
    if (was !== now) changes.push({ field, before: was, after: now });
  }
  return changes;
}

/** Fills the form from stored values. */
export function toFormInput(values: PersonValues): PersonFormInput {
  const date = (value: FuzzyDate | null) => {
    if (!value) return "";
    if (value.precision === "day") {
      return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
    }
    if (value.precision === "month") return `${value.year}-${String(value.month).padStart(2, "0")}`;
    if (value.precision === "year") return String(value.year);
    return value.display;
  };
  return {
    displayName: values.displayName,
    givenName: values.givenName ?? "",
    familyName: values.familyName ?? "",
    birthFamilyName: values.birthFamilyName ?? "",
    nicknames: values.nicknames.join(", "),
    alternateNames: values.alternateNames.join(", "),
    gender: values.gender ?? "",
    living: values.isLiving === null ? "" : values.isLiving ? "yes" : "no",
    born: date(values.born),
    died: date(values.died),
    notes: values.notes ?? "",
  };
}

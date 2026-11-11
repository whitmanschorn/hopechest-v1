/**
 * Dates in family history are often partly known. A FuzzyDate says how much is
 * known and how to show it; the `date*` column group on events, photos and
 * documents stores it. Pure functions only, safe to import in the browser.
 */
export type Precision = "day" | "month" | "year" | "circa";

export interface FuzzyDate {
  year?: number;
  /** 1–12 */
  month?: number;
  /** 1–31 */
  day?: number;
  precision: Precision;
  /** Human caption, e.g. "June 10, 1950" or "Summer 1933". */
  display: string;
  /** True when the date was inferred rather than read off a record. */
  deduced?: boolean;
  /** What the inference rests on. */
  clue?: string;
}

/** The shape of the `date*` columns. All null means "no date known". */
export interface DateColumns {
  dateYear: number | null;
  dateMonth: number | null;
  dateDay: number | null;
  datePrecision: "DAY" | "MONTH" | "YEAR" | "CIRCA" | null;
  dateDisplay: string | null;
  dateDeduced: boolean;
  dateClue: string | null;
  dateSortKey: number | null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Reads one free-text date field.
 *   "1950-06-10"                      -> day    "June 10, 1950"
 *   "1950-06"                         -> month  "June 1950"
 *   "1950"                            -> year   "1950"
 *   "circa 1950", "c. 1950", "~1950"  -> circa  "circa 1950"
 *   anything else -> circa, shown as typed, with a year pulled out if present
 * Returns null for blank input.
 */
export function parseFuzzyDate(input: string): FuzzyDate | null {
  const raw = input.trim();
  if (!raw) return null;

  const day = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (day) {
    const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
    if (month >= 1 && month <= 12 && dayOfMonth >= 1 && dayOfMonth <= daysInMonth(year, month)) {
      return {
        year,
        month,
        day: dayOfMonth,
        precision: "day",
        display: `${MONTHS[month - 1]} ${dayOfMonth}, ${year}`,
      };
    }
  }

  const month = /^(\d{4})-(\d{1,2})$/.exec(raw);
  if (month) {
    const [year, m] = [Number(month[1]), Number(month[2])];
    if (m >= 1 && m <= 12) {
      return { year, month: m, precision: "month", display: `${MONTHS[m - 1]} ${year}` };
    }
  }

  const yearOnly = /^(\d{4})$/.exec(raw);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), precision: "year", display: yearOnly[1] };
  }

  const circa = /^(?:circa|c\.?|ca\.?|abt\.?|about|around|~)\s*(\d{4})$/i.exec(raw);
  if (circa) {
    return { year: Number(circa[1]), precision: "circa", display: `circa ${circa[1]}` };
  }

  const embeddedYear = /\b(\d{4})\b/.exec(raw);
  return {
    ...(embeddedYear ? { year: Number(embeddedYear[1]) } : {}),
    precision: "circa",
    display: raw,
  };
}

/** yyyymmdd with zeros for unknown parts, so timelines sort in one column. */
export function sortKey(date: Pick<FuzzyDate, "year" | "month" | "day">): number | null {
  if (date.year === undefined) return null;
  return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

export function toColumns(date: FuzzyDate | null): DateColumns {
  if (!date) {
    return {
      dateYear: null,
      dateMonth: null,
      dateDay: null,
      datePrecision: null,
      dateDisplay: null,
      dateDeduced: false,
      dateClue: null,
      dateSortKey: null,
    };
  }
  return {
    dateYear: date.year ?? null,
    dateMonth: date.month ?? null,
    dateDay: date.day ?? null,
    datePrecision: date.precision.toUpperCase() as DateColumns["datePrecision"],
    dateDisplay: date.display,
    dateDeduced: date.deduced ?? false,
    dateClue: date.clue ?? null,
    dateSortKey: sortKey(date),
  };
}

export function fromColumns(row: Omit<DateColumns, "dateSortKey">): FuzzyDate | null {
  if (!row.datePrecision || row.dateDisplay === null) return null;
  return {
    ...(row.dateYear !== null ? { year: row.dateYear } : {}),
    ...(row.dateMonth !== null ? { month: row.dateMonth } : {}),
    ...(row.dateDay !== null ? { day: row.dateDay } : {}),
    precision: row.datePrecision.toLowerCase() as Precision,
    display: row.dateDisplay,
    ...(row.dateDeduced ? { deduced: true } : {}),
    ...(row.dateClue ? { clue: row.dateClue } : {}),
  };
}

/**
 * How to say the date in a sentence without overstating it: exact dates as
 * written, fuzzy or deduced ones hedged ("around 1964").
 */
export function describe(date: FuzzyDate): string {
  if (date.precision === "circa") {
    return date.year !== undefined && date.display === `circa ${date.year}`
      ? `around ${date.year}`
      : date.display;
  }
  return date.deduced ? `probably ${date.display}` : date.display;
}

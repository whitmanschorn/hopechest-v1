import { parseFuzzyDate } from "@/lib/fuzzyDate";
import {
  BLANK_EVENT,
  dateToText,
  diffEvent,
  parseEventForm,
  readParticipants,
  toEventFormInput,
  type EventFormInput,
  type EventValues,
} from "../eventEdit";
import { groupByDecade, inDateOrder } from "../timeline";

const form = (over: Partial<EventFormInput>): EventFormInput => ({
  ...BLANK_EVENT,
  title: "Something happened",
  ...over,
});
const subject = (person: string) => ({ person, role: "subject" });

function errorsOf(input: EventFormInput) {
  const parsed = parseEventForm(input);
  return parsed.ok ? {} : parsed.errors;
}
function valuesOf(input: EventFormInput): EventValues {
  const parsed = parseEventForm(input);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.values;
}

describe("readParticipants", () => {
  it("splits role from slug and drops malformed entries", () => {
    expect(
      readParticipants(["subject:george-sr", "witness:lucille", "nobody", ":x", "x:"]),
    ).toEqual([
      { role: "subject", person: "george-sr" },
      { role: "witness", person: "lucille" },
    ]);
  });
});

describe("parseEventForm", () => {
  it("needs a title and a known kind", () => {
    expect(errorsOf(form({ title: "  ", kind: "party" }))).toEqual({
      title: "Say what happened.",
      kind: "Pick one of the choices.",
    });
  });

  it("trims text and treats blanks as not recorded", () => {
    expect(valuesOf(form({ title: "  Moved house ", kind: "move", description: " " }))).toEqual({
      kind: "move",
      title: "Moved house",
      description: null,
      date: null,
      place: null,
      participants: [],
    });
  });

  it("needs a year in a date", () => {
    expect(errorsOf(form({ date: "spring" })).date).toMatch(/Include a year/);
    expect(valuesOf(form({ date: "around 1964" })).date).toMatchObject({
      year: 1964,
      precision: "circa",
    });
  });

  it("a deduced date needs a date and a clue", () => {
    expect(errorsOf(form({ deduced: "yes" }))).toEqual({
      date: "A deduced date needs a date.",
      clue: "Say what the deduction rests on.",
    });
    expect(errorsOf(form({ date: "1965", deduced: "yes", clue: " " }))).toEqual({
      clue: "Say what the deduction rests on.",
    });
    expect(valuesOf(form({ date: "1965", deduced: "yes", clue: " Before Michael " })).date).toEqual(
      { year: 1965, precision: "year", display: "1965", deduced: true, clue: "Before Michael" },
    );
  });

  it("drops a clue when the date is not marked as deduced", () => {
    expect(valuesOf(form({ date: "1965", clue: "ignored" })).date).toEqual({
      year: 1965,
      precision: "year",
      display: "1965",
    });
  });

  it("a birth or death has exactly one subject", () => {
    for (const kind of ["birth", "death"]) {
      expect(errorsOf(form({ kind })).participants).toMatch(/exactly one person/);
      expect(
        errorsOf(form({ kind, participants: [subject("a"), subject("b")] })).participants,
      ).toMatch(/exactly one person/);
      expect(
        errorsOf(form({ kind, participants: [subject("a"), { person: "b", role: "parent" }] })),
      ).toEqual({});
    }
  });

  it("a marriage or divorce has exactly two subjects", () => {
    for (const kind of ["marriage", "divorce"]) {
      expect(errorsOf(form({ kind, participants: [subject("a")] })).participants).toMatch(
        /exactly two people/,
      );
      expect(
        errorsOf(form({ kind, participants: [subject("a"), subject("b"), subject("c")] }))
          .participants,
      ).toMatch(/exactly two people/);
      expect(
        errorsOf(
          form({
            kind,
            participants: [subject("a"), subject("b"), { person: "c", role: "officiant" }],
          }),
        ),
      ).toEqual({});
    }
  });

  it("other kinds take any number of people", () => {
    expect(errorsOf(form({ kind: "move" }))).toEqual({});
    expect(
      errorsOf(form({ kind: "move", participants: [subject("a"), subject("b"), subject("c")] })),
    ).toEqual({});
  });

  it("refuses an unknown part and the same person twice", () => {
    expect(errorsOf(form({ participants: [{ person: "a", role: "boss" }] })).participants).toBe(
      "Pick a part for each person.",
    );
    expect(
      errorsOf(form({ participants: [subject("a"), { person: "a", role: "witness" }] }))
        .participants,
    ).toBe("Each person can be listed once.");
  });
});

describe("the form round trip", () => {
  it("gives back what was stored", () => {
    const input = form({
      kind: "marriage",
      date: "c. 1965",
      deduced: "yes",
      clue: "After G.O.B.",
      place: "model-home",
      participants: [subject("george-sr"), subject("lucille")],
    });
    const again = toEventFormInput(valuesOf(input));
    expect(again).toEqual({ ...input, date: "circa 1965" });
    expect(valuesOf(again)).toEqual(valuesOf(input));
  });

  it("keeps a date's own wording", () => {
    expect(dateToText(parseFuzzyDate("1967-12-14"))).toBe("1967-12-14");
    expect(dateToText(parseFuzzyDate("1967-12"))).toBe("1967-12");
    expect(dateToText({ year: 2006, precision: "year", display: "Spring 2006" })).toBe(
      "Spring 2006",
    );
    expect(dateToText(null)).toBe("");
  });
});

describe("diffEvent", () => {
  const names = {
    people: new Map([
      ["george-sr", "George Bluth Sr."],
      ["lucille", "Lucille Bluth"],
    ]),
    places: new Map([["model-home", "The model home"]]),
  };
  const before = valuesOf(
    form({ kind: "marriage", participants: [subject("george-sr"), subject("lucille")] }),
  );

  it("is empty when nothing changed, whatever order people are listed in", () => {
    const after = { ...before, participants: [...before.participants].reverse() };
    expect(diffEvent(before, after, names)).toEqual([]);
  });

  it("names people and places rather than slugs", () => {
    const after = valuesOf(
      form({
        kind: "marriage",
        date: "1965",
        deduced: "yes",
        clue: "A guess",
        place: "model-home",
        participants: [
          subject("george-sr"),
          subject("lucille"),
          { person: "oscar", role: "witness" },
        ],
      }),
    );
    expect(diffEvent(before, after, names)).toEqual([
      { field: "date", before: null, after: "1965" },
      { field: "clue", before: null, after: "A guess" },
      { field: "place", before: null, after: "The model home" },
      {
        field: "participants",
        before: "George Bluth Sr. (Subject), Lucille Bluth (Subject)",
        after: "George Bluth Sr. (Subject), Lucille Bluth (Subject), oscar (Witness)",
      },
    ]);
  });
});

describe("timeline", () => {
  const event = (title: string, date: string) => ({ title, date: parseFuzzyDate(date) });
  const events = [
    event("Undated", ""),
    event("B in 1972", "1972"),
    event("Late 1967", "1967-12-14"),
    event("Around 1965", "c. 1965"),
    event("A in 1972", "1972"),
    event("Early 1967", "1967-02"),
    event("Worded without a year", "one summer"),
  ];

  it("orders by date, then title, with undated last", () => {
    expect(inDateOrder(events).map((e) => e.title)).toEqual([
      "Around 1965",
      "Early 1967",
      "Late 1967",
      "A in 1972",
      "B in 1972",
      "Undated",
      "Worded without a year",
    ]);
  });

  it("groups by decade", () => {
    expect(groupByDecade(events).map((g) => [g.id, g.label, g.events.length])).toEqual([
      ["1960s", "1960s", 3],
      ["1970s", "1970s", 2],
      ["undated", "Date not recorded", 2],
    ]);
    expect(groupByDecade([])).toEqual([]);
  });
});

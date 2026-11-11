import { describe as say, fromColumns, parseFuzzyDate, sortKey, toColumns } from "../fuzzyDate";

describe("parseFuzzyDate", () => {
  it("reads a full date", () => {
    expect(parseFuzzyDate("1967-12-14")).toEqual({
      year: 1967,
      month: 12,
      day: 14,
      precision: "day",
      display: "December 14, 1967",
    });
  });

  it("reads month and year precision", () => {
    expect(parseFuzzyDate("1950-06")).toMatchObject({ precision: "month", display: "June 1950" });
    expect(parseFuzzyDate("1950")).toMatchObject({ precision: "year", display: "1950" });
  });

  it("reads the common ways of writing an approximate year", () => {
    for (const text of ["circa 1964", "c. 1964", "ca 1964", "~1964", "about 1964", "abt. 1964"]) {
      expect(parseFuzzyDate(text)).toEqual({
        year: 1964,
        precision: "circa",
        display: "circa 1964",
      });
    }
  });

  it("keeps free text as typed and pulls out a year", () => {
    expect(parseFuzzyDate("Summer 1933")).toEqual({
      year: 1933,
      precision: "circa",
      display: "Summer 1933",
    });
    expect(parseFuzzyDate("before the war")).toEqual({
      precision: "circa",
      display: "before the war",
    });
  });

  it("does not accept impossible days as exact dates", () => {
    expect(parseFuzzyDate("1950-02-30")?.precision).toBe("circa");
    expect(parseFuzzyDate("1952-02-29")?.precision).toBe("day");
  });

  it("returns null for blank input", () => {
    expect(parseFuzzyDate("   ")).toBeNull();
  });
});

describe("columns", () => {
  it("round-trips through the date columns", () => {
    const date = { ...parseFuzzyDate("circa 1964")!, deduced: true, clue: "G.O.B. born May 1965" };
    const columns = toColumns(date);
    expect(columns).toMatchObject({ datePrecision: "CIRCA", dateSortKey: 19640000 });
    expect(fromColumns(columns)).toEqual(date);
  });

  it("stores no date as all nulls", () => {
    expect(fromColumns(toColumns(null))).toBeNull();
  });

  it("orders partial dates before fuller ones in the same year", () => {
    const keys = ["1950", "1950-06", "1950-06-10", "1951"].map((t) => sortKey(parseFuzzyDate(t)!));
    expect(keys).toEqual([...keys].sort((a, b) => a! - b!));
    expect(sortKey({})).toBeNull();
  });
});

describe("describe", () => {
  it("hedges fuzzy and deduced dates and states exact ones plainly", () => {
    expect(say(parseFuzzyDate("circa 1964")!)).toBe("around 1964");
    expect(say(parseFuzzyDate("Summer 1933")!)).toBe("Summer 1933");
    expect(say(parseFuzzyDate("1967-12-14")!)).toBe("December 14, 1967");
    expect(say({ ...parseFuzzyDate("1989")!, deduced: true })).toBe("probably 1989");
  });
});

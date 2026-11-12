import { HIT_END, HIT_START, splitExcerpt, tidyText, titleFromFilename } from "../kinds";

describe("splitExcerpt", () => {
  it("separates the matched words from the rest", () => {
    expect(
      splitExcerpt(`married at ${HIT_START}Newport${HIT_END} ${HIT_START}Beach${HIT_END} in 1965`),
    ).toEqual([
      { text: "married at ", hit: false },
      { text: "Newport", hit: true },
      { text: " ", hit: false },
      { text: "Beach", hit: true },
      { text: " in 1965", hit: false },
    ]);
  });

  it("leaves an excerpt with no marks, or a broken mark, as plain text", () => {
    expect(splitExcerpt("nothing here")).toEqual([{ text: "nothing here", hit: false }]);
    expect(splitExcerpt(`half ${HIT_START}open`)).toEqual([
      { text: `half ${HIT_START}open`, hit: false },
    ]);
    expect(splitExcerpt("")).toEqual([]);
  });
});

describe("titleFromFilename", () => {
  it("drops the extension and separators", () => {
    expect(titleFromFilename("klara-letter_1933.pdf")).toBe("klara letter 1933");
    expect(titleFromFilename("Deed of sale")).toBe("Deed of sale");
  });
});

describe("tidyText", () => {
  it("evens out line endings and blank lines", () => {
    expect(tidyText("Dear Lucille,  \r\n\r\n\r\n\r\nAll is well.\r\n")).toBe(
      "Dear Lucille,\n\nAll is well.",
    );
  });
});

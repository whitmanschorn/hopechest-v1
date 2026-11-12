import { matchPerson, parseSidecar, planFolder, withDefaults, type Nameable } from "../sidecar";

describe("parseSidecar", () => {
  it("keeps the fields it knows, trimmed, and drops the rest", () => {
    expect(
      parseSidecar({
        caption: "  Cornballer demo ",
        date: 1974,
        people: ["George Sr.", " ", "Lucille", "Lucille"],
        album: "Carousel 12",
        colour: "red",
      }),
    ).toEqual({
      caption: "Cornballer demo",
      date: "1974",
      people: ["George Sr.", "Lucille"],
      album: "Carousel 12",
    });
  });

  it("takes people as comma-separated text too", () => {
    expect(parseSidecar({ people: "Gob; Michael, Buster" }).people).toEqual([
      "Gob",
      "Michael",
      "Buster",
    ]);
  });

  it("makes nothing of something that is not an object", () => {
    expect(parseSidecar(null)).toEqual({});
    expect(parseSidecar(["caption"])).toEqual({});
    expect(parseSidecar("caption")).toEqual({});
  });
});

describe("withDefaults", () => {
  it("lets a file's own details win over the run's", () => {
    expect(withDefaults({ date: "1975" }, { date: "1974", album: "Carousel 12" })).toEqual({
      date: "1975",
      album: "Carousel 12",
    });
  });
});

describe("matchPerson", () => {
  const people: Nameable[] = [
    {
      id: "1",
      slug: "george-sr",
      displayName: "George Bluth Sr.",
      givenName: "George",
      familyName: "Bluth",
      nicknames: ["Pop-Pop"],
    },
    {
      id: "2",
      slug: "george-michael",
      displayName: "George Michael Bluth",
      givenName: "George Michael",
      familyName: "Bluth",
    },
    { id: "3", slug: "lucille", displayName: "Lucille Bluth", alternateNames: ["Lucille Austero"] },
    { id: "4", slug: "lucille-2", displayName: "Lucille Austero", nicknames: ["Lucille 2"] },
  ];

  it("finds someone by slug, full name, nickname or another name", () => {
    expect(matchPerson("george-sr", people)).toMatchObject({ person: { id: "1" } });
    expect(matchPerson("george bluth sr", people)).toMatchObject({ person: { id: "1" } });
    expect(matchPerson("POP-POP", people)).toMatchObject({ person: { id: "1" } });
    expect(matchPerson("Lucille 2", people)).toMatchObject({ person: { id: "4" } });
  });

  it("will not guess between two people", () => {
    expect(matchPerson("Lucille Austero", people)).toEqual({ found: false, reason: "several" });
  });

  it("will not match part of a name", () => {
    expect(matchPerson("George", people)).toEqual({ found: false, reason: "nobody" });
    expect(matchPerson("  ", people)).toEqual({ found: false, reason: "nobody" });
  });
});

describe("planFolder", () => {
  it("takes PDFs and text files as documents", () => {
    expect(planFolder(["letters/klara-1933.pdf", "letters/klara-1933.json", "story.md"])).toEqual({
      files: [
        {
          path: "letters/klara-1933.pdf",
          contentType: "application/pdf",
          kind: "document",
          sidecar: "letters/klara-1933.json",
        },
        { path: "story.md", contentType: "text/markdown", kind: "document", sidecar: null },
      ],
      skipped: [],
    });
  });

  it("pairs pictures with their sidecars and reports what it cannot take", () => {
    expect(
      planFolder([
        "box-1/slide-002.JPG",
        "box-1/slide-001.jpg",
        "box-1/slide-001.json",
        "box-1/slide-002.JPG.json",
        "box-1/notes.docx",
        "box-1/.DS_Store",
        ".hidden/slide.jpg",
        "movie.mov",
        "stray.json",
      ]),
    ).toEqual({
      files: [
        {
          path: "box-1/slide-001.jpg",
          contentType: "image/jpeg",
          kind: "photo",
          sidecar: "box-1/slide-001.json",
        },
        {
          path: "box-1/slide-002.JPG",
          contentType: "image/jpeg",
          kind: "photo",
          sidecar: "box-1/slide-002.JPG.json",
        },
      ],
      skipped: ["box-1/notes.docx", "movie.mov", "stray.json"],
    });
  });
});

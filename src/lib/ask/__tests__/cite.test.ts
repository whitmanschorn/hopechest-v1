import { answerPieces, readAnswer, renumber } from "../cite";
import { fakeChat } from "../fake";
import { ASK_TOOLS, stepLabel, systemPrompt } from "../prompt";
import type { ChatMessage } from "../chat";

const EVENT = "01a1cc70-6542-7558-92aa-e3fc633e5504";
const results = [
  JSON.stringify({ events: [{ id: EVENT, participants: [{ slug: "lucille" }] }] }),
  JSON.stringify({ person: { slug: "george-sr" } }, null, 1),
];

describe("readAnswer", () => {
  it("numbers the marks for things a lookup returned", () => {
    const read = readAnswer(
      `They married in 1965. [event:${EVENT}] Lucille [person:lucille] was a waitress [event:${EVENT}].`,
      results,
    );
    expect(read.text).toBe("They married in 1965. [1] Lucille [2] was a waitress [1].");
    expect(read.refs).toEqual([
      { type: "event", id: EVENT },
      { type: "person", id: "lucille" },
    ]);
  });

  it("drops marks for things no lookup returned", () => {
    const read = readAnswer("Born in 1940 [document:made-up], she [person:oscar] said.", results);
    expect(read).toEqual({ text: "Born in 1940, she said.", refs: [] });
  });

  it("finds a slug in a lookup printed with spaces", () => {
    expect(readAnswer("He ran it. [person:george-sr]", results).refs).toHaveLength(1);
  });

  it("says a repeated source once, and leaves other brackets alone", () => {
    const read = readAnswer(`Yes [person:lucille] [person:lucille]. See [the note].`, results);
    expect(read.text).toBe("Yes [1]. See [the note].");
  });
});

describe("renumber", () => {
  it("removes numbers whose source is gone and closes the gap", () => {
    expect(renumber("A [1]. B [2]. C [3] and [1].", [true, false, true])).toBe(
      "A [1]. B. C [2] and [1].",
    );
  });
});

describe("answerPieces", () => {
  it("splits words, bold words and marks", () => {
    expect(answerPieces("On **Feb 13** [1], yes.")).toEqual([
      { kind: "text", text: "On " },
      { kind: "bold", text: "Feb 13" },
      { kind: "text", text: " " },
      { kind: "cite", number: 1 },
      { kind: "text", text: ", yes." },
    ]);
  });
});

describe("systemPrompt", () => {
  it("names the asker and tells the model to resolve family words for them", () => {
    const prompt = systemPrompt({
      chest: "Bluth",
      asker: { slug: "maeby", name: "Maeby Fünke" },
      today: "2026-11-12",
      sample: true,
    });
    expect(prompt).toContain("Maeby Fünke (slug: maeby)");
    expect(prompt).toContain('resolve_kin, person "maeby"');
    expect(prompt).toContain("never from what you know of any television show");
  });

  it('has no "me" for a program, and no sample note on a family\'s own chest', () => {
    const prompt = systemPrompt({
      chest: "Schorn",
      asker: null,
      today: "2026-11-12",
      sample: false,
    });
    expect(prompt).toContain("comes from a program");
    expect(prompt).not.toContain("fictional");
  });

  it("describes every lookup in words", () => {
    for (const tool of ASK_TOOLS) expect(stepLabel(tool, {})).not.toBe("Looking something up");
    expect(stepLabel("search_documents", { q: "banana" })).toContain('"banana"');
  });
});

describe("fakeChat", () => {
  const system: ChatMessage = {
    role: "system",
    content: "The person asking is GM (slug: george-michael).",
  };
  const user = (content: string): ChatMessage => ({ role: "user", content });

  it("resolves family words first, then lists the marriage, then answers with marks", () => {
    const asked = [system, user("When did grandma and grandpa get married?")];
    const first = fakeChat(asked);
    expect(first.toolCalls.map((call) => call.name)).toEqual(["resolve_kin"]);
    const kin = {
      kin: [
        { word: "grandma", people: [{ slug: "lucille", displayName: "Lucille Bluth" }] },
        { word: "grandpa", people: [{ slug: "george-sr", displayName: "George Bluth Sr." }] },
      ],
    };
    const afterKin: ChatMessage[] = [
      ...asked,
      { role: "assistant", content: "", toolCalls: first.toolCalls },
      { role: "tool", content: JSON.stringify(kin), toolCallId: first.toolCalls[0].id },
    ];
    const second = fakeChat(afterKin);
    expect(second.toolCalls[0]).toMatchObject({
      name: "list_events",
      arguments: { kind: "marriage", person: "lucille" },
    });
    const events = {
      events: [
        {
          id: EVENT,
          date: { display: "February 13, 1965" },
          participants: [{ slug: "lucille" }, { slug: "george-sr" }],
        },
      ],
    };
    const last = fakeChat([
      ...afterKin,
      { role: "assistant", content: "", toolCalls: second.toolCalls },
      { role: "tool", content: JSON.stringify(events), toolCallId: second.toolCalls[0].id },
    ]);
    expect(last.toolCalls).toEqual([]);
    expect(last.content).toContain("married on February 13, 1965");
    expect(last.content).toContain(`[event:${EVENT}]`);
  });

  it("looks people up by the names in the question, or searches the documents", () => {
    expect(fakeChat([system, user("When was Lucille born?")]).toolCalls[0]).toMatchObject({
      name: "find_people",
      arguments: { q: "Lucille" },
    });
    expect(fakeChat([system, user("What about the cornballer?")]).toolCalls[0]).toMatchObject({
      name: "search_documents",
      arguments: { q: "What about cornballer" },
    });
  });
});

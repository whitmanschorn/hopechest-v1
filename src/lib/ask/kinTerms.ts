/**
 * Turns family words in a question ("grandma and grandpa", "my dad") into the
 * people they mean for whoever is asking. Pure: works on a kinship graph.
 *
 * This is the first step of answering "when did grandma and grandpa get
 * married?": the words only mean something relative to the person asking.
 */
import { relationship, type KinGender, type KinGraph, type KinKind } from "@/lib/kinship";

interface Term {
  kinds: readonly KinKind[];
  /** Null matches any gender. */
  gender: Exclude<KinGender, null | "other"> | null;
  /** 0 for grandmother, 1 for great-grandmother. Undefined matches any depth. */
  greats?: number;
  words: readonly string[];
}

const TERMS: readonly Term[] = [
  {
    kinds: ["grandparent"],
    gender: "female",
    greats: 0,
    words: ["grandmother", "grandma", "granny", "gran", "nana", "grandmom", "grandmum"],
  },
  {
    kinds: ["grandparent"],
    gender: "male",
    greats: 0,
    words: ["grandfather", "grandpa", "granddad", "grandad", "gramps", "pop-pop"],
  },
  { kinds: ["grandparent"], gender: null, greats: 0, words: ["grandparents", "grandparent"] },
  {
    kinds: ["grandparent"],
    gender: "female",
    greats: 1,
    words: ["great-grandmother", "great-grandma", "great grandmother", "great grandma"],
  },
  {
    kinds: ["grandparent"],
    gender: "male",
    greats: 1,
    words: ["great-grandfather", "great-grandpa", "great grandfather", "great grandpa"],
  },
  {
    kinds: ["parent"],
    gender: "female",
    words: ["mother", "mom", "mum", "mama", "mommy", "mummy"],
  },
  { kinds: ["parent"], gender: "male", words: ["father", "dad", "daddy", "papa"] },
  { kinds: ["parent"], gender: null, words: ["parents", "parent", "folks"] },
  { kinds: ["sibling"], gender: "female", words: ["sister", "sisters"] },
  { kinds: ["sibling"], gender: "male", words: ["brother", "brothers"] },
  { kinds: ["sibling"], gender: null, words: ["siblings", "sibling"] },
  { kinds: ["child"], gender: "female", words: ["daughter", "daughters"] },
  { kinds: ["child"], gender: "male", words: ["son", "sons"] },
  { kinds: ["child"], gender: null, words: ["children", "kids", "child"] },
  {
    kinds: ["grandchild"],
    gender: null,
    greats: 0,
    words: ["grandchildren", "grandkids", "grandchild"],
  },
  {
    kinds: ["grandchild"],
    gender: "female",
    greats: 0,
    words: ["granddaughter", "granddaughters"],
  },
  { kinds: ["grandchild"], gender: "male", greats: 0, words: ["grandson", "grandsons"] },
  { kinds: ["partner"], gender: "female", words: ["wife"] },
  { kinds: ["partner"], gender: "male", words: ["husband"] },
  { kinds: ["partner"], gender: null, words: ["spouse", "partner"] },
  {
    kinds: ["aunt-uncle"],
    gender: "female",
    greats: 0,
    words: ["aunt", "aunts", "auntie", "aunty"],
  },
  { kinds: ["aunt-uncle"], gender: "male", greats: 0, words: ["uncle", "uncles"] },
  { kinds: ["niece-nephew"], gender: "female", greats: 0, words: ["niece", "nieces"] },
  { kinds: ["niece-nephew"], gender: "male", greats: 0, words: ["nephew", "nephews"] },
  { kinds: ["cousin"], gender: null, words: ["cousin", "cousins"] },
];

// Longest first, so "great-grandma" is not read as "grandma".
const WORDS = TERMS.flatMap((term) => term.words.map((word) => ({ word, term }))).sort(
  (a, b) => b.word.length - a.word.length,
);

export interface KinMention {
  /** The word as it appears in the text, lower-cased: "grandma". */
  word: string;
  /** Ids of the people it means for the asker. Empty when the record has no one. */
  people: string[];
}

/** Everyone in the graph who is `word` to `askerId`. */
export function resolveKinWord(graph: KinGraph, askerId: string, word: string): string[] {
  const term = WORDS.find((entry) => entry.word === word.toLowerCase().trim())?.term;
  if (!term) return [];
  const found: string[] = [];
  for (const [id, person] of graph.people) {
    const kin = relationship(graph, askerId, id);
    if (!kin || !term.kinds.includes(kin.kind)) continue;
    if (term.gender && person.gender !== term.gender) continue;
    if (term.greats !== undefined && (kin.greats ?? 0) !== term.greats) continue;
    // "My wife" means the wife, not a former one; a cousin is a first cousin unless said otherwise.
    found.push(id);
  }
  return found;
}

/** The family words in a sentence, in order, each resolved for the asker. */
export function findKin(graph: KinGraph, askerId: string, text: string): KinMention[] {
  let rest = ` ${text.toLowerCase().replace(/[^a-z\s-]/g, " ")} `;
  const hits: { at: number; word: string }[] = [];
  for (const { word } of WORDS) {
    const pattern = new RegExp(`(?<=\\s)${word.replace("-", "[- ]")}(?=\\s)`, "g");
    rest = rest.replace(pattern, (match, at: number) => {
      hits.push({ at, word });
      // Blank it out so a shorter word cannot match inside it.
      return " ".repeat(match.length);
    });
  }
  return hits
    .sort((a, b) => a.at - b.at)
    .map(({ word }) => ({ word, people: resolveKinWord(graph, askerId, word) }));
}

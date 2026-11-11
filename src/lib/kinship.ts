/**
 * Works out how two people are related from parent and partner links alone.
 * Pure: hand it people and links, it knows nothing about the database.
 *
 *   const graph = buildGraph(people, links);
 *   relationship(graph, "george-michael", "lucille");  // { kind: "grandparent", label: "grandmother" }
 *   describeKin(graph, "george-michael", "lucille");   // "grandmother"
 *
 * Read every result as "`to` is `from`'s <label>".
 */

export type KinGender = "female" | "male" | "other" | null;

export interface KinPerson {
  id: string;
  gender: KinGender;
}

export type KinLink =
  | { type: "parent"; parentId: string; childId: string }
  | {
      type: "partner";
      aId: string;
      bId: string;
      married: boolean;
      /** False once they divorced or separated. A partner who died is still current. */
      current: boolean;
      /** True when the partnership ended with a death: "late wife". */
      widowed?: boolean;
    };

interface Partner {
  married: boolean;
  current: boolean;
  widowed: boolean;
}

export interface KinGraph {
  people: Map<string, KinPerson>;
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
  partners: Map<string, Map<string, Partner>>;
}

export type KinKind =
  | "partner"
  | "former-partner"
  | "parent"
  | "child"
  | "sibling"
  | "grandparent"
  | "grandchild"
  | "aunt-uncle"
  | "niece-nephew"
  | "cousin"
  | "step-parent"
  | "step-child"
  | "parent-in-law"
  | "child-in-law"
  | "sibling-in-law";

export interface Kinship {
  kind: KinKind;
  /** The everyday word, e.g. "grandmother", "half-brother", "uncle". */
  label: string;
  /** Extra generations: 1 for great-grandmother or great-uncle. */
  greats?: number;
  /** Cousins only: 1 for first cousin. */
  degree?: number;
  /** Cousins only: generations apart. */
  removal?: number;
  /** Siblings who share only one of their known parents. */
  half?: boolean;
  /** Related through a marriage, not by descent. */
  byMarriage?: boolean;
}

function link<V>(map: Map<string, Set<V>>, key: string, value: V): void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
}

export function buildGraph(people: readonly KinPerson[], links: readonly KinLink[]): KinGraph {
  const graph: KinGraph = {
    people: new Map(people.map((person) => [person.id, person])),
    parents: new Map(),
    children: new Map(),
    partners: new Map(),
  };
  const pair = (
    from: string,
    to: string,
    partner: Omit<Partner, "widowed"> & { widowed?: boolean },
  ) => {
    let map = graph.partners.get(from);
    if (!map) graph.partners.set(from, (map = new Map()));
    const known = map.get(to);
    // Two links for one couple (say, partnered then married): the stronger wins.
    map.set(to, {
      married: partner.married || (known?.married ?? false),
      current: partner.current || (known?.current ?? false),
      widowed: (partner.widowed ?? false) || (known?.widowed ?? false),
    });
  };
  for (const item of links) {
    if (item.type === "parent") {
      if (item.parentId === item.childId) continue;
      link(graph.children, item.parentId, item.childId);
      link(graph.parents, item.childId, item.parentId);
    } else if (item.aId !== item.bId) {
      pair(item.aId, item.bId, item);
      pair(item.bId, item.aId, item);
    }
  }
  return graph;
}

function word(gender: KinGender, female: string, male: string, neutral: string): string {
  return gender === "female" ? female : gender === "male" ? male : neutral;
}

const greats = (count: number) => "great-".repeat(Math.max(0, count));

/** Everyone reachable by following `step`, with the fewest steps to each. Loop-safe. */
function distances(start: string, step: Map<string, Set<string>>): Map<string, number> {
  const found = new Map<string, number>();
  const seen = new Set([start]);
  let frontier = [start];
  for (let distance = 1; frontier.length > 0; distance++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of step.get(id) ?? []) {
        if (seen.has(neighbour)) continue;
        seen.add(neighbour);
        found.set(neighbour, distance);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return found;
}

function sharedParents(graph: KinGraph, a: string, b: string): number {
  const mine = graph.parents.get(a);
  const theirs = graph.parents.get(b);
  if (!mine || !theirs) return 0;
  let shared = 0;
  for (const parent of mine) if (theirs.has(parent)) shared++;
  return shared;
}

/** Relationship by descent only. */
function byDescent(graph: KinGraph, fromId: string, toId: string): Kinship | null {
  const to = graph.people.get(toId);
  if (!to || !graph.people.has(fromId) || fromId === toId) return null;
  const { gender } = to;

  const ancestors = distances(fromId, graph.parents);
  const up = ancestors.get(toId);
  if (up === 1) return { kind: "parent", label: word(gender, "mother", "father", "parent") };
  if (up !== undefined) {
    return {
      kind: "grandparent",
      ...(up > 2 ? { greats: up - 2 } : {}),
      label: greats(up - 2) + word(gender, "grandmother", "grandfather", "grandparent"),
    };
  }

  const down = distances(fromId, graph.children).get(toId);
  if (down === 1) return { kind: "child", label: word(gender, "daughter", "son", "child") };
  if (down !== undefined) {
    return {
      kind: "grandchild",
      ...(down > 2 ? { greats: down - 2 } : {}),
      label: greats(down - 2) + word(gender, "granddaughter", "grandson", "grandchild"),
    };
  }

  const shared = sharedParents(graph, fromId, toId);
  if (shared > 0) {
    // "Half" only when both have two known parents and just one is shared;
    // with a parent missing from the record we cannot tell.
    const half =
      shared === 1 &&
      (graph.parents.get(fromId)?.size ?? 0) >= 2 &&
      (graph.parents.get(toId)?.size ?? 0) >= 2;
    const label = word(gender, "sister", "brother", "sibling");
    return half
      ? { kind: "sibling", half: true, label: `half-${label}` }
      : { kind: "sibling", label };
  }

  // Nearest ancestor the two have in common.
  const theirs = distances(toId, graph.parents);
  let best: { mine: number; theirs: number } | null = null;
  for (const [ancestor, mine] of ancestors) {
    const other = theirs.get(ancestor);
    if (other === undefined) continue;
    if (
      !best ||
      mine + other < best.mine + best.theirs ||
      (mine + other === best.mine + best.theirs &&
        Math.max(mine, other) < Math.max(best.mine, best.theirs))
    ) {
      best = { mine, theirs: other };
    }
  }
  if (!best) return null;

  if (best.theirs === 1) {
    const extra = best.mine - 2;
    return {
      kind: "aunt-uncle",
      ...(extra > 0 ? { greats: extra } : {}),
      label: greats(extra) + word(gender, "aunt", "uncle", "aunt or uncle"),
    };
  }
  if (best.mine === 1) {
    const extra = best.theirs - 2;
    return {
      kind: "niece-nephew",
      ...(extra > 0 ? { greats: extra } : {}),
      label: greats(extra) + word(gender, "niece", "nephew", "niece or nephew"),
    };
  }
  const cousin: Kinship = {
    kind: "cousin",
    degree: Math.min(best.mine, best.theirs) - 1,
    removal: Math.abs(best.mine - best.theirs),
    label: "",
  };
  return { ...cousin, label: cousinPhrase(cousin) };
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth"];

/** "first cousin", "second cousin once removed". */
export function cousinPhrase(kin: Pick<Kinship, "degree" | "removal">): string {
  const degree = kin.degree ?? 1;
  const base = `${ORDINALS[degree] ?? `${degree}th`} cousin`;
  if (!kin.removal) return base;
  const times = kin.removal === 1 ? "once" : kin.removal === 2 ? "twice" : `${kin.removal} times`;
  return `${base} ${times} removed`;
}

function currentSpouses(graph: KinGraph, id: string): string[] {
  return [...(graph.partners.get(id) ?? [])]
    .filter(([, partner]) => partner.married && partner.current)
    .map(([partnerId]) => partnerId);
}

/**
 * How `toId` is related to `fromId`, or null when the record does not connect
 * them (or they are the same person). Partners first, then descent, then one
 * step through a current marriage (step-family and in-laws).
 */
export function relationship(graph: KinGraph, fromId: string, toId: string): Kinship | null {
  const to = graph.people.get(toId);
  if (!to || !graph.people.has(fromId) || fromId === toId) return null;
  const { gender } = to;

  const partner = graph.partners.get(fromId)?.get(toId);
  if (partner?.current) {
    const label = partner.married ? word(gender, "wife", "husband", "spouse") : "partner";
    return { kind: "partner", label: partner.widowed ? `late ${label}` : label };
  }

  const descent = byDescent(graph, fromId, toId);
  if (descent) return descent;

  if (partner) {
    return {
      kind: "former-partner",
      label: partner.married
        ? word(gender, "former wife", "former husband", "former spouse")
        : "former partner",
    };
  }

  // `to` is married to one of `from`'s relatives.
  for (const spouse of currentSpouses(graph, toId)) {
    const kin = byDescent(graph, fromId, spouse);
    if (kin?.kind === "parent") {
      return {
        kind: "step-parent",
        byMarriage: true,
        label: word(gender, "stepmother", "stepfather", "step-parent"),
      };
    }
    if (kin?.kind === "child") {
      return {
        kind: "child-in-law",
        byMarriage: true,
        label: word(gender, "daughter-in-law", "son-in-law", "child-in-law"),
      };
    }
    if (kin?.kind === "sibling") {
      return {
        kind: "sibling-in-law",
        byMarriage: true,
        label: word(gender, "sister-in-law", "brother-in-law", "sibling-in-law"),
      };
    }
    if (kin?.kind === "aunt-uncle") {
      return {
        kind: "aunt-uncle",
        byMarriage: true,
        ...(kin.greats ? { greats: kin.greats } : {}),
        label: greats(kin.greats ?? 0) + word(gender, "aunt", "uncle", "aunt or uncle"),
      };
    }
  }

  // `to` is a relative of the person `from` is married to.
  for (const spouse of currentSpouses(graph, fromId)) {
    const kin = byDescent(graph, spouse, toId);
    if (kin?.kind === "parent") {
      return {
        kind: "parent-in-law",
        byMarriage: true,
        label: word(gender, "mother-in-law", "father-in-law", "parent-in-law"),
      };
    }
    if (kin?.kind === "child") {
      return {
        kind: "step-child",
        byMarriage: true,
        label: word(gender, "stepdaughter", "stepson", "stepchild"),
      };
    }
    if (kin?.kind === "sibling") {
      return {
        kind: "sibling-in-law",
        byMarriage: true,
        label: word(gender, "sister-in-law", "brother-in-law", "sibling-in-law"),
      };
    }
  }
  return null;
}

/** The label alone, with "(by marriage)" where it would otherwise mislead. */
export function describeKin(graph: KinGraph, fromId: string, toId: string): string | null {
  const kin = relationship(graph, fromId, toId);
  if (!kin) return null;
  return kin.byMarriage && kin.kind === "aunt-uncle" ? `${kin.label} (by marriage)` : kin.label;
}

/** Brothers and sisters of `id`, including half-siblings. */
export function siblingsOf(graph: KinGraph, id: string): string[] {
  const found = new Set<string>();
  for (const parent of graph.parents.get(id) ?? []) {
    for (const child of graph.children.get(parent) ?? []) {
      // A parent's child who is also this person's parent or child is not a sibling
      // (possible when someone is adopted by a relative).
      if (
        child !== id &&
        !graph.parents.get(id)?.has(child) &&
        !graph.children.get(id)?.has(child)
      ) {
        found.add(child);
      }
    }
  }
  return [...found];
}

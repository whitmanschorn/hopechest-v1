import { distance } from "./model";

/**
 * Sorts faces into groups that are probably one person each: any two faces
 * closer than `within` end up together, as do faces joined by a chain of such
 * pairs. Returns groups of positions in `vectors`, biggest first. Pure.
 */
export function groupFaces(vectors: readonly (readonly number[])[], within: number): number[][] {
  const parent = vectors.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  for (let a = 0; a < vectors.length; a += 1) {
    for (let b = a + 1; b < vectors.length; b += 1) {
      if (find(a) !== find(b) && distance(vectors[a], vectors[b]) < within) {
        parent[find(b)] = find(a);
      }
    }
  }
  const groups = new Map<number, number[]>();
  vectors.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
}

export interface Neighbour {
  personId: string;
  distance: number;
}

/**
 * Whose face this probably is, from the named faces nearest to it: the person
 * with the most near faces, the nearest one settling a tie. Null when nobody
 * is near enough, or everyone near has been ruled out.
 */
export function pickPerson(
  neighbours: readonly Neighbour[],
  within: number,
  ruledOut: ReadonlySet<string> = new Set(),
): { personId: string; distance: number; votes: number } | null {
  const tally = new Map<string, { votes: number; distance: number }>();
  for (const neighbour of neighbours) {
    if (neighbour.distance >= within || ruledOut.has(neighbour.personId)) continue;
    const entry = tally.get(neighbour.personId) ?? { votes: 0, distance: Infinity };
    tally.set(neighbour.personId, {
      votes: entry.votes + 1,
      distance: Math.min(entry.distance, neighbour.distance),
    });
  }
  let best: { personId: string; distance: number; votes: number } | null = null;
  for (const [personId, entry] of tally) {
    if (
      !best ||
      entry.votes > best.votes ||
      (entry.votes === best.votes && entry.distance < best.distance)
    ) {
      best = { personId, ...entry };
    }
  }
  return best;
}

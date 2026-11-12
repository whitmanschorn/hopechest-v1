/**
 * Places a node and its surroundings for drawing: the node in the middle, what
 * it touches on a ring around it, and what those touch on a ring beyond, each
 * near the node that leads to it. Pure and the same every time, so the picture
 * does not jump about between visits.
 */

export interface Placed {
  key: string;
  x: number;
  y: number;
  ring: 0 | 1 | 2;
}

export const CANVAS = { width: 920, height: 660 };

export function layoutGraph(
  center: string,
  keys: readonly string[],
  edges: readonly { from: string; to: string }[],
): Placed[] {
  const cx = CANVAS.width / 2;
  const cy = CANVAS.height / 2;
  const touching = new Map<string, Set<string>>();
  const link = (a: string, b: string) => touching.set(a, (touching.get(a) ?? new Set()).add(b));
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const others = keys.filter((key) => key !== center);
  const inner = others.filter((key) => touching.get(center)?.has(key)).sort();
  const outer = others.filter((key) => !inner.includes(key)).sort();
  const placed: Placed[] = [{ key: center, x: cx, y: cy, ring: 0 }];

  const angleOf = new Map<string, number>();
  // An ellipse: the picture is wider than it is tall.
  const at = (angle: number, radius: number) => ({
    x: Math.round(cx + Math.cos(angle) * radius * 1.3),
    y: Math.round(cy + Math.sin(angle) * radius),
  });
  inner.forEach((key, index) => {
    const angle = (index / Math.max(inner.length, 1)) * Math.PI * 2 - Math.PI / 2;
    angleOf.set(key, angle);
    placed.push({ key, ...at(angle, outer.length > 0 ? 150 : 215), ring: 1 });
  });

  // Each outer node sits beyond the inner node that leads to it.
  const byParent = new Map<string, string[]>();
  for (const key of outer) {
    const parent =
      inner.find((candidate) => touching.get(candidate)?.has(key)) ?? inner[0] ?? center;
    byParent.set(parent, [...(byParent.get(parent) ?? []), key]);
  }
  const slice = (Math.PI * 2) / Math.max(inner.length, 1);
  for (const [parent, children] of byParent) {
    const base = angleOf.get(parent) ?? 0;
    children.forEach((key, index) => {
      const offset = ((index + 1) / (children.length + 1) - 0.5) * Math.min(slice, 1.4);
      placed.push({ key, ...at(base + offset, 285), ring: 2 });
    });
  }
  return placed;
}

/** A name short enough to sit under a dot. */
export function shortName(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

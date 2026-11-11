/** Ordering and grouping for the timeline. Pure: no database. */

interface Dated {
  title: string;
  date: { year?: number; month?: number; day?: number } | null;
}

function key(event: Dated): number {
  const date = event.date;
  if (!date || date.year === undefined) return Infinity;
  return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

/** Oldest first; events without a year last; ties by title. */
export function inDateOrder<T extends Dated>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export interface Decade<T> {
  /** "1960s", or "undated". Safe to use in a test id. */
  id: string;
  /** "1960s", or "Date not recorded". */
  label: string;
  events: T[];
}

/** Events in date order, split by decade, with undated events in a last group. */
export function groupByDecade<T extends Dated>(events: readonly T[]): Decade<T>[] {
  const groups: Decade<T>[] = [];
  for (const event of inDateOrder(events)) {
    const year = event.date?.year;
    const id = year === undefined ? "undated" : `${Math.floor(year / 10) * 10}s`;
    const last = groups[groups.length - 1];
    if (last?.id === id) last.events.push(event);
    else groups.push({ id, label: id === "undated" ? "Date not recorded" : id, events: [event] });
  }
  return groups;
}

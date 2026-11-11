import type { FuzzyDate } from "@/lib/fuzzyDate";

function year(date: FuzzyDate): string | null {
  if (date.year === undefined) return null;
  // A deduced or approximate year is shown as approximate.
  return date.precision === "circa" || date.deduced ? `c. ${date.year}` : String(date.year);
}

/**
 * The years of a life for lists and headings: "1940–2012", "b. 1967",
 * "d. c. 2000". Null when neither year is known.
 */
export function lifespan(birth: FuzzyDate | null, death: FuzzyDate | null): string | null {
  const born = birth ? year(birth) : null;
  const died = death ? year(death) : null;
  if (born && died) return `${born}–${died}`;
  if (born) return `b. ${born}`;
  if (died) return `d. ${died}`;
  return null;
}

/** Up to two letters for an avatar placeholder: "George Bluth Sr." -> "GB". */
export function initials(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter((part) => part && !/^(sr|jr|ii|iii|iv)$/i.test(part));
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

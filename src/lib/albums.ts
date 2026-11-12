/** "No photos yet", "1 photo", "1,204 photos". */
export function photoCountLabel(count: number): string {
  if (count === 0) return "No photos yet";
  return count === 1 ? "1 photo" : `${count.toLocaleString("en-US")} photos`;
}

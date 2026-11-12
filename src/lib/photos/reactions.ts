/** The reactions a photo can get. A short fixed list keeps the row tidy. */
export const REACTIONS = [
  { emoji: "❤️", label: "Love" },
  { emoji: "😂", label: "Funny" },
  { emoji: "😮", label: "Wow" },
  { emoji: "😢", label: "Sad" },
  { emoji: "👍", label: "Like" },
] as const;

export function isReaction(emoji: string): boolean {
  return REACTIONS.some((reaction) => reaction.emoji === emoji);
}

export const MAX_COMMENT_LENGTH = 2000;

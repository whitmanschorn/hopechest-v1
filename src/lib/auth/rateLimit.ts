export interface Limit {
  /** Most attempts allowed inside the window. */
  max: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;

export const LIMITS = {
  /** Code requests for one phone number. */
  codePerPhone: { max: 5, windowMs: HOUR },
  /** Code requests from one network address, across all numbers. */
  codePerIp: { max: 30, windowMs: HOUR },
  /** Wrong guesses at the code for one phone number. */
  verifyPerPhone: { max: 10, windowMs: HOUR },
  /** Wrong guesses at the demo password from one network address. */
  demoPerIp: { max: 10, windowMs: HOUR },
} as const satisfies Record<string, Limit>;

/** True when one more attempt is allowed, given when earlier ones happened. */
export function allows(limit: Limit, earlier: readonly Date[], now: Date = new Date()): boolean {
  const cutoff = now.getTime() - limit.windowMs;
  return earlier.filter((at) => at.getTime() > cutoff).length < limit.max;
}

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** A URL-safe secret for session cookies, invite links and API keys. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Only hashes of tokens and codes are stored, so a database leak reveals none. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, "0");
}

export function hashesMatch(a: string, b: string): boolean {
  const [left, right] = [Buffer.from(a), Buffer.from(b)];
  return left.length === right.length && timingSafeEqual(left, right);
}

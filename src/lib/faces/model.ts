/**
 * What the app knows about the face model: its name, the size of its vectors
 * and how far apart two vectors of the same person usually are. The model
 * itself runs only in the command-line tool; the server does arithmetic on
 * what it produced. Pure, safe in the browser.
 */

/** Vectors from different models are never compared, so the name is stored with each. */
export const FACE_MODEL = "face-api/ssd-mobilenet+resnet-128";
export const DIMENSIONS = 128;

/** Two faces closer than this are grouped as probably the same person. */
export const GROUP_DISTANCE = 0.5;
/** An unnamed face this close to a named one is offered that name. */
export const MATCH_DISTANCE = 0.55;
/** The detector is this sure, or the face is not kept. */
export const MIN_SCORE = 0.7;
/** Smaller than this share of the picture's longer side and a face is too small to tell apart. */
export const MIN_FACE_PERCENT = 3;

/** A vector sent by a program: exactly 128 finite numbers, or null. */
export function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== DIMENSIONS) return null;
  return value.every((n): n is number => typeof n === "number" && Number.isFinite(n))
    ? value
    : null;
}

/** The form pgvector takes and gives: "[0.1,-0.2,...]". */
export const toVectorText = (vector: readonly number[]) => `[${vector.join(",")}]`;
export const fromVectorText = (text: string) => text.slice(1, -1).split(",").map(Number);

export function distance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

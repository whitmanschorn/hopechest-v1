/**
 * Finds the faces in a picture and turns each into a 128-number vector, on
 * this computer. The model (face-api, with TensorFlow's WebAssembly backend)
 * is a development dependency: it is loaded only when faces are scanned, and
 * never by the website.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { MIN_FACE_PERCENT, MIN_SCORE } from "../../src/lib/faces/model.ts";
import type { Box } from "../../src/lib/photos/box.ts";

export interface DetectedFace {
  /** Percentages of the picture, like every other box in the chest. */
  box: Box;
  score: number;
  embedding: number[];
}

export type Detector = (image: Buffer) => Promise<DetectedFace[]>;

/** Long side the detector sees; bigger finds smaller faces but takes longer. */
const EDGE = 1200;

export class DetectorMissingError extends Error {}

export async function loadDetector(): Promise<Detector> {
  const require = createRequire(import.meta.url);
  let tf, faceapi, models: string;
  try {
    tf = await import("@tensorflow/tfjs");
    await import("@tensorflow/tfjs-backend-wasm");
    faceapi = require("@vladmandic/face-api/dist/face-api.node-wasm.js");
    models = join(dirname(require.resolve("@vladmandic/face-api/package.json")), "model");
  } catch {
    throw new DetectorMissingError(
      "The face model is not installed. Run `npm install` in the hopechest folder (it is a development dependency).",
    );
  }
  await tf.setBackend("wasm");
  await tf.ready();
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(models);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(models);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(models);
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_SCORE, maxResults: 40 });

  return async (image) => {
    const { data, info } = await sharp(image)
      .rotate()
      .resize({ width: EDGE, height: EDGE, fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
    try {
      const found: {
        detection: { score: number; box: { x: number; y: number; width: number; height: number } };
        descriptor: Float32Array;
      }[] = await faceapi.detectAllFaces(pixels, options).withFaceLandmarks().withFaceDescriptors();
      const percent = (value: number, of: number) => Math.round((value / of) * 10000) / 100;
      return found
        .map((face) => {
          // The detector's box can hang over the edge; the stored one never does.
          const left = Math.max(0, face.detection.box.x);
          const top = Math.max(0, face.detection.box.y);
          const right = Math.min(info.width, face.detection.box.x + face.detection.box.width);
          const bottom = Math.min(info.height, face.detection.box.y + face.detection.box.height);
          return {
            box: {
              x: percent(left, info.width),
              y: percent(top, info.height),
              w: percent(right - left, info.width),
              h: percent(bottom - top, info.height),
            },
            pixels: Math.max(right - left, bottom - top),
            score: Math.round(face.detection.score * 1000) / 1000,
            embedding: Array.from(face.descriptor, (n) => Math.round(n * 1e6) / 1e6),
          };
        })
        .filter(
          (face) =>
            face.pixels >= (MIN_FACE_PERCENT / 100) * Math.max(info.width, info.height) &&
            face.embedding.every(Number.isFinite),
        )
        .map(({ box, score, embedding }) => ({ box, score, embedding }));
    } finally {
      pixels.dispose();
    }
  };
}

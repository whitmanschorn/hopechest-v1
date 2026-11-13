/**
 * `hopechest scan-faces`: looks over the chest's photos for faces, on this
 * computer, and sends back where each face is and the numbers that describe
 * it. Photos already looked over are skipped, so it can be stopped and run
 * again. Naming the faces happens on the website, under Review.
 */
import { callApi, refusal, UnreachableError } from "./lib/api.ts";
import type { Target } from "./lib/config.ts";
import type { Detector } from "./lib/detect.ts";

export interface ScanReport {
  /** Photos looked over in this run. */
  scanned: number;
  faces: number;
  /** Faces that matched a box someone had drawn, and so were named at once. */
  named: number;
  failed: { photo: string; reason: string }[];
  /** Photos still to look over (more than zero only when the run was limited or some failed). */
  remaining: number;
  review: string;
}

export async function runScan(
  target: Target,
  loadDetector: () => Promise<Detector>,
  options: { limit?: number; photo?: string },
  log: (line: string) => void,
): Promise<ScanReport> {
  const report: ScanReport = {
    scanned: 0,
    faces: 0,
    named: 0,
    failed: [],
    remaining: 0,
    review: `${target.url}/review/faces`,
  };
  const limit = options.limit ?? Infinity;
  let detect: Detector | null = null;
  // A photo that failed stays unscanned; do not ask for it again in this run.
  const failed = new Set<string>();

  for (let round = 0; ; round += 1) {
    const answer = await callApi(target, { method: "GET", path: "faces/unscanned?limit=200" });
    if (!answer.ok) throw new UnreachableError(`Could not list photos. ${refusal(answer)}`);
    const model: string = answer.json.model;
    let photos = (answer.json.photos as { id: string; imageUrl: string }[]).filter(
      (photo) => !failed.has(photo.id),
    );
    report.remaining = answer.json.remaining;
    if (options.photo) {
      // One photo by name: looked over whether or not it has been before.
      if (round > 0) break;
      const one = await callApi(target, { method: "GET", path: `photos/${options.photo}` });
      if (!one.ok) throw new UnreachableError(`Could not find that photo. ${refusal(one)}`);
      photos = [{ id: one.json.photo.id, imageUrl: one.json.photo.displayUrl }];
    }
    const total = report.scanned + report.remaining;
    if (photos.length === 0 || report.scanned >= limit) break;
    if (!detect) {
      log(
        `${options.photo ? "One photo" : `${report.remaining} photos`} to look over on ${target.name}. Loading the face model...`,
      );
      detect = await loadDetector();
    }

    for (const photo of photos) {
      if (report.scanned >= limit) break;
      try {
        const image = await fetch(`${target.url}${photo.imageUrl}`, {
          headers: { Authorization: `Bearer ${target.key}` },
        });
        if (!image.ok) throw new Error(`Could not read the picture (${image.status}).`);
        const faces = await detect(Buffer.from(await image.arrayBuffer()));
        const stored = await callApi(target, {
          method: "POST",
          path: `photos/${photo.id}/faces`,
          body: { model, faces },
        });
        if (!stored.ok) throw new Error(refusal(stored));
        report.scanned += 1;
        report.faces += stored.json.faces;
        report.named += stored.json.linked;
        log(
          `[${report.scanned}/${options.photo ? 1 : Math.min(total, limit)}] ${faces.length === 1 ? "1 face" : `${faces.length} faces`}  ${photo.id}`,
        );
      } catch (error) {
        failed.add(photo.id);
        report.failed.push({ photo: photo.id, reason: (error as Error).message });
      }
    }
  }
  report.remaining = options.photo ? report.remaining : Math.max(report.remaining, failed.size);
  return report;
}

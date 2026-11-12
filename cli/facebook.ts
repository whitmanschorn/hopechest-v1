/**
 * `hopechest facebook-export <export-folder> --out <folder>`: turns an
 * unzipped Facebook export into the shape `hopechest ingest` takes: a folder
 * of pictures, each with a JSON sidecar of what Facebook knew about it.
 * Nothing is sent anywhere; look the folder over, then ingest it.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { UsageError } from "./lib/args.ts";
import { collectPhotos, folderName } from "./lib/facebookExport.ts";

export interface ConvertReport {
  out: string;
  /** Photos the export's JSON mentions. */
  found: number;
  written: number;
  /** Mentioned in the JSON, but the picture file is not in the export. */
  missing: string[];
  /** JSON files that could not be read. */
  unreadable: string[];
  albums: Record<string, number>;
}

export function convertFacebookExport(
  exportArg: string,
  outArg: string | undefined,
  log: (line: string) => void,
): ConvertReport {
  const root = resolve(exportArg);
  let entries;
  try {
    if (!statSync(root).isDirectory()) throw new Error();
    entries = readdirSync(root, { recursive: true, withFileTypes: true });
  } catch {
    throw new UsageError(
      `"${exportArg}" is not a folder. Unzip the export first and give the folder it makes.`,
    );
  }
  if (!outArg) throw new UsageError("Say where to put the result: --out <folder>");
  const out = resolve(outArg);
  if (out === root || out.startsWith(root + sep)) {
    throw new UsageError("--out must be outside the export folder.");
  }
  if (existsSync(out) && readdirSync(out).length > 0) {
    throw new UsageError(`"${outArg}" already has files in it. Choose a new or empty folder.`);
  }

  const report: ConvertReport = {
    out,
    found: 0,
    written: 0,
    missing: [],
    unreadable: [],
    albums: {},
  };
  const parsed: unknown[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const path = join(entry.parentPath, entry.name);
    const inside = relative(root, path).split(sep);
    // Private conversations are not family archive material; leave them be.
    if (inside.includes("messages")) continue;
    try {
      parsed.push(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      report.unreadable.push(inside.join("/"));
    }
  }

  const photos = collectPhotos(parsed);
  report.found = photos.length;
  if (photos.length === 0) {
    throw new UsageError(
      "No photos found. When asking Facebook for the export, choose the format JSON (not HTML).",
    );
  }
  const taken = new Set<string>();
  for (const photo of photos) {
    const source = join(root, ...photo.uri.split("/"));
    if (!existsSync(source)) {
      report.missing.push(photo.uri);
      continue;
    }
    const folder = folderName(photo.sidecar.album);
    let name = basename(photo.uri);
    for (let n = 2; taken.has(`${folder}/${name.toLowerCase()}`); n++) {
      name = `${n}-${basename(photo.uri)}`;
    }
    taken.add(`${folder}/${name.toLowerCase()}`);
    mkdirSync(join(out, folder), { recursive: true });
    copyFileSync(source, join(out, folder, name));
    writeFileSync(join(out, folder, `${name}.json`), JSON.stringify(photo.sidecar, null, 2) + "\n");
    report.written++;
    report.albums[folder] = (report.albums[folder] ?? 0) + 1;
  }
  log(`${report.written} photos written to ${out}.`);
  log(`Look them over, then: hopechest ingest "${outArg}" --source facebook_export`);
  return report;
}

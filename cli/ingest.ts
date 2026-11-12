/**
 * `hopechest ingest <folder>`: brings a folder of pictures into a chest as one
 * batch. Each file is hashed first, so nothing already in the chest is sent
 * again and an interrupted run can simply be started again. New photos wait in
 * the review queue; nothing is shown to the family until someone publishes.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { upload } from "@vercel/blob/client";
import {
  parseSidecar,
  planFolder,
  withDefaults,
  type FolderFile,
  type Sidecar,
} from "../src/lib/ingest/sidecar.ts";
import { documentFileKey, MAX_UPLOAD_BYTES, originalKey } from "../src/lib/photos/keys.ts";
import { callApi, refusal, UnreachableError } from "./lib/api.ts";
import { UsageError } from "./lib/args.ts";
import type { Target } from "./lib/config.ts";

export interface IngestOptions {
  label?: string;
  source?: string;
  dryRun: boolean;
  /** Details for every file that does not bring its own. */
  defaults: Sidecar;
}

export interface IngestReport {
  batch: { id: string; label: string; resumed: boolean } | null;
  found: number;
  added: number;
  duplicates: number;
  failed: { file: string; reason: string }[];
  /** Details that came with a file but could not be applied. */
  problems: { file: string; problems: string[] }[];
  /** Files in the folder that are not pictures or documents the chest takes. */
  skipped: string[];
  review: string | null;
}

const PARALLEL = 3;

function listFolder(folder: string): string[] {
  let entries;
  try {
    if (!statSync(folder).isDirectory()) throw new Error();
    entries = readdirSync(folder, { recursive: true, withFileTypes: true });
  } catch {
    throw new UsageError(`"${folder}" is not a folder.`);
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

/** A file's own details, under its name; unreadable ones are reported, not fatal. */
function readSidecar(folder: string, file: FolderFile): { sidecar: Sidecar; problem?: string } {
  if (!file.sidecar) return { sidecar: {} };
  try {
    return { sidecar: parseSidecar(JSON.parse(readFileSync(join(folder, file.sidecar), "utf8"))) };
  } catch {
    return { sidecar: {}, problem: `${file.sidecar} is not valid JSON, so it was ignored.` };
  }
}

async function sendOriginal(
  target: Target,
  mode: "blob" | "local",
  bytes: Buffer,
  contentType: string,
  kind: "photo" | "document",
): Promise<string> {
  const id = randomUUID();
  const key = kind === "document" ? documentFileKey(id, contentType) : originalKey(id, contentType);
  if (!key) throw new Error("That kind of file is not accepted.");
  const headers = { Authorization: `Bearer ${target.key}` };
  if (mode === "blob") {
    // Hosted sites: straight to the file store, with a short-lived permission from the site.
    await upload(key, bytes, {
      access: "private",
      handleUploadUrl: `${target.url}/api/uploads`,
      contentType,
      headers,
      multipart: bytes.byteLength > 8 * 1024 * 1024,
    });
    return key;
  }
  const purpose = kind === "document" ? "&for=document" : "";
  const response = await fetch(`${target.url}/api/uploads?id=${id}${purpose}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    const message = ((await response.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(message ?? `Upload failed (${response.status}).`);
  }
  return key;
}

export async function runIngest(
  /** Where to send; looked up only once the folder is known to be worth sending. */
  findTarget: (() => Target) | null,
  folderArg: string,
  options: IngestOptions,
  log: (line: string) => void,
): Promise<IngestReport> {
  const folder = resolve(folderArg);
  const { files, skipped } = planFolder(listFolder(folder));
  const report: IngestReport = {
    batch: null,
    found: files.length,
    added: 0,
    duplicates: 0,
    failed: [],
    problems: [],
    skipped,
    review: null,
  };
  if (files.length === 0) throw new UsageError(`No pictures or documents found in "${folder}".`);
  const label = options.label?.trim() || basename(folder);
  if (options.dryRun || !findTarget) {
    log(`${files.length} files would be sent as "${label}". Nothing was sent.`);
    return report;
  }
  const target = findTarget();

  const opened = await callApi(target, {
    method: "POST",
    path: "ingest/batches",
    body: { label, source: options.source ?? "folder" },
  });
  if (!opened.ok) throw new UnreachableError(`Could not start the batch. ${refusal(opened)}`);
  const batchId: string = opened.json.batch.id;
  const mode: "blob" | "local" = opened.json.upload;
  report.batch = { id: batchId, label, resumed: opened.json.resumed === true };
  report.review = `${target.url}/review/${batchId}`;
  log(
    `${report.batch.resumed ? "Carrying on with" : "Started"} batch "${label}" on ${target.name}.`,
  );

  let done = 0;
  // Files that did not get through (as opposed to ones the chest could not read).
  let unsent = 0;
  const one = async (file: FolderFile) => {
    const fail = (reason: string) => report.failed.push({ file: file.path, reason });
    try {
      const bytes = readFileSync(join(folder, file.path));
      if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail("Larger than 50 MB.");
      const own = readSidecar(folder, file);
      // A picture is a photo unless its sidecar says it is a page of a document.
      const kind =
        file.kind === "document" || own.sidecar.type === "document" ? "document" : "photo";
      // The run's date, album and people describe its photos. A letter found in
      // the same box was not written that year, so documents take only their own.
      const sidecar = kind === "photo" ? withDefaults(own.sidecar, options.defaults) : own.sidecar;
      const body = {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        filename: file.path,
        kind,
        sidecar,
      };
      const path = `ingest/batches/${batchId}/items`;
      let answer = await callApi(target, { method: "POST", path, body });
      if (answer.ok && answer.json.state === "upload") {
        const key = await sendOriginal(target, mode, bytes, file.contentType, kind);
        answer = await callApi(target, { method: "POST", path, body: { ...body, key } });
      }
      if (!answer.ok) {
        unsent++;
        return fail(refusal(answer));
      }
      const state: string = answer.json.state;
      const problems: string[] = [...(own.problem ? [own.problem] : []), ...answer.json.problems];
      if (state === "failed") return fail(problems.join(" ") || "Could not be read.");
      if (state === "duplicate") report.duplicates++;
      else report.added++;
      if (problems.length > 0) report.problems.push({ file: file.path, problems });
      log(
        `[${++done}/${files.length}] ${state === "duplicate" ? "already there" : "added"}  ${file.path}`,
      );
    } catch (error) {
      unsent++;
      fail((error as Error).message);
    }
  };
  const queue = [...files];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) await one(file);
    }),
  );
  report.failed.sort((a, b) => a.file.localeCompare(b.file));
  report.problems.sort((a, b) => a.file.localeCompare(b.file));

  if (unsent === 0) {
    await callApi(target, { method: "POST", path: `ingest/batches/${batchId}/complete` });
    log(`Done. Review and publish at ${report.review}`);
  } else {
    // Left open on purpose: running the same command again picks up what is missing.
    log(`${unsent} could not be sent. Run the same command again to retry them.`);
  }
  return report;
}

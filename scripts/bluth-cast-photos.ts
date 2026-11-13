/**
 * Downloads freely licensed photos of the Arrested Development cast from
 * Wikimedia Commons into a folder that `hopechest ingest` can send, so face
 * recognition can be tried on staging with faces that really recur.
 *
 *   node scripts/bluth-cast-photos.ts <folder> [--per 8]
 *
 * Each picture gets a sidecar naming the character, the photographer, the
 * licence and the Commons page it came from. The pictures are never committed:
 * choose a folder outside the repository.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Who plays whom. George Sr. and Oscar are one actor, as twins should be. */
const CAST: { actor: string; character: string }[] = [
  { actor: "Jason Bateman", character: "Michael Bluth" },
  { actor: "Jessica Walter", character: "Lucille Bluth" },
  { actor: "Jeffrey Tambor", character: "George Bluth Sr." },
  { actor: "Will Arnett", character: "G.O.B. Bluth" },
  { actor: "Portia de Rossi", character: "Lindsay Bluth Fünke" },
  { actor: "Tony Hale", character: "Buster Bluth" },
  { actor: "David Cross", character: "Tobias Fünke" },
  { actor: "Michael Cera", character: "George Michael Bluth" },
  { actor: "Alia Shawkat", character: "Maeby Fünke" },
  { actor: "Liza Minnelli", character: "Lucille Austero" },
];

const API = "https://commons.wikimedia.org/w/api.php";
const HEADERS = { "User-Agent": "hopechest-seed-script/1.0 (test data for a staging site)" };
/** Things filed under an actor that are not pictures of them. */
const NOT_A_PORTRAIT = /signature|autograph|walk of fame|star on|handprint|logo|poster|\bmap\b/i;

interface CommonsFile {
  title: string;
  url: string;
  page: string;
  artist: string;
  license: string;
  year: string | null;
}

const plain = (html: string | undefined) =>
  (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Commons limits how fast files may be fetched, and says how long to stay away
 * when the limit is passed (often ten minutes). Go slowly and do as it asks.
 */
async function download(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    await wait(3000);
    const response = await fetch(url, { headers: HEADERS });
    if (response.status !== 429 || attempt === 3) return response;
    const asked = Number(response.headers.get("retry-after"));
    const seconds = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 900) : 60;
    console.log(`  Commons asked for a pause of ${Math.ceil(seconds / 60)} min...`);
    await wait(seconds * 1000);
  }
}

interface CommonsPage {
  title: string;
  imageinfo?: Record<string, unknown>[];
}

/**
 * Pictures on Commons with the actor's name in the title. A search, not the
 * actor's category, because most pictures sit in sub-categories by year.
 */
async function filesFor(actor: string, wanted: number): Promise<CommonsFile[]> {
  const pages = new Map<string, CommonsPage>();
  let more: Record<string, string> = {};
  // Details arrive a few pages at a time; three rounds is plenty to choose from.
  for (let round = 0; round < 3; round += 1) {
    const query = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `intitle:"${actor}" filetype:bitmap`,
      gsrnamespace: "6",
      gsrlimit: "50",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "1280",
      ...more,
    });
    const response = await fetch(`${API}?${query}`, { headers: HEADERS });
    if (!response.ok) throw new Error(`Commons answered ${response.status} for ${actor}`);
    const data = (await response.json()) as {
      continue?: Record<string, string>;
      query?: { pages?: Record<string, CommonsPage> };
    };
    for (const [id, page] of Object.entries(data.query?.pages ?? {})) {
      if (page.imageinfo || !pages.has(id)) pages.set(id, page);
    }
    if (!data.continue) break;
    more = data.continue;
    await wait(300);
  }
  const found: CommonsFile[] = [];
  for (const page of pages.values()) {
    const info = page.imageinfo?.[0] as
      | {
          mime: string;
          width: number;
          height: number;
          thumburl?: string;
          url: string;
          descriptionurl: string;
          extmetadata?: Record<string, { value: string }>;
        }
      | undefined;
    if (!info || info.mime !== "image/jpeg") continue;
    if (Math.min(info.width, info.height) < 500 || NOT_A_PORTRAIT.test(page.title)) continue;
    const meta = info.extmetadata ?? {};
    const license = plain(meta.LicenseShortName?.value);
    // Only what may be reused: Creative Commons or public domain.
    if (!/^(cc|public domain|pd)/i.test(license)) continue;
    found.push({
      title: page.title.replace(/^File:/, ""),
      url: info.thumburl ?? info.url,
      page: info.descriptionurl,
      artist: plain(meta.Artist?.value).slice(0, 120),
      license,
      year: /^(19|20)\d\d/.exec(plain(meta.DateTimeOriginal?.value))?.[0] ?? null,
    });
  }
  // The same order every run, so a second run fetches the same pictures.
  return found.sort((a, b) => a.title.localeCompare(b.title)).slice(0, wanted);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const perAt = args.indexOf("--per");
  const per = perAt >= 0 ? Number(args[perAt + 1]) : 8;
  const folder = args.find((arg, at) => !arg.startsWith("--") && at !== perAt + 1);
  if (!folder || !Number.isInteger(per) || per < 1) {
    console.error("Usage: node scripts/bluth-cast-photos.ts <folder> [--per 8]");
    return 2;
  }
  const out = resolve(folder);
  if (out.startsWith(resolve(import.meta.dirname, ".."))) {
    console.error("Choose a folder outside the repository: these pictures are never committed.");
    return 2;
  }
  mkdirSync(out, { recursive: true });

  let saved = 0;
  for (const member of CAST) {
    const files = await filesFor(member.actor, per);
    console.log(`${member.actor} (${member.character}): ${files.length}`);
    for (const [index, file] of files.entries()) {
      const name = `${member.actor.toLowerCase().replace(/[^a-z]+/g, "-")}-${String(index + 1).padStart(2, "0")}`;
      if (!existsSync(join(out, `${name}.jpg`))) {
        const response = await download(file.url);
        if (!response.ok) {
          console.error(`  could not fetch ${file.title} (${response.status})`);
          continue;
        }
        writeFileSync(join(out, `${name}.jpg`), Buffer.from(await response.arrayBuffer()));
      }
      const sidecar = {
        caption: `${member.actor}, who plays ${member.character}`,
        ...(file.year ? { date: file.year } : {}),
        ...(file.artist ? { photographer: file.artist } : {}),
        people: [member.character],
        album: "Cast photos",
        sourceUrl: file.page,
        note: `Wikimedia Commons, ${file.license}: ${file.title}`,
      };
      writeFileSync(join(out, `${name}.json`), JSON.stringify(sidecar, null, 2) + "\n");
      saved += 1;
    }
    await wait(400);
  }
  console.log(`\n${saved} pictures in ${out}. Run again to fetch any that were missed.`);
  console.log(`Next: npm run hopechest -- ingest "${out}" --label "Cast photos"`);
  return 0;
}

process.exitCode = await main();

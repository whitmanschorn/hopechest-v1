# Bringing files in by the boxful

Single photos are uploaded on the website. A box of slide scans, or anything else that arrives as
a folder, comes in from a terminal with the `hopechest` command (`docs/cli.md`) and waits in a
review queue until someone publishes it.

## The short version

```
hopechest --env staging ingest ~/Scans/carousel-12 \
  --label "Carousel 12, summer 1974" --date 1974 --album "Carousel 12"
```

Then open **Review** on the website, look the batch over, and publish.

## What the command does

1. Finds every picture (JPEG, PNG, WebP, TIFF, GIF) and every document (PDF, `.txt`, `.md`) in the
   folder and its sub-folders, up to 50 MB each. Other files are listed as skipped and left alone.
   Hidden files are ignored.
2. Starts a batch named by `--label` (the folder's name if not given).
3. For each picture, works out its fingerprint (SHA-256) and asks the chest whether it already
   has that file. If so, nothing is sent. If not, the original is uploaded and the chest makes the
   viewing copy and thumbnail, exactly as it does for a photo uploaded on the website.
4. Applies the details that came with the file (below).
5. Prints a report as JSON: how many were added, which were already there, which failed and why,
   and the address of the batch's review page.

It is safe to run again. A run that was interrupted picks up its unfinished batch and sends only
what is missing. A run over a folder that is already in the chest sends nothing.

`--dry-run` lists what would be sent without contacting the chest. The key needs the level "Read,
change and bulk upload".

## Details that come with a file

Options on the command line apply to every picture in the run:

| Option           | Meaning                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `--date`         | When they were taken: `1974`, `July 1974`, `around 1974`          |
| `--album`        | Title of an album to put them in; made if there is none           |
| `--people`       | Names or slugs of people in every picture, comma-separated        |
| `--photographer` | Who took them                                                     |
| `--source`       | `folder` (default), `scan`, `facebook_export`, `facebook_capture` |

A picture's own details go in a JSON file beside it, named after it (`slide-001.json` or
`slide-001.jpg.json`). They win over the command line:

```json
{
  "caption": "Opening day at the banana stand",
  "date": "1976-07-04",
  "people": ["George Bluth Sr.", "lucille"],
  "photographer": "Oscar Bluth",
  "album": "Banana stand",
  "sourceUrl": "https://example.com/where-it-came-from"
}
```

A sidecar can also carry `"note"`: something for the reviewer to know, shown beside the photo.

This "folder plus sidecar files" shape is the one every other source is converted to. Facebook,
by export or by browser capture, is covered in `docs/facebook.md`.

## Documents in the folder

PDFs and text files come in as documents (`docs/documents.md`): their words are read and become
searchable once published. A document's sidecar takes `title` (the file's name if not given),
`kind` (letter, record, recipe, story, article, other) and `date`.

The options on the command line (`--date`, `--album`, `--people`) describe the run's photos and
are not applied to documents: a letter found in a box of 1974 slides was not written in 1974.

A picture is a photo unless its sidecar says `"type": "document"`, which files it as a page of a
document: the scan is kept as the original and its text waits to be typed out.

People are matched on an exact name: slug, display name, given and family name, nickname or
another recorded name. A name that matches nobody, or more than one person, is not guessed at. It
is shown to the reviewer as a note on the photo, as is a date that could not be read. A date given
with the file replaces the camera's, because a scanner stamps the day of the scan.

## Reviewing

**Review** lists batches with how many photos in each are waiting. On a batch's page:

- Each waiting photo shows its caption, date, the people tagged, and any notes about details that
  could not be applied. "Open to edit" goes to the photo's own page for anything more.
- Waiting documents are listed above the photos, each with a link to read it.
- Pick photos (or all) to give them one date. Pick anything to discard it.
- **Publish** shows what is picked to the family, or everything if nothing is picked.

Until then a waiting photo is visible only to people who can add photos. It is not in Photos,
albums, or anyone's profile.

Assistants can review too: `list_ingest_batches`, `get_ingest_batch`, `update_photo`,
`date_ingest_photos` and `publish_ingest_photos` are MCP tools (`docs/mcp.md`).

## How it is built

- `src/server/ingest/service.ts` holds batches and items. A file is added in two calls so nothing
  is uploaded twice: first its hash (answer: `duplicate` or `upload`), then, after the upload, its
  storage key. The REST routes are under `ingest/batches` in `src/server/api/routes.ts`.
- `src/lib/ingest/sidecar.ts` is pure and shared by the server and the command: reading a sidecar,
  pairing pictures with sidecars, matching names to people.
- `cli/ingest.ts` is the command. Uploads go straight to the file store on hosted sites and
  through `/api/uploads` locally, both with the API key.
- `e2e/ingest.spec.ts` runs the real command on a folder, then reviews and publishes the batch in
  the browser.

Not here yet: HEIC pictures and Word files. Faces are found afterwards, with `hopechest scan-faces` (`docs/faces.md`).

# Documents

Letters, certificates, recipes, stories: anything whose words matter. A document holds its text
and, where there is one, the original file. Its words are searchable, and facts recorded from it
point back to it (the marriage licence behind a wedding date).

## Adding one

**Documents → Add a document** takes any of:

| What you have                  | What happens                                                            |
| ------------------------------ | ----------------------------------------------------------------------- |
| Words to type or paste         | They are the document.                                                  |
| A PDF with real text           | The text is read out of it; the PDF is kept as the original.            |
| A text or Markdown file        | Its contents become the text.                                           |
| A photo or scan of a page      | The picture is kept as the original. Its text is empty until typed out. |
| A scan plus the words typed in | Both are kept; what you typed is the text.                              |

A PDF made of scanned pages has no text inside it, so it behaves like a photo of a page. Nothing
here reads handwriting or print off a picture yet: someone types it out under **Edit**, or an
assistant does through the `update_document` tool, which tells it to transcribe exactly.

The same file, or the same pasted text, added twice gives the document that is already there.

Files can be up to 50 MB. Word files are not read yet: save as PDF or paste the text.

## Searching

The search box looks through every document's title and text and shows the best matches first,
with the matching passage. It works like a web search: `"quoted phrases"`, `OR`, and `-word` to
leave something out. Words are matched by their root, so `marry` finds `married`.

Programs search with `GET /api/v1/documents?q=...`, assistants with the `search_documents` tool.

## Editing and deleting

Anyone who can add things can correct a document's title, kind, date or text. Start a line with
`##` to make a section heading.

A document that recorded facts cite cannot be deleted, because those facts would be left with
nothing to show where they came from.

## How it is built

- `src/server/documents/service.ts`: list and search, add, change, delete.
  `src/server/documents/extract.ts` reads text out of PDFs (with `unpdf`) and text files.
- Search uses Postgres full-text search. A database trigger keeps `documents.search_vector` in
  step with the title and text, so nothing in the app maintains it.
- Each save cuts the text into passages (`document_chunks`) small enough to cite; Ask will use
  them.
- Files are uploaded the way photos are (straight to the file store on hosted sites) under
  `documents/files/`, and served only to signed-in members through `/api/files`.
- `e2e/documents.spec.ts` covers typing a letter in, a PDF, a scanned page, search, and the API.

Not here yet: documents in `hopechest ingest` folders, reading Word files, and reading text off
scanned pages.

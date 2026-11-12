# Bluth seed

Sample data for local work, CI and staging: the fictional Bluth family of the television series
_Arrested Development_. It is the only family data allowed in this repository.

| File                 | Holds                                                                          |
| -------------------- | ------------------------------------------------------------------------------ |
| `people.json`        | 16 people                                                                      |
| `relationships.json` | Parent and partner links, each qualified (biological, adoptive, legal, ...)    |
| `places.json`        | 10 places                                                                      |
| `events.json`        | Births, marriages, deaths, moves and other dated events, with who took part    |
| `documents/`         | 43 wiki articles and one family paper (a marriage licence), the written record |
| `graph.json` | What kind of thing each topic page is, and looser facts (who founded, worked at, owned, lived at), each naming the document it rests on |
| `questions.jsonl`    | Questions with reference answers, for testing Ask                              |
| `CORRECTIONS.md`     | How this differs from the earlier `bluth-files` data, and why                  |

Each wiki article also becomes a wiki page: the page of the person whose `people.json` entry names
it under `"article"`, or a topic page otherwise.

Load it with `npm run db:seed`. The script (`scripts/seed.ts`) checks the files first
(`scripts/lib/seedData.ts`), matches every row on its `slug`, updates in place, and refuses to
run where `HOPECHEST_ENV=production`. The same checks run in `npm test`.

## Rules for editing

- The documents are the record. A fact in the JSON must be supported by a document, or be marked
  as a deduction with the clue it rests on (`"deduced": true, "clue": "..."`).
- An event can name the documents it is recorded in: `"sources": ["<document file name>"]`. A
  date with a source is exact, never a deduction.
- When no record gives a date, leave the date out or record a deduction. Do not invent one.
- Dates are written `"1967-12-14"`, `"1989"`, `"c. 2000"`, or the long form
  `{ "value": "c. 1965", "display": "...", "deduced": true, "clue": "..." }`.
- Note every change of fact in `CORRECTIONS.md`.

## Questions

Each line of `questions.jsonl` has an `id`, a `question`, a reference `answer`, the `people` and
`sources` (document file names) a good answer draws on, and a `kind`:

- `graph`: answered from people, relationships and events
- `document`: answered from the text of a document
- `deduction`: the record is silent; a good answer gives the deduction and says it is one
- `trap`: the question assumes something false; a good answer corrects it

`asker` names the person asking, for questions such as "when were grandma and grandpa married?"
that depend on who is asking.

## Sources and licence

A document can carry a picture of the original paper: `scan: <file name>` in its header names a
file in `files/`. The seed stores it with the chest's private files, and the document's page shows
it above the text. `files/marriage-license-george-lucille.jpg` was rendered from the `.html` file
beside it with `node scripts/render-seed-scan.ts`; re-run that if the wording changes, and keep
the `.md` text in step.

`documents/marriage-license-george-lucille.md` was written for this project and is fictional;
see `CORRECTIONS.md`. Every other file in `documents/` is a wiki article.

The articles in `documents/` come from the
[Arrested Development Wiki](https://arresteddevelopment.fandom.com) and are licensed
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Each file names its source page
and the date it was retrieved. They were shortened: image, video, appearance and quotation
sections, category lines and leftover markup were removed. Anyone passing these files on must
keep the attribution and the same licence.

No episode transcripts and no images from the series are stored here. This project is not
affiliated with the makers of the series or with Fandom.

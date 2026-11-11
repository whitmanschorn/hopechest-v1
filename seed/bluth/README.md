# Bluth seed

Sample data for local work, CI and staging: the fictional Bluth family of the television series
_Arrested Development_. It is the only family data allowed in this repository.

| File                 | Holds                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| `people.json`        | 16 people                                                                   |
| `relationships.json` | Parent and partner links, each qualified (biological, adoptive, legal, ...) |
| `places.json`        | 10 places                                                                   |
| `events.json`        | Births, marriages, deaths, moves and other dated events, with who took part |
| `documents/`         | 43 wiki articles, the written record the facts above are checked against    |
| `questions.jsonl`    | Questions with reference answers, for testing Ask                           |
| `CORRECTIONS.md`     | How this differs from the earlier `bluth-files` data, and why               |

Load it with `npm run db:seed`. The script (`scripts/seed.ts`) checks the files first
(`scripts/lib/seedData.ts`), matches every row on its `slug`, updates in place, and refuses to
run where `HOPECHEST_ENV=production`. The same checks run in `npm test`.

## Rules for editing

- The documents are the record. A fact in the JSON must be supported by a document, or be marked
  as a deduction with the clue it rests on (`"deduced": true, "clue": "..."`).
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

The articles in `documents/` come from the
[Arrested Development Wiki](https://arresteddevelopment.fandom.com) and are licensed
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Each file names its source page
and the date it was retrieved. They were shortened: image, video, appearance and quotation
sections, category lines and leftover markup were removed. Anyone passing these files on must
keep the attribution and the same licence.

No episode transcripts and no images from the series are stored here. This project is not
affiliated with the makers of the series or with Fandom.

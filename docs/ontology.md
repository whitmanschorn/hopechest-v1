# The family graph

How a chest holds what it knows: what kinds of thing exist, what can be said about them, and
where each fact came from.

## What came before

Three models were tried on the way here.

| Where                 | Shape                                                                                       | Where it ran out                                                            |
| --------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `bluth-files`         | Flat JSON: people, two relationship types, life events, locations                           | Anything subtle went into free-text notes ("adoptive; born Nellie Sitwell") |
| The 2026 demo         | Fixed columns per person, life events owned by one person, a stored "relation" string       | A marriage belonged to one spouse; kinship was text someone typed           |
| v1 before this change | Typed people, qualified relationships, multi-person events, places, sources, proposed facts | Only those kinds of thing, and only parent and partner links, existed       |

The last of these is sound for what it covers. What it could not say: where someone worked, who
their godparents were, what the family owned, that a company or a boat or a dog existed at all.

## The design

**Everything is a node.** Every person, place, event and wiki topic page has a row in `entities`.
Database triggers create and rename them, so no code path can forget. A node is addressed by a
key: `person:lucille`, `place:model-home`, `event:<slug>`, `page:bluth-company`.

**A topic page has a kind.** Organization, group, thing, animal, or plain topic. That is how a
company, a household, an heirloom and a pet come to exist: as wiki pages (`docs/wiki.md`), so each
has prose, history and links from the start.

**A fact is a statement.** Subject, predicate, and either another node or a value (words, a date,
a number):

```
George Sr.  ·  founded        ·  Bluth Company
Michael     ·  worked at      ·  Bluth Company      as president
Gob         ·  occupation     ·  "Magician"
Cornballer  ·  began          ·  around 1975
```

Each statement can carry when it held (from, until), a note, the source it rests on and the words
in that source, and a rank.

**Rank keeps conflicting accounts.** Two documents giving two occupations, or two years, are both
kept. One can be marked as the one the family goes by; another as known to be wrong but kept for
the record. Nothing has to be thrown away to settle a disagreement.

**Predicates come from a vocabulary.** Each says how it reads in both directions ("worked at" /
"employed"), what kinds of node it can be said about and can point at, and whether it usually
spans time. About thirty are built in (`src/lib/graph/vocabulary.ts`), covering family and
friends, a life, work and school and service, places, and things. An admin adds the family's own
under Settings → Vocabulary ("taught piano to" / "learned piano from").

**Kinship stays strict.** Parentage, partnerships, birth, death and taking part in an event keep
their own tables and forms. Working out who "grandma" is, and answering "when were they married?",
depends on those being validated (two parents of a kind, a marriage has two people, dates that
make sense), which a free-form statement cannot promise. They are _read into_ the graph as "core"
facts, so the graph is one connected thing, but they are changed on the person or event itself.

So the model is a strict core with an open graph around it, joined by one vocabulary.

## Using it

- **On any page**, "More about them" (or "Facts" on a topic page) lists what is recorded, grouped,
  with dates, notes and sources, and **Add a fact**. Choosing the kind of fact shapes the form: a
  link asks for someone or something by name, and offers to make a page for it if there is none.
- **The menu on a fact** sets which account the family goes by, marks one as known to be wrong, or
  removes it.
- **Graph** draws a node and what surrounds it, one or two steps out. Selecting a node makes it the
  centre. "How is this connected?" finds the shortest chain of facts between two nodes: a cousin
  and a house, a person and a company.
- **Proposed facts** (`docs/facts.md`) can be loose facts too: the action `add_fact`. Accepted,
  the fact carries the proposal's source and quote.

## For programs and assistants

| Route                                | Tool                         | Does                                          |
| ------------------------------------ | ---------------------------- | --------------------------------------------- |
| `GET /api/v1/nodes?q=&kind=`         | `find_nodes`                 | Find nodes by name                            |
| `GET /api/v1/nodes/<key>`            | `get_node`                   | A node with every fact, from both directions  |
| `PATCH /api/v1/nodes/<key>`          | `set_page_kind`              | Say what kind of thing a topic page is        |
| `POST /api/v1/facts`                 | `add_fact`                   | State a fact                                  |
| `PATCH`, `DELETE /api/v1/facts/<id>` | `update_fact`, `remove_fact` | Change dates, note or rank; remove            |
| `GET /api/v1/predicates`             | `list_fact_kinds`            | The vocabulary                                |
| `GET /api/v1/graph?center=&depth=`   | `explore_graph`              | What is around a node                         |
| `GET /api/v1/path?from=&to=`         | `find_connection`            | The shortest chain of facts between two nodes |

`get_node` is the uniform read: kinship, events and loose facts in one list, each marked `core`
or not.

## How it is built

- `entities`, `statements`, `predicates` (custom ones only) in `prisma/schema.prisma`. The
  migration backfills a node for everything that existed and installs the triggers. Two checks
  live in SQL: a statement points at a node or carries a value, never both; and never at itself.
- `src/lib/graph/vocabulary.ts`: kinds, the built-in predicates, and `checkFact`, which decides
  whether a fact fits. Pure and unit-tested.
- `src/server/graph/service.ts`: nodes, facts (stored and core), the vocabulary, the
  neighbourhood of a node, and paths. The neighbourhood and path load the whole graph into memory,
  which suits a family (thousands of facts) and would not suit a town.
- `src/components/graph/`: the facts panel and its form; `src/app/(app)/graph/` the explorer,
  drawn as plain SVG with a fixed layout (`src/lib/graph/layout.ts`), so it looks the same each
  visit.
- The Bluth seed adds kinds and fifteen facts from `seed/bluth/graph.json`, each naming the wiki
  document it rests on.
- `e2e/graph.spec.ts` covers reading, stating facts by hand, the family's own predicates, and the
  API including a proposed fact.

## What this does not do yet

- Reading a wiki page for facts (`docs/facts.md`) still suggests only dates, names and events, not
  loose facts.
- Core facts cannot hold several ranked accounts; a second account of a birth date has nowhere to
  go but the wiki.
- Facts have no edit history of their own. Who stated one is stored; changes to it are not.
- A custom predicate cannot be renamed or removed once added.
- Photos and documents are not nodes, so "this photo shows the boat" is not a fact yet.

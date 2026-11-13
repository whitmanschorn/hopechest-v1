# The REST API

Programs read and change a chest through `/api/v1`. It is the same set of operations the website
uses, with the same permission checks and validation, because both call the service layer in
`src/server/`.

## Keys

An admin makes a key on the **Settings** page. It is shown once. Send it on every request:

```
curl -H "Authorization: Bearer hc_..." https://hopechest-staging.vercel.app/api/v1
```

A key is one of three levels: read only; read and change; read, change and bulk upload. Keys
cannot manage members or other keys. A key belongs to one deployment: staging, Schorn and Malone
each have their own.

Revoking a key on the Settings page stops it at once.

## What is there

`GET /api/v1` lists every route, the fields each takes, and whether the calling key may use it.
That listing is generated from the route table in `src/server/api/routes.ts`, so it is never out
of date. In short:

| Area           | Routes                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| People         | list and search, get, add, change, history, add a relationship, remove a relationship                                                                  |
| Events         | list (by kind, person or place), get with its sources, add, change, delete                                                                             |
| Places         | list, get, add, change, delete                                                                                                                         |
| Photos         | list (optionally one person's), get, change details, delete                                                                                            |
| Albums         | list, get, add, change, delete                                                                                                                         |
| Documents      | list and search by words, get, add from text, change (including setting the text), delete                                                              |
| Wiki           | list pages, read and write a topic page or a person's page, page history (`docs/wiki.md`)                                                              |
| Graph          | find nodes, read a node's facts, state, rank and remove facts, the vocabulary, what is around a node, how two nodes are connected (`docs/ontology.md`) |
| Ingest         | start a batch, add a file to it, finish it; list, date, publish and discard for review                                                                 |
| Proposed facts | propose, list, accept, reject (`docs/facts.md`)                                                                                                        |

Photos are uploaded in bulk through the ingest routes, which the `hopechest ingest` command drives
(`docs/ingest.md`). Documents are added through the API as text (`docs/documents.md`); files are
added on the website.

## Conventions

- Bodies are JSON objects. `PATCH` changes only the fields sent.
- Dates are text, as a person would write them: `1967-12-14`, `1989`, `around 1964`.
- People and places are addressed by slug (`/people/lucille`); events, photos and albums by id.
- Errors are `{ "error": "<code>", "message": "..." }`. A `422` also has `fields`, keyed by field
  name, with what is wrong with each.
- `401`: no key, or an unknown or revoked one. `403`: the key's level does not allow it.

## Example: the marriage question

```
curl -H "Authorization: Bearer $KEY" "$SITE/api/v1/events?kind=marriage&person=lucille"
```

answers with the wedding of George Sr. and Lucille, and `GET /api/v1/events/<id>` adds the
marriage licence under `sources`.

The same operations are available to assistants as MCP tools (`docs/mcp.md`) and from a terminal
as the `hopechest` command (`docs/cli.md`). One route exists
mainly for them: `GET /api/v1/kin` (who "grandma" is for a given person).

## Adding a route

Add an entry to `ROUTES` in `src/server/api/routes.ts` that calls a service function, and cover it
in `e2e/api.spec.ts`. Do not check permissions in the route: the service does.

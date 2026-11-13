# Database

Postgres with `pgvector`. One database per deployment, one family per database.

## Changing the schema

1. Edit `schema.prisma`.
2. `npm run db:migrate -- --name what_changed` writes a migration and applies it locally.
3. Commit the schema and the migration together.

CI applies migrations to the pull request's own database, then fails if the schema and migrations
disagree or a rule below is broken (`npm run db:check` runs the same checks locally).

## Rules

- **Migrations add.** A new migration that drops, renames or retypes something fails CI unless it
  carries a `-- destructive: <reason>` comment. Remove things in a later pull request, after the
  code that reads the old shape is gone, so deployments never run against a schema they don't
  expect.
- **Merged migrations are frozen.** Never edit or delete one; write a new migration.
- **Timestamps only need to be unique.** A migration written in parallel with another pull
  request does not need to be re-dated when the other merges first.
- **Nothing in the build touches data.** `next build` never migrates or seeds.

## Hand-written SQL

Prisma cannot express these, so they live only in migration SQL. Prisma leaves them alone; do not
drop them.

| What                                                      | Where           | Why                                                                         |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| `CREATE EXTENSION vector`                                 | `init`          | Face embeddings                                                             |
| `reactions_one_target_check`                              | `init`          | A reaction targets a photo or a comment, never both                         |
| `relationships_not_self_check`                            | `init`          | No one is their own parent or partner                                       |
| `*_date_range_check` on events, photos, documents         | `init`          | Month 1–12, day 1–31                                                        |
| `documents_search_vector_trigger`                         | `init`          | Keeps `documents.search_vector` in step with title and text                 |
| `articles_search_vector_trigger`                          | `wiki_articles` | Keeps `articles.search_vector` in step with title and body                  |
| `entities_*_trigger` (person, place, event, article)      | `family_graph`  | Gives every person, place, event and wiki topic page a node in `entities`   |
| `statements_one_value_check`, `statements_not_self_check` | `family_graph`  | A fact points at a node or carries a value, never both, and never at itself |
| `faces_embedding_labeled_hnsw_idx`                        | `init`          | Nearest-neighbour search over confirmed faces only                          |

## Local database

`npm run db:up` starts Postgres in Docker on port 54329; `.env.example` points at it.
`npm run db:deploy` applies migrations.

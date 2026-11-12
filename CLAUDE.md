# Hopechest v1

A private family archive: photos, documents, a knowledge graph of people, relationships, dates and
places, and an Ask feature that answers from it. One deployment serves one family.

@AGENTS.md

## Hard rules

- **This repository is public.** Never commit family data, phone numbers, photos or secrets. Real
  data lives only in the databases and file storage. The only sample data allowed is the fictional
  Bluth family under `seed/`.
- **Never push to `main`.** Every change is a pull request; the owner merges. Keep each pull
  request under 10,000 changed lines (`npm run pr-size`); lockfiles, `seed/` and migration SQL do
  not count.
- **UI is Mantine.** No Tailwind. Custom styling goes in CSS modules using Mantine CSS variables.
- **Playwright specs are the source of truth for behavior.** A feature and its spec ship in the
  same pull request. One spec file per feature in `e2e/`, `data-testid` selectors, `@smoke` in the
  title of must-pass tests.

## Commands

| Command                                  | What it does                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                            | Local server on :3000                                                       |
| `npm run verify`                         | Lint, typecheck, unit tests, smoke specs. Run before opening a pull request |
| `npm test`                               | Jest unit tests (`**/__tests__/*.test.ts`), pure logic only                 |
| `npx playwright test e2e/<file>.spec.ts` | One feature's specs                                                         |
| `npx playwright test --last-failed`      | Re-run only what failed                                                     |
| `npm run test:smoke`                     | Specs tagged `@smoke`                                                       |
| `npm run pr-size`                        | Changed-line count against `origin/main`                                    |
| `npm run hopechest -- <command>`         | The command-line tool (`docs/cli.md`)                                       |
| `npm run db:up`                          | Start local Postgres (Docker, port 54329)                                   |
| `npm run db:deploy`                      | Apply migrations                                                            |
| `npm run db:migrate -- --name x`         | Write and apply a migration after editing `prisma/schema.prisma`            |
| `npm run db:check`                       | Schema and migrations agree, and migration rules hold                       |
| `npm run db:seed`                        | Load or refresh the Bluth seed (safe to re-run; refuses production)         |
| `npm run db:reset`                       | Erase the local database, re-apply migrations, load the seed                |
| `npm run db:pull`                        | Replace the local database with a copy of staging's                         |

Node 24. npm, not pnpm or yarn.

## Environments

| Deployment                      | `HOPECHEST_ENV`          | Data       |
| ------------------------------- | ------------------------ | ---------- |
| Local, pull-request previews    | `development`, `preview` | Bluth seed |
| Staging (every merge to `main`) | `staging`                | Bluth seed |
| Schorn, Malone (manual release) | `production`             | Real       |

Configuration is read through `src/lib/chest.ts`. Dev-only shortcuts must check
`isProduction()` and refuse to run there. Variable names are listed in `.env.example`.

## Database

Schema is `prisma/schema.prisma`; rules for changing it are in `prisma/README.md`. Read them
before writing a migration. Get a client with `getDb()` from `src/lib/db.ts`. Family-history
dates use the `date*` column group through `src/lib/fuzzyDate.ts`; never store a date as display
text alone.

The Bluth seed (`seed/bluth/`, described in its `README.md`) is the shared test data for local
work, CI and staging. Specs may rely on it being present and may add rows, but must not edit or
delete seeded rows. Changing a seeded fact means editing the seed file and noting why in
`seed/bluth/CORRECTIONS.md`.

Vercel CLI commands that pull settings (`vercel env pull`, `vercel blob create-store`, `vercel
link`) overwrite `.env.local` with the hosted database's address. Check it afterwards and restore
it from `.env.example`. The app refuses to start in development against a database that is not
local.

`npm run db:reset` erases data, so Prisma refuses it from an agent without the owner's say-so.
Ask first, or use `npm run db:seed`, which repairs seeded rows without erasing anything.

## Auth and permissions

- Sign-in is by texted code only (`src/server/auth/`). Only members, invitees and `ADMIN_PHONES`
  can get a code.
- 555-01xx numbers (and `TEST_PHONE_ALLOWLIST`) are test numbers: outside production their codes
  appear on screen instead of being texted. Specs sign in with them; `(202) 555-0101` is the admin.
  Production always uses Twilio and never shows a code.
- Invites (`src/server/invites/`): an admin enters a name, email and mobile number on `/members`
  and gets a `/join/<token>` link to send by hand. Nothing is texted until the invited person
  opens the link and asks for their code. The token is stored so the link can be copied again;
  it cannot sign anyone in without the code sent to the invited phone.
- The demo door (`/try`): where `DEMO_PASSWORD` is set, anyone with it can sign in as any family
  member, as a viewer or contributor, without a phone. Such a session belongs to one shared
  "demo-visitor" account and carries the person it stands in for (`src/lib/auth/viewAs.ts`).
  Never honoured in production.
- Pages under `src/app/(app)/` need a session. Read it with `requireUser()` / `requireActor()`
  from `src/server/auth/session.ts`, inside a `<Suspense>` boundary (the `(app)` layout provides
  one).
- Every service function takes an `Actor` and starts with `assertCan(actor, permission)`
  (`src/server/actor.ts`). Never check roles in components or actions instead.
- Server components cannot pass `component={Link}` to Mantine; use
  `src/components/LinkButton.tsx` or `src/components/TextLink.tsx`.

## API

- `/api/v1` is the REST API for programs (`docs/api.md`). It is one table of routes in
  `src/server/api/routes.ts`, each a thin wrapper over a service function; `GET /api/v1` lists
  them. A new operation is a new entry there plus coverage in `e2e/api.spec.ts`.
- Callers send an API key (`Authorization: Bearer hc_...`) made by an admin under Settings
  (`src/server/apiKeys/`). A key is an `Actor` of kind `apiKey`, so services treat it like anyone
  else. Never check a key's scopes in a route.
- `/api/mcp` offers the same routes to assistants as MCP tools (`docs/mcp.md`). A tool is an entry
  in `src/server/mcp/tools.ts` naming a route and describing its input; it has no logic of its
  own. `.mcp.json` points Claude Code at staging and at a local server, with keys read from the
  environment.
- `hopechest` (`cli/`, `docs/cli.md`) is the command-line tool. It calls `/api/v1` with a key and
  has one command per MCP tool, taken from the same list. Run it with `npm run hopechest -- help`.

## Ingest

- Bulk arrivals are batches (`src/server/ingest/`, `docs/ingest.md`). `hopechest ingest <folder>`
  sends a folder; its photos get status `NEEDS_REVIEW` and show only on `/review` until published.
- Anything that lists photos for the family must filter on `status: "PUBLISHED"`.
- Every source (scans, Facebook) is first turned into a folder of pictures and documents with
  JSON sidecars (`src/lib/ingest/sidecar.ts`), so there is one way in. `docs/facebook.md` covers
  the export converter and the procedure for capturing in the browser.

## Documents

- Documents (`src/server/documents/`, `docs/documents.md`) hold text plus, optionally, the original
  file. Search is Postgres full-text over `documents.search_vector`, which a database trigger keeps
  in step with the title and text; never write that column.
- Saving text re-cuts the document into `document_chunks` (`src/lib/documents/chunk.ts`), the
  passages Ask will cite.
- A document that recorded facts cite cannot be deleted.

## Wiki

- Prose lives in the wiki (`src/server/wiki/`, `docs/wiki.md`): a page per person, shown on their
  profile, and topic pages under `/wiki`. Every save adds an `article_revisions` row; never
  update an article without one.
- The markup is read by `src/lib/wiki/markup.ts` and drawn by `ArticleBody`, for the page and the
  editor's preview alike. It never produces HTML from what was typed; keep it that way.
- The recorded facts (people, relationships, events) stay the source for kinship and dates. The
  wiki is the story around them.

## Proposed facts

- Anything a model or assistant reads or works out goes through `proposeClaim`
  (`src/server/claims/`, `docs/facts.md`), never straight into the graph. A person accepts or
  rejects it under Review.
- Accepting runs the action's own REST route as the reviewer and records the row it made. That
  link is what gives an event or person its sources (`src/server/sources.ts`).
- A new kind of proposable change is a new entry in `CLAIM_ACTIONS` naming an existing tool.
- The model is reached only through `getLlm()` (`src/server/llm/`). It is DeepSeek with a key and
  a scripted stand-in without one (never in production); specs run against the stand-in.
- What a model says is never trusted as it comes: `readFacts` (`src/lib/facts/prompt.ts`) keeps
  only facts a program can check, and they are proposed, not recorded.

## UI

- Signed-in pages render inside `src/components/AppFrame.tsx`. Add a page's menu entry to
  `src/components/nav.ts` in the same pull request as the page.
- Colours come from the theme (`src/theme.ts`): use Mantine props and variables
  (`c="dimmed"`, `var(--hc-surface)`, `var(--hc-hairline)`), not hex values, so dark mode works.
- Specs sign in with `signIn(page)` from `e2e/support/auth.ts`.
- After a navigation Next keeps the previous page in the document, hidden. In specs that move
  between pages, select with `shown(page, testId)` from `e2e/support/page.ts`, not
  `page.getByTestId()`, or the old page can match too.
- `notFound()` on a signed-in page shows the not-found page but the status is 200, because the
  response has already started streaming. Specs assert on the page, not the status.

## Deploying

See `docs/deploying.md`. Merging to `main` migrates and deploys staging, then smoke-tests it.
Never run `vercel deploy` by hand against a family site.

## Working in parallel

One work item = one git worktree = one branch = one pull request. Branch from the latest `main`.
Sub-agents get their own worktree and must run `npm run verify` before reporting back.

The full build plan (milestones and pull-request order) is in `docs/plan.md`.

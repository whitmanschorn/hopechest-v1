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

Node 24. npm, not pnpm or yarn.

## Environments

| Deployment                      | `HOPECHEST_ENV`          | Data       |
| ------------------------------- | ------------------------ | ---------- |
| Local, pull-request previews    | `development`, `preview` | Bluth seed |
| Staging (every merge to `main`) | `staging`                | Bluth seed |
| Schorn, Malone (manual release) | `production`             | Real       |

Configuration is read through `src/lib/chest.ts`. Dev-only shortcuts must check
`isProduction()` and refuse to run there. Variable names are listed in `.env.example`.

## Working in parallel

One work item = one git worktree = one branch = one pull request. Branch from the latest `main`.
Sub-agents get their own worktree and must run `npm run verify` before reporting back.

The full build plan (milestones and pull-request order) is in `docs/plan.md`.

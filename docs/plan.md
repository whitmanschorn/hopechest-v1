# Hopechest v1 plan

## Context

Hopechest is a private family archive: photos, documents, a knowledge graph of people, relationships, dates and places, and an "Ask" feature that answers questions like "when were grandma and grandpa married?". Two earlier repos exist:

- `whitmanschorn/hopechest-demo-2026`: a Next.js 16 + Prisma 7 + Neon demo. Real: phone-code login (code shown on screen), upload, manual tagging, comments, person edits with history, kinship resolver. Fake: Ask, invites, documents, smart albums, newsletter. No AI, no tenancy, roles never enforced, and its build command wipes and reseeds the database on every deploy.
- `whitmanschorn/bluth-files`: fictional test data (14 people, 18 relationships, 9 places, 20 events, 45 wiki docs, 25 Q&A pairs, an index of 6,301 screencaps). It has no face, LLM, OCR or Facebook work, its hand-written facts conflict with its own wiki text in about a dozen places, and its seed export has bugs.

v1 is a new repo that keeps the demo's good parts, replaces the fake parts with real ones, and is built so agents (Claude in a terminal, DeepSeek in the app) and humans can both feed and query it.

Decisions already made with you: Twilio for both login codes and invite texts; **public** repo (so no family data or secrets ever in git); face detection and bulk ingest run in a **local CLI**; originals are stored on Vercel Blob and you accept paying past the free tier.

## Architecture

**Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, **Mantine** (core, form, dates, notifications, dropzone, modals; CSS modules for custom styles; no Tailwind), Prisma 7 on Neon Postgres with `pgvector`, Vercel Blob, Vercel AI SDK (`ai`) for LLM calls, Playwright + Jest, npm, Node 24. The demo's data, auth and logic modules port directly; its Tailwind components are rebuilt on Mantine, keeping their behavior and the demo's look (fonts and colors become a Mantine theme).

**Environments:** one repo, three Vercel projects, three Neon projects, three Blob stores. Each deployment is single-family (no tenant column), configured by env (`HOPECHEST_ENV`, `CHEST_NAME`, `CHEST_SLUG`).

| Project             | Deploys from                            | Database                             | Data       |
| ------------------- | --------------------------------------- | ------------------------------------ | ---------- |
| `hopechest-staging` | every merge to `main`, plus PR previews | Neon `staging` (+ one branch per PR) | Bluth seed |
| `hopechest-schorn`  | manual "Release" workflow               | Neon `schorn`                        | real       |
| `hopechest-malone`  | manual "Release" workflow               | Neon `malone`                        | real       |

The Release workflow (GitHub `workflow_dispatch`, pick family + commit) runs `prisma migrate deploy` then `vercel deploy --prod`. Seeding is a separate script that refuses to run when `HOPECHEST_ENV=production`. Nothing in the build command touches data.

**One service layer, four front doors.** All reads and writes live in `src/server/services/*` (people, relationships, events, places, photos, faces, documents, claims, ingest, invites, ask). Each function takes an `Actor` (user or API key, with role) and enforces permissions. On top of it:

1. Server actions for the web UI.
2. REST at `/api/v1/*` (plain CRUD, JSON, API-key auth).
3. MCP server at `/api/mcp` (Streamable HTTP) exposing the same operations as tools; a `.mcp.json` in the repo points Claude Code at staging via env vars.
4. `hopechest` CLI (`cli/`) for ingest and admin, calling REST.

API keys are per deployment, stored hashed, scoped (`read`, `write`, `ingest`, `admin`), created in an admin settings page.

**LLM:** provider chosen by env: `LLM_PROVIDER` (`deepseek` | `anthropic` | `fake`), `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, optional `ANTHROPIC_API_KEY`. `fake` is a scripted provider used in PR tests. DeepSeek has no embeddings API, so retrieval starts with Postgres full-text search plus structured graph tools; an `EMBEDDING_*` provider slot and a `vector` column exist but are optional.

## Data model (new Prisma schema, UUID ids, real timestamps)

Ported from the demo with fixes: `people`, `places`, `photos`, `photo_people`, `albums`, `album_photos`, `comments`, `reactions`, `changelog`, `users`, `sessions`, `verification_codes`, `members`. Dropped: `ChestConfig`, `scripted_exchanges`, `photo_captures`, `feed_items` without foreign keys, display-text dates, required two-value gender, the stored `Person.relation` string (kinship is computed per viewer).

Knowledge graph:

- `relationships`: `type` (`parent` | `partner`), `qualifier` (biological, adoptive, step, foster / married, partnered), `startDate`, `endDate`, `endReason` (divorce, death). Fixes the Buster two-fathers case.
- `events` + `event_participants`: kind (birth, death, marriage, divorce, move, immigration, military, education, work, other), fuzzy date, place, participants with roles. A marriage is one event with two participants, so "when were X and Y married" is a direct lookup.
- Fuzzy dates everywhere as split columns (`year`, `month`, `day`, `precision`, `display`, `deduced`, `clue`) with a (month, day) index; reuse the demo's `fuzzyDate.ts`.
- `sources` (a document, photo, conversation message, or import) and `claims` (subject, predicate, value, source, confidence, `status` proposed/accepted/rejected, created by user or agent). Anything an LLM or agent extracts lands as a **proposed claim**; accepting it writes the graph row and keeps the link back to its source. This is the provenance trail behind every answer.

Ingest, faces, documents, conversations:

- `ingest_batches`, `ingest_items` (sha256 for dedupe, source kind, sidecar metadata, status: received → processed → needs_review → published).
- `faces` (photo, box, `embedding vector`, `model`), `face_identities` (confirmed link to a person, permanent), clusters rebuilt on demand; partial HNSW index over labeled faces. Follows the design in the demo's unmerged PR #11 (`docs/recognition.md`) and reuses its pure modules `cluster.ts`, `dsu.ts`, `distance.ts`, `recognize.ts`.
- `documents` (kind, original file, extracted `text`, `tsvector`), `document_chunks` (text, optional embedding).
- `conversations`, `messages` (`modality` text | voice, optional `audioUrl`, tool calls, citations).
- `invites` (person, phone, token hash, status, expiry), `api_keys`.

## Features

**Auth and invites.** Login by SMS code via Twilio Verify. Invites via a Twilio messaging sender. Until the sender number is approved, and always on staging/PR previews, a dev provider shows the code or invite link on screen **only** for numbers in `TEST_PHONE_ALLOWLIST`; production refuses to start without real Twilio config. Session tokens and codes are hashed; requests are rate-limited per phone and IP; roles (Admin / Contributor / Viewer) are enforced in the service layer. Only invited phone numbers can sign in.

**Family members.** Admin adds a person (name, relation to an existing person, optional phone) → optional invite text with a `/join/<token>` link → they verify by code → onboarding: confirm name and birthday, then pick a profile picture by uploading or choosing a photo they're tagged in, with a circular zoom-and-crop like Facebook's. Reuse the demo's `kinship.ts`, `mentions.ts`, `personEdits.ts` and history page.

**Photos.** Rebuild `UploadWizard`, `PhotoTagger`, `PhotoComments`, albums and map on Mantine, reusing their logic (HEIC conversion, camera capture, tag-box rules). Changes: uploads go straight from browser to Blob (client upload tokens, no 10 MB server-action limit); every photo gets an original, a ~2000px copy and a thumbnail; EXIF date and GPS prefill; in-browser face detection proposes boxes on single uploads.

**Bulk ingest (local CLI).** `hopechest ingest <folder> --env staging|schorn|malone`: hashes and dedupes, reads EXIF and optional sidecar JSON (caption, date, people names, source URL), makes derivatives with `sharp`, detects faces and computes embeddings, uploads, and registers a batch. Re-runnable and resumable. Sources that all reduce to "folder + sidecars":

- Slide and print scans: a folder of images.
- Facebook official export: `hopechest ingest facebook-export <zip>` converts its JSON to sidecars.
- Facebook via browser: a documented procedure (`docs/facebook-capture.md`) for Claude-in-Chrome to save images plus sidecars into a drop folder, with you logged in and supervising.
- Documents: PDF, text, Word, or page images; text extracted directly where possible, otherwise transcribed by an agent through the MCP `set_document_text` tool.

**Review queues (web).** One "Needs review" area with three queues: new batch items (fix dates, places, captions in bulk), "Who is this?" (face clusters: name a cluster once, confirm or reject suggestions), and proposed claims (accept, edit, reject).

**Faces.** The same open model runs in the CLI and the browser so embeddings are comparable (default: face-api descriptors, as in PR #11). The first faces PR is a calibration run on real Schorn scans to set the match threshold, since PR #11 found the stock 0.6 unreliable on old photos; the `model` column lets us swap models by re-running the CLI.

**Ask.** A tool-calling loop over the graph: `find_person`, `resolve_kin` ("grandma" relative to the asker, via `kinship.ts`), `get_events`, `get_relationships`, `search_documents`, `search_photos`. Answers cite their sources, say "around 1964" when a date is fuzzy, label deductions as deductions, and say "not recorded" rather than guess. "Add knowledge by conversation": the same chat can propose claims ("Grandma was born in Sturgeon Bay") that go to the claims queue.

**Voice hooks, no voice.** Messages carry a modality; the ask engine takes text in and streams text out regardless of transport; a `SpeechProvider` interface (transcribe, synthesize) ships with a null implementation and a hidden mic-button slot behind `FEATURE_VOICE`.

## Bluth seed (staging only)

`seed/bluth/` holds cleaned copies of the bluth-files family JSON, wiki docs (CC-BY-SA, attributed) and eval questions, with a `CORRECTIONS.md` listing each conflict resolved (wiki text wins unless noted), the extra people and events added (George Sr.–Lucille marriage as a deduced c. 1964 event, events for Tobias, Oscar, Annyong), typed relationships restored from the dropped notes, and the garbled eval questions fixed. Photos: fixed filename tagging, then a capped subset (~300) copied into the staging Blob store by the seed script; no screencaps or transcript dialogue in git. The seed is an idempotent upsert, so re-running it never wipes other staging data.

## Repo, PRs and CI

- New public repo `whitmanschorn/hopechest-v1`. Ruleset on `main`: no direct pushes, PR required, required checks, squash merge. I open PRs and never merge; you merge. (GitHub won't let the account that opened a PR approve it, and I'd be using your account, so "required approvals" is left off; your merge is the approval.)
- `pr-size` check: fails over 10,000 changed lines, excluding lockfiles, generated files and `seed/`; a `size-exception` label overrides it.
- CI per PR: lint, typecheck, Jest, then a Neon branch forked from **staging** → `prisma migrate deploy` → build → Playwright. The branch is deleted when the PR closes. PR tests use `LLM_PROVIDER=fake` and the dev SMS provider.
- Migrations: because every PR tests on its own copy of staging, a migration PR can't break other PRs. Rules enforced by a CI check: migrations are additive (add first, remove in a later PR), timestamps must be unique, merged migrations are never edited, and schema changes ship with their migration. Merge to `main` applies migrations to staging; the Release workflow applies them to each production.
- Local ↔ staging sync: `npm run db:branch` creates or resets your personal Neon branch from staging and writes `.env.local`; `npm run db:seed` re-applies the Bluth seed. Local dev and Playwright run against that branch.
- Playwright is the behavior spec: one spec file per feature, `data-testid` selectors, tagged `@smoke`; run from the CLI (`npx playwright test e2e/invites.spec.ts`, `--grep @smoke`, `--last-failed`). `npm run verify` = lint + typecheck + Jest + the specs touched by the change.
- Ask evals: `npm run eval:ask` runs the cleaned Bluth questions against real DeepSeek on staging and reports pass rate; on demand and nightly, not on PRs.
- `CLAUDE.md` documents commands, the service-layer rule, and the sub-agent workflow: one work item = one git worktree = one PR.

## Work order (each bullet is one PR, all under 10k lines)

**M0 Foundation (sequential)**

1. Scaffold: Next app, lint, typecheck, Jest, Playwright, CI, PR template, size check, ruleset, `CLAUDE.md`.
2. Schema v1 + migrations + Neon branch-per-PR CI + `db:branch`.
3. Auth: Twilio Verify, dev provider, sessions, roles, rate limits.
4. App shell on Mantine `AppShell`, with the demo's fonts and palette as a Mantine theme (light and dark).
5. Bluth seed + staging project live.

**M1 Core (parallel sub-agents after M0)** 6. People, relationships, kinship, person history. 7. Invites, onboarding, profile picture crop. 8. Photos: direct upload, derivatives, tagging, albums, comments. 9. Events, timeline, places, map.

**M2 Agent access:** 10. REST + API keys. 11. MCP server + `.mcp.json`. 12. CLI skeleton.

**M3 Ingest:** 13. Batches + folder ingest + batch review queue. 14. Documents upload, extraction, search. 15. Facebook export converter + browser-capture procedure.

**M4 Faces:** 16. Calibration on real scans. 17. Embeddings, clustering, "Who is this?" queue. 18. In-browser detection on upload.

**M5 Knowledge and Ask:** 19. Claims, sources, review queue. 20. LLM extraction from documents and captions. 21. Ask with tools and citations + eval harness. 22. Add-knowledge-by-chat + voice hooks.

**M6 Production:** 23. `hopechest-schorn` and `hopechest-malone` projects, Release workflow, backup notes.

M2 and M3 can start as soon as PR 8 lands; M4 and M5 run in parallel.

## What I need from you before or during M0

- `vercel login` in this terminal (the CLI is logged out).
- A Neon API key (or approve adding Neon through the Vercel Marketplace).
- Twilio Account SID, auth token, a Verify service, and a sender number submitted for approval.
- A DeepSeek API key.

Secrets go into Vercel and GitHub Actions settings only, never the repo.

## Verification

- Every PR: CI green on a fresh Neon branch of staging; Playwright specs for the feature included in the same PR.
- After M0: sign in on staging with an allow-listed phone; see the Bluth family.
- After M1: Playwright covers add person → invite → join link → code → onboarding → cropped avatar visible on the person page.
- After M2: from Claude Code, the MCP tools list people and create an event on staging; REST CRUD covered by API tests.
- After M3/M4: `hopechest ingest` on a sample folder twice produces no duplicates; naming one face cluster tags the other photos in it.
- After M5: `npm run eval:ask` passes the cleaned Bluth set, including "When were George Sr. and Lucille married?" answered as a labeled deduction with a citation, and trap questions corrected rather than agreed with.
- After M6: Release workflow deploys a chosen commit to each family's project and their data is untouched by a redeploy.

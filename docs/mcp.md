# Using a chest from Claude (MCP)

Each deployment has an MCP server at `/api/mcp`. It gives an assistant such as Claude Code the same
operations as the REST API (`docs/api.md`), as tools with described inputs: find people, work out
who "grandma" is for someone, list and record events, read documents, caption photos, and so on.

## Connecting Claude Code

The repository's `.mcp.json` already names two servers:

| Server              | Address                                        | Key it sends                 |
| ------------------- | ---------------------------------------------- | ---------------------------- |
| `hopechest-staging` | `https://hopechest-staging.vercel.app/api/mcp` | `$HOPECHEST_STAGING_API_KEY` |
| `hopechest-local`   | `http://localhost:3000/api/mcp`                | `$HOPECHEST_LOCAL_API_KEY`   |

1. Sign in to the site as an admin, open **Settings**, and make a key. "Read only" is enough for
   asking questions; "Read and change" lets Claude add and correct things.
2. Put the key in your shell's environment, for example in `~/.zshrc`:
   `export HOPECHEST_STAGING_API_KEY=hc_...`
3. Start `claude` in this repository from a new terminal and approve the server when asked. `/mcp`
   shows whether it connected and lists the tools.

Keys never go in `.mcp.json` or anywhere else in the repository, which is public.

The family sites (Schorn, Malone) are not listed in `.mcp.json`. To use one, add it for yourself
only: `claude mcp add --transport http --scope local hopechest-schorn <address>/api/mcp --header
"Authorization: Bearer hc_..."`.

## What an assistant can do

A key's level decides which tools it is offered at all: a read-only key never sees the tools that
change things. The server also tells the assistant how the chest works: dates are text, a date may
be deduced and should be reported as such, and answers should cite the sources an event carries.

The marriage question goes like this:

1. `resolve_kin` with the asker and "grandma and grandpa" gives the two people.
2. `list_events` with `kind: marriage` and one of them gives their wedding and its date.
3. `get_event` gives the sources behind that date; `get_document` reads the licence itself.

`e2e/mcp.spec.ts` runs exactly these steps through a real MCP client.

## How it is built

- `src/server/mcp/tools.ts` is the list of tools. Each names one route of the REST table
  (`src/server/api/routes.ts`) and describes its input with zod. A tool does what its route does,
  so permissions and validation live in the service layer only.
- `src/server/mcp/server.ts` builds a server per request for the calling key. Nothing is kept
  between requests, which suits serverless hosting.
- Adding a tool: add the route if it is new, then an entry in `tools.ts`, and cover it in
  `e2e/mcp.spec.ts`.

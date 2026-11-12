# The command-line tool

`hopechest` reads and changes a chest from a terminal. It calls the REST API (`docs/api.md`), so it
can do what an API key may do and nothing more. It is also where bulk work lives: `hopechest ingest` brings in a folder of scans
(`docs/ingest.md`), and face detection will be added to it.

## Setting up

1. Sign in to the site as an admin, open **Settings**, and make a key.
2. Put it in your shell's environment, for example in `~/.zshrc`:
   `export HOPECHEST_STAGING_API_KEY=hc_...`
3. In this repository, run `npm link` once. After that `hopechest` works from any folder. Without
   linking, `npm run hopechest -- <command>` does the same from the repository.

The key variables are the ones `.mcp.json` uses, so one key serves both Claude Code and the tool.

## Choosing a deployment

| Name               | Address                                | Key                         |
| ------------------ | -------------------------------------- | --------------------------- |
| `local` (default)  | `http://localhost:3000`                | `HOPECHEST_LOCAL_API_KEY`   |
| `staging`          | `https://hopechest-staging.vercel.app` | `HOPECHEST_STAGING_API_KEY` |
| any other `<name>` | `HOPECHEST_<NAME>_URL`                 | `HOPECHEST_<NAME>_API_KEY`  |

Pick one with `--env staging`, or set `HOPECHEST_TARGET=staging` to change the default. The family
sites are not built in: set `HOPECHEST_SCHORN_URL` and `HOPECHEST_SCHORN_API_KEY` yourself, so a
command can only reach real data when you have deliberately pointed it there.

## Commands

`hopechest help` lists them; `hopechest <command> --help` lists a command's fields. There is one
command per MCP tool (`docs/mcp.md`), spelled with dashes, because both come from the same list in
`src/server/mcp/tools.ts`.

```
hopechest whoami
hopechest find-people q=lucille
hopechest resolve-kin person=george-michael words="grandma and grandpa"
hopechest --env staging list-events kind=marriage person=lucille
hopechest add-person displayName="Ann Veal" nicknames="Egg, Her?" born="around 1990"
hopechest update-person slug=ann-veal notes="Plain."
```

Input is `name=value`. Lists are comma-separated; true/false fields take `true` or `false`; a list
of objects, such as an event's `participants`, is JSON:

```
hopechest add-event kind=marriage title="Wedding" date=1965-02-13 \
  participants='[{"person":"george-sr"},{"person":"lucille"}]'
```

`--body '{...}'` sends a whole JSON object; `name=value` given with it wins.

Any route can also be called directly, including ones with no command yet:

```
hopechest routes
hopechest get people q=lucille
hopechest patch places/balboa-island notes="Home of the banana stand."
```

## Bringing in a folder

`hopechest ingest <folder>` sends a folder of pictures and documents as one batch for review. It
has its own guide: `docs/ingest.md`.

`hopechest facebook-export <folder> --out <folder>` turns an unzipped Facebook export into such a
folder without sending anything: `docs/facebook.md`.

## Output

The answer is printed as JSON on standard output, so it pipes into `jq` or another program.

| Exit code | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| 0         | Done                                                                            |
| 1         | The server refused or failed; its status and answer are on standard error       |
| 2         | The command was wrong (unknown command or field, missing key); nothing was sent |

## How it is built

- `cli/hopechest.ts` is the entry point. It runs as TypeScript directly under Node 24, with no
  build step and no dependencies beyond `zod`.
- `cli/lib/args.ts` reads the command line and builds requests; `cli/lib/config.ts` works out the
  address and key. Both are pure and tested in `cli/__tests__/`.
- `e2e/cli.spec.ts` runs the real tool as a separate process against the server under test.
- A new MCP tool is a new command with no further work. A command that is more than one request
  (ingest) gets its own file under `cli/`.

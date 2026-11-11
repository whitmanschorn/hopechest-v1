# Hopechest

Your family's living archive: photos, documents, and stories, kept safe and rediscoverable.

This is the v1 codebase. One deployment serves one family. The repository is public and contains
no family data; the sample data is the fictional Bluth family.

## Run it

```sh
nvm use 24
npm install
cp .env.example .env.local
npm run dev
```

## Check your work

```sh
npm run verify        # lint, typecheck, unit tests, smoke specs
npm run test:e2e      # every Playwright spec
```

## How changes land

Every change is a pull request against `main`. CI runs lint, typecheck, unit tests, a production
build and the Playwright specs, and fails pull requests over 10,000 changed lines unless they carry
the `size-exception` label. See `CLAUDE.md` for conventions and `docs/plan.md` for the build plan.

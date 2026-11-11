# Deploying

Three sites run from this repository, each its own Vercel project, Neon database and GitHub
environment:

| Site    | Address                              | Deploys                                  | Data  |
| ------- | ------------------------------------ | ---------------------------------------- | ----- |
| staging | https://hopechest-staging.vercel.app | Automatically, on every merge to `main`  | Bluth |
| schorn  | not created yet                      | By hand: Actions → Deploy → Run workflow | Real  |
| malone  | not created yet                      | By hand: Actions → Deploy → Run workflow | Real  |

`.github/workflows/deploy.yml` does the same thing for each: fetch the site's settings from
Vercel, apply migrations, build, deploy, then check `/api/health`. Staging also refreshes the
Bluth seed and runs the `@smoke` specs against the live site. Vercel is not connected to GitHub; nothing deploys except through
this workflow.

## What each site needs

In its GitHub environment (Settings → Environments):

- variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SITE_URL`
- secret `VERCEL_TOKEN`: a Vercel token scoped to that project
- staging only: secret `TEST_LOGIN_CODE`

In its Vercel project (production environment):

- `HOPECHEST_ENV` (`staging` or `production`), `CHEST_NAME`, `CHEST_SLUG`, `ADMIN_PHONES`: stored
  as plain config, not "sensitive". The build runs in GitHub Actions, which cannot read sensitive
  values.
- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`: set by the Neon integration
- Twilio variables (see `.env.example`); required when `HOPECHEST_ENV=production`
- staging only: `TEST_LOGIN_CODE` and `DEMO_PASSWORD` (both sensitive)

## Signing in on staging

Staging's address is public, so it never shows codes on screen. Test numbers such as
(202) 555-0101 (an admin) sign in with the six-digit `TEST_LOGIN_CODE` instead. The same code works for (202) 555-0104 (George Michael, can add and edit) and (202) 555-0105
(Maeby, read-only).

## Letting someone look around staging

Send them https://hopechest-staging.vercel.app/try and the demo password (`DEMO_PASSWORD`, kept
in the staging project on Vercel and in your local `.env.staging.local`). They pick any family
member and whether they can edit, and are signed in as that person for twelve hours or until
they sign out. They need no phone and cannot get admin access. Changes they make show in
histories as "A demo visitor".

The door exists only where `DEMO_PASSWORD` is set to at least 12 characters, and never on a
family site, whatever is set there. To close it, remove the variable and redeploy; to shut out
people who already have the password, change it.

To run specs
against staging:

```sh
PLAYWRIGHT_BASE_URL=https://hopechest-staging.vercel.app TEST_LOGIN_CODE=<code> npm run test:smoke
```

## Keeping local data in step with staging

Local work, CI and staging all hold the same Bluth seed, loaded by `npm run db:seed` from
`seed/bluth/`. Two commands bring a local database back in line:

- `npm run db:reset` erases it, re-applies every migration and loads the seed. Use this by
  default.
- `npm run db:pull` replaces it with a copy of staging's database, for when staging holds
  something the seed does not (photos tagged by hand, a bug that only shows there). It needs
  staging's direct database URL as `STAGING_DATABASE_URL` in `.env.staging.local` (git-ignored);
  copy the value of `DATABASE_URL_UNPOOLED` from the staging project in Vercel. Sessions, codes
  and API keys are not copied.

Both refuse to touch anything but a database on your own machine. Nothing copies data up to
staging: change the seed and merge instead.

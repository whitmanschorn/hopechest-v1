# Deploying

Three sites run from this repository, each its own Vercel project, Neon database and GitHub
environment:

| Site    | Address                              | Deploys                                  | Data  |
| ------- | ------------------------------------ | ---------------------------------------- | ----- |
| staging | https://hopechest-staging.vercel.app | Automatically, on every merge to `main`  | Bluth |
| schorn  | not created yet                      | By hand: Actions → Deploy → Run workflow | Real  |
| malone  | not created yet                      | By hand: Actions → Deploy → Run workflow | Real  |

`.github/workflows/deploy.yml` does the same thing for each: fetch the site's settings from
Vercel, apply migrations, build, deploy, then check `/api/health`. Staging also runs the `@smoke`
specs against the live site. Vercel is not connected to GitHub; nothing deploys except through
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
- staging only: `TEST_LOGIN_CODE` (sensitive)

## Signing in on staging

Staging's address is public, so it never shows codes on screen. Test numbers such as
(202) 555-0101 (an admin) sign in with the six-digit `TEST_LOGIN_CODE` instead. To run specs
against staging:

```sh
PLAYWRIGHT_BASE_URL=https://hopechest-staging.vercel.app TEST_LOGIN_CODE=<code> npm run test:smoke
```

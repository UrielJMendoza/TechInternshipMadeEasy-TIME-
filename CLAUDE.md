# Timley: notes for Claude

Read `README.md` and `docs/operations.md` first. This file records the owner's standing instructions and lessons that are easy to relearn the hard way.

## Owner's standing instructions

- **Auto-merge is authorized.** When a change is verified, open a pull request from the working branch into `claude/internship-tracker-app-05orfv` and merge it (squash) without waiting for the owner. That branch is the production branch; Vercel deploys every push to it. "Verified" means lint, typecheck, `npm test`, green CI, and a READY Vercel preview for the exact commit. After merging, confirm the production deployment is READY and the live site works.
- **Keep improving on a loop.** A routine runs every 4 hours ("Timley: improve every 4 hours"). Each run checks CI, the latest Vercel production deployment, Supabase API logs (watch for HTTP 402) and `/api/health/jobs`, fixes anything broken, then makes the site better: security, SEO, performance, accessibility and reliability.
- **Recent jobs matter most.** The public feed only shows listings from the last 90 days (`RETENTION_DAYS`). Old rows are hidden, not deleted.
- **Supabase is on the Pro plan** (since 2026-09-28). Egress is still metered, so keep reads bounded: bundled snapshot per production build, incremental syncs, and the `MAX_ROWS_PER_SYNC` budget. Never reintroduce a whole-table read per request or per refresh.

## Lessons

- Never add a root `middleware.ts`. With `framework: null`, Vercel builds it as a separate Edge function that cannot resolve app imports, and **every deployment fails** while CI stays green. Page middleware lives in `proxy.ts`. A test enforces this.
- CI passing is not enough: check the Vercel deployment state for the pushed commit.
- `tests/live-jobs.test.mjs` loads `lib/jobs/live.ts` with `stripTypeScriptTypes`. Use only erasable TypeScript there (no parameter properties or enums), and add any new import to the test's import rewrites.
- Supabase 402 means the organization hit a plan quota. The site keeps serving the bundled snapshot, and `/api/health/jobs` reports `lastFailureCode`.

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, then `TIMLEY_USE_DEMO_JOBS=true npm run build:vercel` and `NODE_ENV=test TIMLEY_USE_DEMO_JOBS=true TIMLEY_TEST_ARTIFACT=vercel node --test tests/rendered-html.test.mjs`.

## Pending owner setup

- Vercel deploy hook for the production branch, saved as the GitHub secret `VERCEL_DEPLOY_HOOK_URL`. Until then the bundled feed only refreshes when production is redeployed.

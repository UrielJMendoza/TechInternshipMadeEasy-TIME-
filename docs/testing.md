# Testing and CI

The required checks are intentionally local and reproducible. They do not deploy, call production Supabase, or fetch live job feeds.

## Prerequisites

- Node.js 22
- Docker Desktop or another Docker-compatible daemon
- Dependencies installed with `npm ci`
- Chromium installed with `npx --no-install playwright install --with-deps chromium`

## Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run test:db
npm run types:check
npm run test:e2e
```

`test:db` is expected to reset the local database from zero and run the pgTAP schema, RLS, grant, and RPC permission suites. `types:check` must compare generated local Supabase types with the committed type file.

For browser tests, start local Supabase and reset it with the browser-only fixture before exporting its local URL and keys to the `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_*` variables:

```bash
npx --no-install supabase start
npx --no-install supabase db reset --local --sql-paths ../e2e/fixtures.sql
eval "$(npx --no-install supabase status -o env)"
LOCAL_SUPABASE_URL="${API_URL:-${SUPABASE_URL:-}}"
LOCAL_PUBLIC_KEY="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
LOCAL_SECRET_KEY="${SECRET_KEY:-${SERVICE_ROLE_KEY:-}}"
export NEXT_PUBLIC_SUPABASE_URL="$LOCAL_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$LOCAL_PUBLIC_KEY"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_PUBLIC_KEY"
export SUPABASE_URL="$LOCAL_SUPABASE_URL"
export SUPABASE_SECRET_KEY="$LOCAL_SECRET_KEY"
npm run test:e2e
```

The path passed to `--sql-paths` is relative to the `supabase/` directory. It overrides the configured `supabase/seed.sql` for that reset, so the browser database contains exactly the browser fixture. `playwright.config.ts` refuses to run unless the app and Supabase URLs use loopback hosts, which protects against an accidental production test.

Playwright starts or reuses `next dev` for that local command. CI builds first and starts `next start`; the GitHub workflow performs the same export without printing keys.

## Deterministic browser fixture contract

The `e2e/fixtures.sql` seed used by browser CI must:

- contain at least 3,000 synthetic jobs;
- contain at least 61 active internships so pagination has multiple pages;
- use deterministic immutable `tracking_key` values;
- use safe `https://example.com/...` application URLs;
- populate current `primary_source`, taxonomy, canonical location-facet, compensation, verified-domain, and source-observation fields;
- include representative remote, physical-location, sponsorship, salary,
  explicit single- and multi-term, unlisted-term, and null-date cases;
- contain no production or scraped personal data.

Application stages and the user-facing To apply collection are browser-owned,
not database-owned. The interaction tests create and validate v3 application
state and the underlying v2 saved state in isolated browser contexts instead of
pretending those records belong in SQL.

The 3,000-row test enforces a maximum of 60 initially rendered jobs and an uncompressed initial HTML/RSC budget of 350,000 bytes. Override the byte budget only during deliberate review with `E2E_MAX_INITIAL_DOCUMENT_BYTES`; do not raise it merely to silence a regression.

## Browser coverage

Playwright verifies these CSS viewports:

- 390 x 844
- 844 x 390
- 768 x 1024
- 1024 x 768
- 1440 x 900

The 200% reflow check uses a 720 x 450 CSS viewport, equivalent to the layout viewport exposed by 1440 x 900 at 200% browser zoom. `deviceScaleFactor: 2` is not used because it changes pixel density without exercising responsive reflow.

The suite covers semantic title navigation, isolated Save/Track controls, Apply visibility and touch targets, dense mode, keyboard Track behavior, short-landscape menu geometry and stacking, focus-leave popovers, immutable tracking identity across an intercepted apply-URL change, v2/v3 storage envelopes, verified-domain logo proxy routing, stored-state flash prevention, axe serious/critical violations, bounded initial payloads, screenshots, and pagination.

Pagination tests require `POST /api/jobs` with an opaque JSON cursor. They verify expansion, a single transient failure followed by one successful retry of the same page, and true exhaustion without a follow-on request. The suite no longer permits or skips for the removed client-side pagination path.

Browser routing fulfills external listing documents and image requests with local test responses. It also intercepts the local Next image-optimizer request for `/api/company-logo`, preventing the server-side logo proxy from contacting its live provider during CI. Unit tests cover the proxy's upstream allow-list, PNG validation, size bound, and cache headers.

Successful viewport and axe evidence is attached to the Playwright HTML report. Failures retain screenshots, video, and the first-retry trace under `test-results/`. CI uploads both `test-results/` and `playwright-report/` for review.

## Production safety

CI has read-only repository permissions, disables checkout credential persistence, pins every GitHub-authored action to a full commit SHA, invokes only lockfile-installed CLIs, and uses local Supabase credentials only. It contains no deploy, migration-push, function-deploy, project-link, or production mutation step. Production verification and deployment must remain separate, protected, manually reviewed workflows.

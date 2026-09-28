# Timley

An account-free internship and new-graduate job feed at [timley.dev](https://timley.dev). Visitors apply on employer websites. Saved jobs, application statuses and notes stay in the browser.

## Architecture

- React 19 and Vinext provide the application and server routes.
- Vite/Nitro builds the Vercel artifact with `npm run build:vercel`; `vercel.json` defines the build and response headers.
- Supabase Postgres stores source observations, job facts, evidence receipts, aliases and private reports. Row-level security protects private operations.
- The `ingest` Edge Function refreshes six community lists and three configured employer boards. `enrich-employer-evidence` checks bounded public employer data using a private queue.
- The browser receives public job data only. Ingestion and enrichment use server-side custom authorization; privileged keys never belong in client environment variables. `lib/supabase/public-config.ts` refuses secret and service-role keys even if one is misconfigured.
- Production builds bundle a fresh 90-day snapshot of the feed, and a scheduled deploy hook rebuilds after each import. The site only reads rows changed since then, within a per-sync budget, so Supabase egress stays far inside the free plan. See [operations](docs/operations.md#supabase-egress-and-quota-restrictions) for the one-time deploy hook setup.
- `proxy.ts` issues a per-request CSP nonce for pages (not `middleware.ts`, which Vercel would build as a separate Edge function); `vercel.json` sets HSTS and related response headers. State-changing API routes reject cross-site requests and require a JSON body.
- Pages publish canonical URLs, share cards, a web app manifest and escaped JSON-LD (`lib/seo/structured-data.ts`). `JobPosting` markup is emitted only when the page shows a verified employer description and an unambiguous US location; other listings get breadcrumbs only, so the site never publishes job markup that search-engine policies would reject.

## Development and verification

Use Node 22.16 or a compatible supported Node release, then `npm ci` and `npm run dev`. The public Supabase reader has a publishable-key default; optional overrides are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. This key does not grant private database access. Never substitute a service-role key.

- `npm run typecheck` and `npm run lint`
- `npm test`: build the demo artifact and run domain, live-reader, rendered-page, request-bound and health-monitor checks
- `TIMLEY_USE_DEMO_JOBS=true npm run build:vercel`, then `NODE_ENV=test TIMLEY_USE_DEMO_JOBS=true TIMLEY_TEST_ARTIFACT=vercel node --test tests/rendered-html.test.mjs`
- `deno test --allow-env --allow-read --config supabase/functions/ingest/deno.json --node-modules-dir=none supabase/functions/ingest/ingest.test.ts supabase/functions/ingest/evidence.test.ts supabase/functions/ingest/simplify.test.ts`
- `npm audit --audit-level=high`

CI runs these checks on pushes and pull requests. Production ignores the demo-data flag. Public health must confirm both the live feed and all configured source updates; cached fallback listings are explicitly degraded.

## Operations and release

See [operations and recovery](docs/operations.md) before changing ingestion schedules or applying migrations. Both refresh schedules were approved and applied on September 5, 2026. Match the connected migration history before applying local files; management-API timestamps can differ from source filenames.

The Git-connected Vercel project creates a preview for repair branches. Promote only the exact reviewed release after its checks pass. Keep database changes additive and preserve the preceding deployment and data manifests for recovery.

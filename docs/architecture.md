# Architecture and trust boundaries

This document describes the production contracts represented by the repository.
It is not a record that a particular deployment or test run succeeded; release
evidence belongs in the production review package.

## Request and data flow

### Read path

1. The App Router page is a Server Component.
2. It calls the typed `search_jobs` and `count_jobs` RPCs for the first 30 active
   rows, total counts, and role totals. Separate security-invoker views provide
   location, category, source, and internship-term facets.
3. The page sends only that bounded page and facet metadata to the interactive
   board.
4. Filter or sort changes and Load More requests use `POST /api/jobs` with a
   Zod-validated body of at most 32 KiB.
5. Cursors bind the sort position to a fingerprint of the active filters. They
   contain the sort value, `first_seen_at`, row ID, and number already seen.
6. The route returns 30–60 rows and uses `private, no-store` response caching.

Search text, physical location, role, major, niche, work term, freshness,
explicit remote, visa sponsorship, stable tracking-key collections,
source-listed salary sort, and pagination are evaluated in Postgres. The
default newest order uses the effective opening date, with stable cursor
tie-breakers. `posted_date` falls back to `first_seen_at` for the 120-day
visibility window, so null-date jobs still age out.

### Ingest path

1. The named `pg_cron` job `ingest-listings` runs at `15 */2 * * *`.
2. It reads `ingest_function_url` and `ingest_cron_secret` from Supabase Vault.
   Missing or blank configuration produces no HTTP request.
3. `pg_net` sends a POST to the committed Supabase Edge Function with the opaque
   token in `Authorization: Bearer ...`. It is never put in a URL.
4. The Edge handler validates the 64-character token shape, hashes it, and asks
   a service-role-only RPC to compare fixed-size digests against the Vault value
   before dynamically importing the shared runner. Unauthorized requests
   initialize no adapters and make no upstream request; the plaintext token is
   never forwarded to PostgREST.
5. The same `src/lib/ingest` runner and source registry are imported by the Edge
   Function, the authenticated Next.js recovery route, local scripts, and tests.
6. `begin_ingest_run` records a durable running row, enforces a minimum interval,
   and acquires the ingest lease before upstream work.
7. The six adapters fetch concurrently. Each fetch has a deadline, bounded
   retries with jitter, a byte ceiling, allowed content types, runtime schema
   checks, and expected-marker checks.
8. Normalization validates HTTPS application URLs, structured locations, dates,
   source compensation, and the source observation identity. Fuzzy similarity
   creates review candidates; it is not a primary key.
9. `apply_ingest_snapshot` validates the entire JSON contract again inside the
   transaction and takes a transaction-scoped advisory lock.
10. Healthy source observations are upserted. Partial, invalid, zero-row, or
    anomalous sources are quarantined and cannot deactivate prior observations.
    A healthy observation needs two consecutive misses before becoming inactive.
11. `apply_ingest_snapshot` or `fail_ingest_run` finalizes the durable audit row,
    including code/parser versions, source and aggregate checksums, counts,
    duration, quarantine state, and error information.

The Next.js `/api/ingest` endpoint is not a scheduler. It is a POST-only,
Bearer-authenticated recovery surface and calls the same runner. There is no
Vercel cron configuration.

## Canonical data model

### `public.jobs`

One canonical listing row. Important properties include:

- immutable UUID `tracking_key` for all browser-owned state;
- canonical title, company, role type, category, raw season, normalized explicit
  work-term keys, requisition context, and latest valid posting date;
- primary application URL and source, without making the URL an identity;
- structured US location fields and normalization confidence;
- normalized search, location, major, and niche fields used by server queries;
- parsed source compensation and an isolated `source_salary_sort_max` value;
- high-confidence company domain only;
- first seen, last seen, last checked, and active state.

The canonical row is active while at least one valid source observation remains
active. Its immutable tracking key is protected by a database trigger.

### `public.job_sources`

One observation per `(source, external_id)`. It preserves the source URL,
application URL, raw title and location, raw season, normalized explicit work
terms, requisition ID, structured location, source-listed compensation,
first/last seen times, parser/checksum metadata, active state, and healthy miss
count. Multiple contributing sources remain visible instead of being discarded
during deduplication. Canonical terms are the union of active source
observations; ingestion does not infer a term from a posting date, bare year, or
bare season.

### Ingestion and review tables

- `public.ingest_runs` stores one aggregate run record.
- `public.ingest_source_runs` stores one source result per run.
- `public.job_match_candidates` stores fuzzy matches for review.
- `public.job_changes` stores bounded listing-change history.
- `public.job_reports` stores report workflow data without public write access.
- `app_meta.ingest_settings` stores non-secret safety thresholds.
- `app_meta.ingest_lease` stores the durable run lease.
- `app_meta.job_url_aliases` maps SHA-256 URL hashes to canonical jobs for
  bounded browser-state migration without exposing the table itself.

### Legacy compatibility

`public.internships` is preserved during the cutover. The hardening migration
backfills valid legacy rows into `jobs`, `job_sources`, and the private URL alias
map without changing a previously created tracking key on rerun. Legacy reads
remain RLS-filtered for rollback compatibility; new ingestion writes only the
canonical model.

The sanitized migration-history marker represents the migration version already
present in production without replaying the retired insecure implementation.
The later idempotent hardening migration is the clean-clone baseline and forward
production upgrade.

## Database security

The exposed schema follows an explicit allowlist:

- `anon` and `authenticated` may select current active jobs, their active source
  observations, visible change history, and the four facet views.
- Public reads are filtered by RLS and the 120-day effective date.
- Public roles may execute only the read-only search, count, and digest-only
  URL-alias RPCs.
- `service_role` alone can execute `begin_ingest_run`,
  `apply_ingest_snapshot`, and `fail_ingest_run`.
- The URL-alias resolver is a narrow `SECURITY DEFINER` exception: it accepts at
  most 100 lowercase SHA-256 digests, uses an empty `search_path`, and returns
  only the requested digest and an opaque tracking key. Public roles retain no
  access to the private alias table.
- All ingestion mutation functions are `SECURITY INVOKER` with an empty
  `search_path` and fully qualified objects. The sole private `SECURITY DEFINER`
  verifier reads the named Vault entry, performs a fixed-work digest comparison,
  and is reachable only through a service-role-only `SECURITY INVOKER` wrapper.
- The obsolete `ingest_upsert` and `ingest_upsert_v2` functions are removed.
- `app_meta` schema/table/function access is revoked from `PUBLIC`, `anon`, and
  `authenticated`, with restrictive default privileges for future objects.
- RLS is enabled on every table in the exposed `public` schema and on private
  operational tables as defense in depth.

`verify_jwt = false` on the ingest Edge Function is deliberate: the caller uses
an opaque scheduler credential, not a Supabase user JWT. The function performs
its own bounded Bearer parsing and Vault-backed digest verification before any
adapter import. Missing Vault state or any database error fails closed.

## Configuration boundaries

### Browser-safe

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (compatibility alternative)

Only variables prefixed with `NEXT_PUBLIC_` may reach the browser. The public
client is initialized lazily and throws when its required values are missing;
there is no hardcoded production fallback.

### Optional server/manual-ingestion values

- `SUPABASE_URL`, with `NEXT_PUBLIC_SUPABASE_URL` as the same-project URL
  fallback
- `SUPABASE_SECRET_KEY` (preferred local/manual-runner value)
- `SUPABASE_SERVICE_ROLE_KEY` (legacy-compatible alternative)
- `CRON_SECRET` (Next.js manual ingestion route only)
- `INGEST_CODE_VERSION` (local/manual runner override only)
- `VERCEL_GIT_COMMIT_SHA` (provided by Vercel and preferred by the runner)

The deployed user-facing app does not require these database or cron secrets.
A secret/service-role value bypasses RLS and must never be prefixed
`NEXT_PUBLIC_`, logged, embedded in a URL, or stored in the repository.

### Operator-only verification

- `SUPABASE_FUNCTION_URL`, optional override for the deployed function URL
- `SUPABASE_URL`, used to derive that URL when no override is set
- `INGEST_CODE_VERSION`, optional local/manual runner label; the Edge Function
  always uses the reviewed artifact checksum

### Supabase Vault

- `ingest_function_url`
- `ingest_cron_secret`

Vault values are production state, not migration contents. The cron secret is
generated directly in Vault and is not duplicated into Edge settings. The
function URL is the HTTPS `/functions/v1/ingest` endpoint for the intended
project.

## Edge artifact identity

`scripts/ingest-artifact.ts` lists every source file that affects the Edge
ingestion artifact. `npm run ingest:artifact:generate` hashes the path and bytes
of each file and writes `supabase/functions/ingest/manifest.ts`.

`npm run ingest:artifact:check` fails if the committed manifest is stale. After
deployment, an unauthenticated HEAD request returns 401 plus
`x-ingest-source-checksum` and `x-ingest-code-version` without invoking adapters.
`npm run ingest:deployed:verify` requires both headers to equal the reviewed
source manifest checksum.

The checksum proves parity with the reviewed shared source set and is stored on
every Edge-triggered ingest run. The surrounding application release retains
the immutable Git commit as separate evidence.

## Browser state

The user-facing **To apply** collection uses the existing versioned
`timley:saved:v2` saved-role store. Application tracking uses
`timley:applications:v3`, retaining unmatched legacy URL records and deletion
tombstones. Both use immutable tracking keys after migration and synchronize
changes across tabs without assuming storage is always available. Relabeling
the collection does not rewrite or discard browser data.

The alias resolver accepts only bounded lowercase SHA-256 hashes through the
publishable client. Raw legacy URLs are not sent to Supabase. A caller that
already knows a historical URL can derive its digest and learn the job's opaque
tracking key, but that key grants no additional data access and no URL or user
data is returned. Known aliases move to stable keys; unknown aliases stay in
the unmatched collection for JSON or CSV export and later recovery. Existing
`appliedAt` and `updatedAt` values are preserved.

Combined tracking backups include both saved-role state (including removal
tombstones and unmatched legacy saves) and application state. Imports are
versioned, bounded, strictly validated, backward-compatible with the former
application-only format, and merge by timestamp. CSV exports neutralize
spreadsheet-formula prefixes. Browser state is not stored in Postgres and is not
affected by a database rollback, but an older application build may not display
the newer versioned keys. Rollback procedures therefore preserve all storage
keys and restore a compatible forward build instead of clearing browser data.

## Logo trust boundary

The ingestion result exposes a company domain only when its confidence is high.
The UI never guesses a low-confidence domain. `/api/company-logo` validates an
ASCII DNS hostname, calls a fixed HTTPS provider origin, rejects redirects,
times out the fetch, limits the response to 256 KiB, verifies the PNG content
type and signature, and supplies positive/negative shared cache policy. The
browser never requests the third-party favicon provider directly.

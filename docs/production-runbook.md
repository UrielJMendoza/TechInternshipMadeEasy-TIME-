# Production migration, release, and rollback runbook

This is the controlled production procedure for the canonical Supabase model,
shared ingestion artifact, and Next.js application. It is deliberately
forward-only and fail-closed.

Nothing in the default workflow below commits, deploys, changes a remote secret,
pushes a migration, invokes production ingestion, or promotes a Vercel release.
The production mutation section begins only after the explicit review gate.

## Roles and release identity

Assign these roles before collecting evidence:

- release owner: coordinates the sequence and records timestamps;
- database reviewer: approves migration history, SQL, grants, RLS, and rollback;
- ingestion reviewer: approves adapter safety, manifest checksum, and secret
  rotation;
- application reviewer: approves the Next.js diff and screenshots;
- authorized operator: is the only person allowed to mutate production.

Record the release identity without changing any system:

```bash
git status --short
git rev-parse HEAD
git diff --stat
git diff --check
npm run ingest:artifact:check
```

The reviewed Git SHA must be immutable for the release. If any source file,
migration, generated type, lockfile, or Edge manifest changes, invalidate the
existing evidence and restart review with the new SHA.

The sole migration-connector exception is a post-apply rename that replaces a
local migration timestamp with the connector-assigned remote version while the
SQL body hash stays byte-for-byte identical. That rename still invalidates the
application evidence and requires a new reviewed SHA and full check rerun, but
the already-committed migration must not be applied again. Do not deploy the
Edge artifact, enable the scheduler, or promote Vercel until that final SHA is
recorded.

## Environment and secret inventory

Do not record secret values in the review package. Record only whether each name
is present, which system owns it, and who verified the scope.

| Name | Location | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel and local app | Public project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel and local app | Preferred browser key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Compatibility only | Legacy browser-key alternative |
| `SUPABASE_URL` | Local/manual runner or operator session | Server project URL |
| `SUPABASE_SECRET_KEY` | Local/manual runner only | Preferred server-only database key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge built-in/local compatibility | Legacy-compatible server-only key |
| `CRON_SECRET` | Optional local manual route/operator session | Separate recovery credential; absent from hosted Vercel |
| `INGEST_CODE_VERSION` | Local/manual runner only | Optional non-Edge release label |
| `VERCEL_GIT_COMMIT_SHA` | Vercel-managed | Runner code version on Vercel |
| `SUPABASE_FUNCTION_URL` | Optional operator session | Verification URL override |
| `ingest_function_url` | Supabase Vault | Canonical cron target |
| `ingest_cron_secret` | Supabase Vault | Sole canonical scheduler credential |

Rules:

- Never put a service/secret key in a `NEXT_PUBLIC_` variable.
- Never place any scheduler or recovery credential in a URL, query string,
  command argument, issue,
  screenshot, build log, or committed file.
- Generate the replacement scheduler credential directly inside Supabase Vault
  with database cryptographic randomness. It must not be returned to the
  operator and must not equal the old URL-used value.
- Use separate values per environment.
- Supabase supplies its hosted Edge runtime credentials. Verify only that the
  built-in names exist; do not copy a server credential into Vercel.
- The Edge Function validates a SHA-256 digest through the service-role-only
  Vault verifier; it has no duplicate scheduler-secret environment variable.
- The Edge artifact always uses its reviewed manifest checksum as code identity;
  the immutable Git SHA is recorded separately for the application release.

## Forward migration plan

The repository contains nine ordered migration files: seven sanitized no-op
history markers matching the versions already recorded remotely
(`20260708211601` through `20260710043141`), followed by the
`*_production_hardening.sql` idempotent clean-clone/forward upgrade and the
`*_add_job_term_filters.sql` additive internship-term upgrade. Their numeric
prefixes are the local versions unless the authorized connector alignment
procedure replaces them with its returned remote versions. The markers
intentionally do not replay any retired production-only schema, scheduler,
secret, or privileged ingestion RPC.

The hardening migration:

- creates the private `app_meta` schema, canonical `jobs` and `job_sources`, run
  audit tables, review/report tables, constraints, indexes, RLS, views, and RPCs;
- backfills valid `public.internships` rows into the canonical model and creates
  URL-hash aliases while leaving `public.internships` intact;
- preserves an existing canonical tracking key on repeat execution;
- removes the obsolete `ingest_upsert` and `ingest_upsert_v2` functions;
- revokes broad table/function privileges and grants ingestion only to
  `service_role` through `SECURITY INVOKER` functions; the sole read-only
  browser migration exception is a bounded digest-only alias resolver that
  keeps the underlying private table inaccessible;
- deletes only the legacy `public.app_meta` `cron_secret` record, which held the
  previously URL-used credential;
- replaces the named `ingest-listings` schedule with the Vault-backed Bearer
  request. The named schedule is updated rather than duplicated and remains
  disabled until the reviewed Edge artifact is verified.

The internship-term migration adds bounded normalized term arrays to legacy,
canonical, and source-observation rows; backfills only explicit season/year
values; recomputes canonical terms from active observations; and adds the
indexed, security-invoker term facet used by the board. It preserves raw season
text and represents missing or ambiguous terms as “Term not listed” at read
time rather than inventing a season.

`public.internships` is the rollback compatibility boundary. Do not drop it in
this release. The app cutover is from legacy reads to canonical reads; ingestion
cutover is from retired RPCs to the shared runner and service-only RPCs.

After any migration has been applied anywhere, do not edit that migration file.
Make every correction as a new forward migration created with:

```bash
npx supabase migration new <descriptive_change_name>
```

Test the new migration from zero locally, regenerate types from local Supabase,
and repeat the review process. Do not use the production Dashboard table editor
or ad-hoc production SQL to bypass migration history.

For future destructive model changes, use an expand/contract release:

1. add new nullable structures and compatibility code;
2. backfill in bounded, observable batches;
3. switch reads, then writes, in a separately reviewed release;
4. observe through the rollback window;
5. remove old structures only in a later migration with a fresh backup and
   explicit data-retention approval.

## Pre-review validation: no production writes

### 1. Recreate locally

These commands change only the local checkout, build output, and local Docker
database. `test:db` resets the local database; it does not use a linked project.

```bash
npm ci
npx supabase start
npm run test:db
npx supabase db lint --local --level error --fail-on error
npm run types:check
npm run ingest:artifact:check
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
```

Run the browser matrix only after exporting local Supabase credentials as
described in [Testing and CI](testing.md):

```bash
npm run test:e2e
```

Do not substitute a production URL or service credential for these local tests.
Do not run `npm run ingest` as part of release validation; parser fixtures and
local database tests are deterministic and do not need live production writes.

If the shared ingest sources changed, regenerate the manifest locally, inspect
the one-line generated diff, and rerun the check:

```bash
npm run ingest:artifact:generate
npm run ingest:artifact:check
```

If the schema changed, reset local Supabase before generating types:

```bash
npm run test:db
npm run types:generate
npm run types:check
git diff -- src/lib/database.types.ts
```

### 2. Inspect remote migration state read-only

Linking is local CLI configuration. Confirm the selected project name and ref
out of band before every command. When the checkout is linked, run only the
read-only list and dry run:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

When CLI credentials are intentionally unavailable, use the already-authorized,
project-scoped Supabase connector to list migrations read-only. Compare the
pending file names and SHA-256 body hashes locally; do not create a CLI link or
copy a platform token merely to reproduce the dry-run display.

Expected review outcome:

- local and remote both contain version `20260710043141`;
- the dry run proposes `production_hardening` and `add_job_term_filters`, in
  that order, using the current local filename versions, and no unexpected
  migration;
- it does not propose seed data;
- it does not require `--include-all` or migration-history repair.

If history differs, stop. Do not run `migration repair`, `db pull`,
`db push --include-all`, or a production SQL workaround during this release.
Reconcile the reason and submit a separately reviewed migration-history plan.

### 3. Capture the review package

Record actual results; leave an item unchecked when it was not run. Never infer
success from the presence of a script.

| Evidence | Result / artifact |
| --- | --- |
| Reviewed Git SHA and branch | |
| `git diff --check` | |
| Dependency lockfile review | |
| ESLint | |
| TypeScript | |
| Unit tests and exact count | |
| Coverage thresholds | |
| Parser fixture tests | |
| Local migration from zero | |
| pgTAP RLS/RPC permission tests | |
| Local database lint | |
| Generated-type drift check | |
| Edge artifact checksum check | |
| Production build | |
| Playwright/axe matrix | |
| Initial-payload performance fixture | |
| Remote migration list | |
| Remote migration dry run | |

Attach Playwright reports and screenshots for 390×844, 844×390, 768×1024,
1024×768, 1440×900, and the documented 200% reflow check. Confirm title, Save,
Track, Apply, short-landscape menu geometry, sticky toolbar, focus-leave filters,
storage restoration, real pagination, retry, exhaustion, and serious/critical
axe results. Redact all environment values, request headers, project tokens, and
production data.

Also record read-only production baselines before mutation:

- active and total row counts in `public.internships`;
- the latest successful ingest timestamp and current scheduler name/schedule;
- deployed Edge function version/checksum, noting that a mismatch is the reason
  for replacement rather than evidence to accept it;
- backup/PITR availability and the recovery artifact selected for this release;
- current Vercel production deployment ID and a known-good hardened deployment
  candidate for application rollback.

## Mandatory review gate

**Stop here.** Do not commit, push a migration, change a secret, deploy the Edge
Function, invoke ingestion, create or update Vault values, deploy/promote Vercel,
or modify production until all of the following are true:

- the complete diff is reviewed at one immutable Git SHA;
- migration and rollback reviewers have approved this runbook for the target;
- every required check has an attached result or an explicitly accepted gap;
- screenshots and accessibility evidence have been reviewed;
- recovery capability appropriate to the migration has been confirmed. PITR is
  preferred; for an additive transactional migration on a plan without PITR,
  this may instead be a hashed export of every affected mutable source table,
  verified counts/parseability, and a successful local schema replay;
- the reviewed database-only Vault generation procedure is ready; no plaintext
  cron secret needs to exist before the release;
- the authorized operator and maintenance window are named;
- approval explicitly covers secret rotation, Edge deployment, database
  migration, Vault activation, and Vercel promotion.

Approval for one target does not authorize another. A code or migration change
after approval returns the release to the beginning of the runbook, except for
the body-identical connector-version alignment defined above; that exception
returns to application verification without reapplying the migration.

## Authorized production sequence

This section mutates production. It is not a default setup guide. Only the named
operator may continue after the mandatory gate, and the operator must record the
start/end time and result of every numbered step.

### 1. Freeze and identify

1. Pause unrelated releases and manual ingestion.
2. Confirm the checked-out SHA exactly matches the reviewed SHA.
3. Confirm the Supabase project ref, Vercel project, domain, and backup timestamp
   with a second reviewer.
4. **Disable the currently deployed Vercel Cron before changing any secret or
   database object.** Use the protected Vercel Cron/project control for the
   exact production project, record the disabled job and timestamp, and verify
   no scheduled request reaches the legacy `/api/ingest` path. Updating a
   Vercel environment variable does not update an existing deployment and is
   not a substitute for disabling this job. Stop if the old Cron cannot be
   positively disabled.
5. Remove the legacy Vercel `CRON_SECRET` from Production and Preview project
   scopes before creating the new deployment. Confirm the new preview's
   `/api/ingest` route returns `401` without invoking ingestion; the hosted app
   has no manual privileged ingestion path after this cutover.
6. Re-run `npm run ingest:artifact:check` and either the linked migration dry
   run or the authorized connector's exact migration-body comparison.
7. Keep the old Vercel deployment ID for rollback, but do not plan to restore
   any retired query-secret or privileged-RPC ingestion path.

### 2. Rotate inside Vault and pause the old path

1. Confirm both the Vercel Cron feature and the existing Supabase
   `ingest-listings` job are disabled.
2. In one approved database transaction, create or rotate
   `ingest_cron_secret` with 32 cryptographically random bytes encoded as 64
   lowercase hexadecimal characters. Generate the value inside Postgres and
   pass it directly to `vault.create_secret` or `vault.update_secret`; do not
   return, print, copy, or place it in a command argument.
3. Create or update `ingest_function_url` with the confirmed HTTPS URL ending in
   `/functions/v1/ingest`.
4. Verify only the two Vault names and their update timestamps. Never select a
   decrypted value and never copy the old `public.app_meta` credential.

The Vault value is the scheduler's single source of truth. It is deliberately
not duplicated into Supabase Edge or Vercel environment variables.

### 3. Apply the forward migrations once

Run the dry run again and compare it with the approved artifact. A CLI-linked
operator may apply the two pending migrations in one reviewed push:

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

If CLI credentials are intentionally unavailable but the authorized Supabase
deployment connector is already authenticated, apply each reviewed file body
exactly once with the connector's migration tool and its filename stem as the
name. Record the SQL-body hash and connector-assigned version. Because the
connector assigns its own timestamp, align the local migration filename to that
returned version immediately afterward without changing a byte of SQL, rerun
all release checks, and make that metadata-only alignment the final reviewed
application SHA. Stop if body hashes differ or any other file changes.

Do not include seed data. Do not use `--include-all`, `migration repair`, the SQL
editor, or the table editor. If application fails before commit, collect the
exact error and stop; do not loop or patch production manually.

The scheduler remains disabled while the newly created private Vault verifier
and service-role-only public wrapper become available.

### 4. Deploy and verify the reviewed Edge artifact

Deploy only the named function from the reviewed checkout:

```bash
npx supabase functions deploy ingest --project-ref "$SUPABASE_PROJECT_REF"
```

Set `SUPABASE_URL` (or `SUPABASE_FUNCTION_URL`) in the operator session, then
run:

```bash
npm run ingest:deployed:verify
```

The unauthenticated HEAD probe must return 401 while exposing the reviewed
source checksum and code identity. It loads no adapters and starts no ingestion.
Malformed, query-string-only, old, and incorrect credentials must also return
401 and create no source run. Stop on any checksum/version mismatch.

### 5. Set release identity and enable the scheduler

After both migrations commit, use the same approved database session to set the
non-secret stale-code expectation to the reviewed manifest checksum:

```sql
update app_meta.ingest_settings
set expected_ingest_code_version = '<INGEST_SOURCE_CHECKSUM>',
    updated_at = now()
where singleton;
```

This exact one-row configuration write is part of the reviewed release, not an
ad-hoc schema repair. Verify one row changed and that the stored value exactly
matches both Edge version headers. Then enable exactly the named cron job with
`cron.alter_job`, and verify its schedule is still `15 */2 * * *`.

### 6. Verify database security and preservation

Use a read-only SQL session to capture results from the following post-migration
checks. These statements contain no secret values and make no writes:

```sql
select
  to_regclass('public.internships') is not null as legacy_preserved,
  to_regclass('public.jobs') is not null as jobs_present,
  to_regclass('public.job_sources') is not null as sources_present,
  to_regclass('public.ingest_runs') is not null as runs_present;

select
  has_schema_privilege('anon', 'app_meta', 'usage') as anon_app_meta_usage,
  has_schema_privilege('authenticated', 'app_meta', 'usage') as auth_app_meta_usage,
  has_function_privilege(
    'anon',
    'public.begin_ingest_run(text,text,text)',
    'execute'
  ) as anon_begin_ingest,
  has_function_privilege(
    'anon',
    'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)',
    'execute'
  ) as anon_apply_ingest,
  has_function_privilege(
    'authenticated',
    'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)',
    'execute'
  ) as auth_apply_ingest,
  has_function_privilege(
    'service_role',
    'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)',
    'execute'
  ) as service_apply_ingest;

select
  to_regprocedure('public.ingest_upsert(jsonb,text)') as old_ingest,
  to_regprocedure('public.ingest_upsert_v2(jsonb,text,jsonb)') as old_ingest_v2;

select jobid, jobname, schedule, active
from cron.job
where jobname = 'ingest-listings';

select name
from vault.secrets
where name in ('ingest_function_url', 'ingest_cron_secret')
order by name;

select expected_ingest_code_version
from app_meta.ingest_settings
where singleton;

select count(*) as old_cron_secret_rows
from public.app_meta
where key = 'cron_secret';
```

Expected security results:

- legacy and canonical tables are present;
- both public roles have no `app_meta` schema usage;
- public roles cannot execute ingestion RPCs;
- `service_role` can execute the snapshot RPC;
- both obsolete functions resolve to null;
- exactly one active named cron job has schedule `15 */2 * * *`;
- both Vault names exist without revealing values;
- `expected_ingest_code_version` equals the reviewed manifest checksum;
- the old public-table cron secret count is zero.

Compare legacy-to-canonical backfill counts and sample mappings using only
non-sensitive aggregates. Investigate differences caused by invalid/non-HTTPS
legacy URLs; do not force invalid rows into the canonical tables.

### 7. Observe one canonical ingestion run

Allow the named schedule to initiate the first run, or use one separately
approved manual POST through a secret-masking client. Never use a GET, query
parameter, browser address bar, or command that expands the Bearer token into
shell history/process arguments.

Verify in `ingest_runs` and `ingest_source_runs`:

- one run ID and the expected `supabase-pg-cron` origin;
- reviewed code version and parser version;
- source and aggregate checksums;
- raw, parsed, accepted, and rejected counts;
- duration and final status;
- six source results;
- quarantined sources did not deactivate observations;
- no overlapping run and no duplicate scheduler request;
- no repeated failure, zero-accepted, duration, count-drop, or stale-code alert.

If a source is unhealthy, preserve its prior active observations and investigate
the quarantine. Do not relax thresholds or mark a partial snapshot complete to
make the release appear healthy.

### 8. Validate and promote the application

1. Create a Vercel preview from the reviewed SHA with only the production
   project URL and publishable key configured in their correct scopes.
2. Confirm the preview has no Vercel cron, no `CRON_SECRET`, no server database
   key, and no hardcoded project fallback. Legacy alias recovery must succeed
   through the bounded publishable RPC.
3. Validate the read path, first-30 payload, real pagination, source and term
   facets, default newest-opening order, stable To apply/Track browser state,
   transfer controls, title/Apply behavior, trust data, and same-origin logo
   proxy.
4. Repeat the required screenshot and axe matrix against the preview and attach
   the artifacts to the approval record.
5. Compare server/API errors and Supabase read traffic with the baseline.
6. Obtain final application promotion approval, then promote only that reviewed
   preview through the protected Vercel release workflow.
7. Run public smoke tests without invoking ingestion. Recheck the Edge checksum
   and latest scheduler run after promotion.

## Rollback strategy

Rollback prioritizes confidentiality, stable browser state, and recoverable data
over restoring the retired ingestion implementation.

### First response

1. Declare the incident, freeze releases, record the time, and preserve logs.
2. Stop new ingestion by disabling the single named cron job through the
   protected Supabase Cron interface. Rotate the Vault credential internally if
   compromise is suspected; never reveal it. This is an authorized incident
   mutation.
3. Confirm ingestion requests now fail 401 and no run remains stuck beyond its
   lease. Do not expose a token while testing.
4. Leave canonical and legacy tables in place.

### Application rollback

- Prefer the last known-good **hardened** Vercel deployment. Never restore a
  build that supports query-string cron secrets or depends on public privileged
  ingestion RPCs.
- If no hardened build is usable, serve a read-only maintenance/fallback build.
  `public.internships` remains available under its restricted active-row RLS
  policy for a temporary compatibility read path.
- Do not restore `vercel.json` or create a backup Vercel scheduler.
- Do not restart legacy ingestion. It was intentionally made non-executable.

Vercel promotion does not delete localStorage. Do not tell users to clear site
data. Preserve these stores and any unknown future versions:

- `timley:saved`
- `timley:saved:v2`
- `timley:applied`
- `timley:applications:v2`
- `timley:applications:v3`

An older UI may temporarily fail to display v3 records, but the compatible
forward build will recover them. JSON/CSV backups retain unmatched legacy
records. Do not down-convert or delete browser state during rollback.

### Edge rollback

- Redeploy only a previously reviewed hardened Edge artifact with Bearer-only
  pre-authentication, shared runner imports, and service-only invoker RPCs.
- Verify its checksum with the unauthenticated 401 HEAD probe before
  reactivating the scheduler.
- Never redeploy the stale production-only function or any function that fetches
  adapters before authentication.

### Database rollback

The database plan is forward-fix, not destructive down migration:

- If the hardening migration fails before transaction commit, leave production
  at the prior schema, keep ingestion paused, and prepare a new reviewed
  migration.
- If it commits, do not drop `jobs`, `job_sources`, tracking keys, URL aliases,
  run history, or legacy `internships`.
- Correct schema or data problems with a new timestamped migration tested from
  zero. Do not edit the applied migration or repair history casually.
- Use PITR/backup restore only for corruption that cannot be forward-fixed.
  Restore into an isolated project first, quantify the data-loss window, and
  obtain separate approval before redirecting production.

Browser-owned tracking is independent of the database and survives a database
restore. The URL alias map and immutable tracking keys are database recovery
assets; retain both so legacy browser records can resolve again after the
forward fix.

### Reactivation criteria

Reactivate the single scheduler only when:

- the forward fix or hardened Edge rollback has passed checksum/version checks;
- database permissions match the expected matrix;
- Vault contains the matching rotated secret and correct project URL;
- one controlled run completes without overlapping, unsafe deactivation, or
  stale-code alerts;
- the application reads canonical rows and stable tracking keys correctly;
- incident owner and database/ingestion reviewers approve reactivation.

Record the final state, affected run IDs, deployments, migrations, credential
rotation, user impact, and follow-up actions. Do not put secret values in the
incident report.

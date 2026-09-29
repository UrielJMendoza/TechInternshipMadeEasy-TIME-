# Timley operations and recovery

The public site remains account-free. Saved jobs, application statuses and private notes remain in the visitor's browser. Refresh requests send listing IDs only, never notes or application statuses.

## Reviewing reports

Use the existing Timley Supabase project's authenticated SQL editor or a trusted server with its service role. Anonymous visitors cannot read reports, resolve reports, or access the resolution audit.

Review the private queue with:

```sql
select r.id,r.created_at,r.kind,r.details,j.company,j.title,j.primary_apply_url
from public.job_reports r join public.jobs j on j.id=r.job_id
where r.status='open' order by r.created_at;
```

Check the employer source, correct the affected field or source mapping if justified, then call `public.resolve_job_report(report_id, 'resolved', reviewer_name, evidence_and_correction)`. Use `dismissed` with a reason when a report cannot be substantiated. This operation records the previous status, reviewer, explanation and time in `app_meta.job_report_resolutions`; it does not silently modify jobs. Repeated resolution attempts are rejected. Only authenticated project maintainers/service credentials can perform it. Reports are not automatically treated as facts.

Intake accepts at most five reports per browser token per day, 25 per listing per day and 500 total per hour. The database enforces these limits, including direct requests that bypass the website. Browser tokens can be replaced, so the listing and total limits provide additional bounds. The website independently limits request bodies to 4 KiB even without a declared length. Existing unique constraints make repeated reports idempotent. The resolution and quota tests ran in rolled-back transactions; no test reports remain in production.

## Ingestion and evidence

`public.public_ingest_health()` reports safe per-source freshness without exposing credentials. The website's `/api/health/jobs` requires both a live feed and healthy source updates; cached fallback data does not count as healthy ingestion. Expired ingestion leases are reaped every five minutes.

The importer uses custom authorization against the existing Vault credential. Keep that credential and privileged service credentials out of browser bundles and Git. Source quarantine and two-miss deactivation rules remain in place. Inspect `ingest_runs`, `ingest_source_runs` and the corresponding HTTP response; successful request queuing alone does not establish successful ingestion.

The employer evidence worker reads bounded public ATS responses. An inaccessible or unsupported source remains unknown; one failed request does not close a listing. Evidence is tied to the application URL and expires after 14 days for displayed confirmations. A database trigger protects verified title, pay and sponsorship facts from weaker imported values while the receipt is valid.

## Supabase egress and quota restrictions

The organization moved from the free plan to Supabase Pro on September 28, 2026. Pro includes far more egress, but usage is still metered. When an organization exceeds a plan quota, Supabase answers every API request with HTTP 402, which also stops the scheduled imports. The website then serves the bundled snapshot. `/api/health/jobs` reports the cause as `lastFailureCode` (for example `upstream_http_402`), and the `Public feed health` workflow prints it. Check Supabase billing and usage first when you see it.

In September 2026 the website itself caused this. Each import rewrites `updated_at` on every listing it sees, so "rows changed since the bundle" is effectively the whole table: about 9,600 rows, 13 MB of JSON and roughly 2 MB compressed. Every warm serverless instance re-read all of it every five minutes, about 17 GB a month per instance against the free plan's 5 GB. Requests have returned 402 since mid-September, and the last database update was September 12.

The reader now keeps each instance's delta rows in memory. After one full read, a warm instance only requests rows whose `updated_at` is later than its previous read minus a 15-minute overlap, then merges them by ID. The overlap covers transactions that commit after a later read, because Postgres stamps `now()` at transaction start. A complete re-read every six hours guards against anything missed. Between imports an incremental read is usually empty or a few employer-evidence rows. `sync.mode` and `sync.fetchedRows` in the health response show which path ran.

### How the feed stays inside the quota

1. **Snapshot built into every production deployment.** `npm run build:vercel` first runs `scripts/export-feed-snapshot.mjs`. On production builds it reads the active listings of the last 90 days once (about 6,200 rows, roughly 10 MB of JSON and 1.5 MB compressed) and writes them over `data/fallback/`. Visitors and cold starts read jobs from the deployment, so they cost Supabase nothing. A failed, incomplete or implausibly small export never fails the build: it keeps the committed snapshot and prints why. Previews and CI skip the export; set `TIMLEY_EXPORT_FEED=true` to force it, or `false` to disable it.
2. **A rebuild after each import.** The `Refresh bundled feed` workflow calls a Vercel deploy hook at 01:05, 07:05, 13:05 and 19:05 UTC, twenty minutes after each import window. That is four exports a day, well under 1 GB of egress a month.
3. **A per-sync budget.** Before reading rows, the site counts pending changes with a one-ID query. Above 2,500 rows (`MAX_ROWS_PER_SYNC`) it transfers nothing. It keeps serving its current data and checks again five minutes later. The health route reports this as `mode: "deferred"` with `pendingRows`. It stays healthy while the served data is under 26 hours old, which covers import windows before the rebuild lands. It turns degraded after that, which usually means the deploy hook or the export stopped working.
4. **Incremental reads.** Warm instances fetch only rows changed since their previous read, as described above.
5. **A 90-day window.** A listing leaves the public feed, sitemap and export once its first observation or its posting date is more than 90 days old (`RETENTION_DAYS`). Rows stay in the database; nothing is deleted.

**One-time setup:** in Vercel open the project's Settings, then Git, then Deploy Hooks. Create a hook for the production branch (`claude/internship-tracker-app-05orfv`). Save its URL as the GitHub Actions secret `VERCEL_DEPLOY_HOOK_URL`. Until then the workflow only warns, and the bundle refreshes whenever production is redeployed.

Budget: 4 exports a day at about 1.5 MB is roughly 0.2 GB a month. Incremental reads between rebuilds are usually a few hundred employer-evidence rows. A worst-case sync is capped at about 0.6 MB. Health checks and alias lookups are a few hundred bytes each.

## Recovery

The original local checkout is preserved. The isolated repair branch contains the replacement code. The preceding website deployment is `dpl_HR59L5MbyuiHQLeVR7a9D9koSjNC`; preserve it until the replacement passes live verification. A website rollback must remain compatible with additive database fields. Do not delete reports, observations or evidence to undo a presentation change.

The deployed importer v19 source and the pre-change ingestion SQL are backed up in the task's working area. If an importer release fails, restore its prior Edge source and matching expected-code checksum together. If only a source fails, retain the other successful sources and investigate its parser/quarantine record. Do not force a failed snapshot through deactivation safeguards.

The staggered community schedule and employer verification schedule were explicitly approved and applied on September 5, 2026. Community sources run individually at minutes 15, 20, 25, 30, 35 and 40 of 06:00 and 18:00 UTC. Official boards retain their existing schedule.

## Recurring checks and identities

The `Public feed health` GitHub workflow is prepared to run hourly at minute 53 once it reaches the default branch. It retries a failing public health request three times and then fails visibly in Actions. GitHub notification delivery follows the repository owner's Actions notification settings; no separate email or chat recipient is configured. It uses no secrets and performs no data writes. Counts are logged on success. Existing source quarantine and deactivation safeguards remain the protection against a sudden feed collapse.

Run `node scripts/reconcile-job-identities.mjs` for a read-only current-feed manifest. It records source membership, old public aliases and ambiguous aliases needing review. `--apply` requires a trusted server's `SUPABASE_SERVICE_ROLE_KEY` and records batches of at most 100 groups; do not pass that key to the client. Rerun after identity-rule changes and review collisions before applying. The registry retains historical membership; routine feed updates continue to use current application identity rules.

The employer queue allows at most six distinct canonical jobs per invocation and skips groups checked in the preceding 24 hours. A verified receipt is valid for displayed confirmations for 14 days. Explicit mandatory professional experience can exclude a role only when the employer evidence provides no alternative graduate path; ambiguous roles remain visible with an eligibility note.

Applied schedule migrations: `20260905020428_stagger_community_ingestion.sql` and `20260905052620_schedule_employer_verification.sql`. Check the connected database migration history before any CLI push: migrations applied through the management API may have different version timestamps from their source filenames.

The repository's importer checksum is `b23277ff98502497b3dc5ff1eef4f7e9ddb9c207601027915aee00cee6b39a2d`. The employer worker is deployed separately (v3), and its extra files are not imported by the importer entrypoint. Before a future importer deployment, regenerate `manifest.ts` with `node scripts/build-ingest-manifest.mjs`, deploy that exact source, and update the expected code version in the same step. The checksum covers the whole function directory, so adding enrichment-only files also changes it.

**Deploying the importer.** The `Deploy ingest function` workflow does this. It runs when a push to the production branch changes `supabase/functions/ingest/`, and can also be started by hand from the Actions tab. It fails if `manifest.ts` is stale, runs the Deno tests, and deploys with the Supabase CLI (`--no-verify-jwt`, because the handler checks its own Vault credential). It then waits until the function's `x-ingest-code-version` header reports the new checksum, and only then writes that checksum to `app_meta.ingest_settings.expected_ingest_code_version`. It needs the GitHub Actions secret `SUPABASE_ACCESS_TOKEN`, a personal access token from Supabase (Account, then Access Tokens). Without it the workflow runs the checks and warns instead of deploying. To roll back, revert the change on the production branch; the workflow redeploys the previous source.

**Simplify and the Edge CPU limit.** The Simplify lists keep every listing ever published, about 37,000 rows of which ~4,400 are open. Every Simplify run failed from September 11 at 18:15 onward with `WORKER_RESOURCE_LIMIT` ("CPU Time exceeded"): the importer schema-validated every row and recompiled hundreds of location and term regular expressions for each job. The adapter now drops closed and hidden rows before validation, parses one feed at a time, skips postings older than 90 days, and compiles the patterns once. On the real feeds this cut the run from about 1.6 s to 1.07 s of CPU, and the database payload for the same input was byte-identical before the 90-day cutoff was added. If `ingest_source_runs` stops showing Simplify, check `function_logs` for "CPU Time exceeded".

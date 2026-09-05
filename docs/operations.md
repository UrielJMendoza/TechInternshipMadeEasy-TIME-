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

## Recovery

The original local checkout is preserved. The isolated repair branch contains the replacement code. The preceding website deployment is `dpl_HR59L5MbyuiHQLeVR7a9D9koSjNC`; preserve it until the replacement passes live verification. A website rollback must remain compatible with additive database fields. Do not delete reports, observations or evidence to undo a presentation change.

The deployed importer v19 source and the pre-change ingestion SQL are backed up in the task's working area. If an importer release fails, restore its prior Edge source and matching expected-code checksum together. If only a source fails, retain the other successful sources and investigate its parser/quarantine record. Do not force a failed snapshot through deactivation safeguards.

The staggered community schedule and employer verification schedule were explicitly approved and applied on September 5, 2026. Community sources run individually at minutes 15, 20, 25, 30, 35 and 40 of 06:00 and 18:00 UTC. Official boards retain their existing schedule.

## Recurring checks and identities

The `Public feed health` GitHub workflow is prepared to run hourly at minute 53 once it reaches the default branch. It retries a failing public health request three times and then fails visibly in Actions. GitHub notification delivery follows the repository owner's Actions notification settings; no separate email or chat recipient is configured. It uses no secrets and performs no data writes. Counts are logged on success. Existing source quarantine and deactivation safeguards remain the protection against a sudden feed collapse.

Run `node scripts/reconcile-job-identities.mjs` for a read-only current-feed manifest. It records source membership, old public aliases and ambiguous aliases needing review. `--apply` requires a trusted server's `SUPABASE_SERVICE_ROLE_KEY` and records batches of at most 100 groups; do not pass that key to the client. Rerun after identity-rule changes and review collisions before applying. The registry retains historical membership; routine feed updates continue to use current application identity rules.

The employer queue allows at most six distinct canonical jobs per invocation and skips groups checked in the preceding 24 hours. A verified receipt is valid for displayed confirmations for 14 days. Explicit mandatory professional experience can exclude a role only when the employer evidence provides no alternative graduate path; ambiguous roles remain visible with an eligibility note.

Applied schedule migrations: `20260905020428_stagger_community_ingestion.sql` and `20260905052620_schedule_employer_verification.sql`. Check the connected database migration history before any CLI push: migrations applied through the management API may have different version timestamps from their source filenames.

The current importer is v20, code checksum `759352793254ebdf26f17214dbb89c1b70adfeb5d6eeebf1876789445599e05f`. The employer worker is independently deployed as v3. Its additional files are not imported by the importer entrypoint. Before a future importer deployment, regenerate `manifest.ts` with `node scripts/build-ingest-manifest.mjs`, deploy that exact source, and update the database's expected code version together. The checksum generator hashes the current function directory, so adding enrichment-only files changes a future generated checksum without changing the already deployed v20 importer.

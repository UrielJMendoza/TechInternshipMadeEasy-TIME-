# Ingestion operations

## Authority and cadence

The checked-in Supabase Edge Function is Timley's authoritative production
ingestion pipeline. `vercel.json` intentionally has no ingestion cron; the
Next.js `/api/ingest` route is not a production scheduler.

Supabase pg_cron invokes two isolated modes twice per UTC day:

- `ingest-listings` at 06:15 and 18:15 UTC fetches the six reviewed community
  sources.
- `ingest-official-ats` at 00:45 and 12:45 UTC fetches the three direct ATS
  sources.

The non-overlapping windows prevent the modes from competing for the global
ingestion lease and provide a second daily attempt without returning to the
previous 17-attempt schedule. A scheduled attempt cannot guarantee an upstream
publisher is available, so production health must be evaluated per source.

## Source contract

The registry is derived from deployed v17 and contains exactly nine sources:

- Community: Simplify, zshah101, zapplyjobs, Northwestern Fintech, SpeedyApply,
  and vanshb03.
- Official ATS: Tenstorrent University through Greenhouse, Notion through
  Ashby, and Hermeus through Lever.

The six community parsers are version 3. Historical count and rejection-rate
baselines are scoped to the same parser version, so an intentional parser
change gets one clean baseline without weakening the absolute schema, marker,
zero-result, payload, or rejection-rate guards.

`supabase/functions/ingest/manifest.ts` records the reviewed artifact
checksum. Any functional Edge change must run
`npm run ingest:artifact:generate`; review and CI should then run
`npm run ingest:artifact:check`.

## Failure containment

`apply_ingest_snapshot` alone has a 55-second function-local statement timeout.
Global database and API timeouts are unchanged, while pg_net retains a
60-second request boundary.

Before each scheduled request, `app_meta.reap_stale_ingest_runs` marks an audit
row failed only when it has been running for more than 20 minutes and has no
live lease. It preserves `ingest_runs` and `ingest_source_runs`; only expired
lease coordination state is removed. Existing nonblank error evidence is also
preserved.

## Release order

1. Review and deploy the checked-in Edge Function with JWT verification off;
   the handler performs its own Vault-backed Bearer authentication before any
   adapter import or upstream request.
2. Confirm the function's checksum header matches the checked-in manifest.
3. Confirm Vault contains one `ingest_function_url` and one rotated
   `ingest_cron_secret` entry. Never place either value in SQL or a URL.
4. Apply the migration. It removes known legacy scheduler aliases through
   `cron.unschedule`, repairs abandoned audit rows, and creates the two
   twice-daily jobs through `cron.schedule`.
5. After each mode runs, verify every source separately in
   `ingest_source_runs`; an aggregate HTTP success is not source coverage.

To pause ingestion safely, use `cron.alter_job` or `cron.unschedule`. Do not
write directly to `cron.job`, and do not delete ingestion audit rows.

## Health query

Run this exact query as the Postgres operator role. The private view returns all
nine expected sources, including a row with null timestamps when a source has
never completed a healthy snapshot:

```sql
select
  source,
  last_healthy_run_id,
  last_healthy_at,
  last_parser_version,
  last_accepted_count,
  healthy_within_26h
from app_meta.ingest_source_health
order by healthy_within_26h, source;
```

A healthy row requires a real run ID and a successful, complete,
schema-valid, marker-valid, non-quarantined snapshot with at least one accepted
record within 26 hours. The view is explicitly unavailable to `public`,
`anon`, `authenticated`, and `service_role`.

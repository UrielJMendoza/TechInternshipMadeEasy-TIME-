-- Additive: source observations and existing read policies remain intact.
alter table public.jobs add column if not exists employer_evidence jsonb not null default '{}'::jsonb
  check (jsonb_typeof(employer_evidence) = 'object' and octet_length(employer_evidence::text) <= 60000);
alter table public.jobs add column if not exists employer_checked_at timestamptz;
create index if not exists jobs_updated_at_id_idx on public.jobs(updated_at, id);
create index if not exists jobs_enrichment_queue_idx on public.jobs(employer_checked_at nulls first, first_seen_at desc) where is_active;

create or replace function public.public_ingest_health()
returns jsonb language sql stable security definer set search_path = '' as $$
with expected(source) as (values ('simplify'),('zshah101'),('zapplyjobs'),('northwesternfintech'),('speedyapply'),('vanshb03'),('gh:tenstorrentuniversity'),('ashby:notion'),('lever:hermeus')),
sources as (
 select expected.source, latest.ran_at as last_attempt_at, healthy.ran_at as last_success_at,
   coalesce(latest.succeeded and not latest.quarantined, false) and healthy.ran_at > now() - interval '15 hours' as healthy
 from expected
 left join lateral (select s.ran_at,s.succeeded,s.quarantined from public.ingest_source_runs s where s.source=expected.source order by s.ran_at desc limit 1) latest on true
 left join lateral (select s.ran_at from public.ingest_source_runs s where s.source=expected.source and s.succeeded and not s.quarantined order by s.ran_at desc limit 1) healthy on true
)
select jsonb_build_object('healthy',coalesce(bool_and(healthy),false),'checkedAt',now(),
 'sources',jsonb_agg(jsonb_build_object('source',source,'healthy',coalesce(healthy,false),'lastAttemptAt',last_attempt_at,'lastSuccessAt',last_success_at) order by source)) from sources;
$$;
revoke all on function public.public_ingest_health() from public;
grant execute on function public.public_ingest_health() to anon, authenticated, service_role;

-- Detect orphaned requests independently of the next ingestion cycle.
select cron.schedule('timley-reap-expired-ingestion','*/5 * * * *',
 $$select app_meta.reap_stale_ingest_runs(interval '15 minutes');$$);

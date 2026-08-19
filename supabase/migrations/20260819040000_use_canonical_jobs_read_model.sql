-- Keep existing public job URLs stable while moving the website to the
-- canonical jobs/job_sources ingestion model.
alter table public.jobs
  add column if not exists public_id uuid;

update public.jobs as job
set public_id = legacy.id
from public.internships as legacy
where job.public_id is null
  and job.legacy_identity_key is not null
  and legacy.dedupe_key = job.legacy_identity_key;

create unique index if not exists jobs_public_id_key
  on public.jobs (public_id)
  where public_id is not null;

comment on column public.jobs.public_id is
  'Stable website identifier retained from the legacy internships read model.';

drop policy if exists "public read active jobs" on public.jobs;
drop policy if exists "public read current and recent jobs" on public.jobs;

create policy "public read current and recent jobs"
on public.jobs
for select
to anon, authenticated
using (
  country_code = 'US'
  and (
    (
      is_active
      and coalesce(posted_date, first_seen_at::date) >= current_date - 120
    )
    or (
      not is_active
      and last_seen_at >= current_timestamp - interval '90 days'
    )
  )
);

create or replace view public.timley_public_jobs
with (security_invoker = true)
as
select
  coalesce(job.public_id, job.id) as id,
  job.title,
  job.company,
  job.display_location as location,
  job.category,
  job.role_type,
  job.season,
  job.salary_raw as salary,
  job.primary_apply_url as link,
  job.primary_source as source,
  job.sponsorship,
  job.posted_date,
  job.first_seen_at,
  job.last_seen_at,
  job.last_checked_at as last_verified_at,
  job.is_active,
  job.primary_source as original_source,
  lower(job.company) as canonical_company,
  job.primary_apply_url as canonical_url,
  observation.external_id as external_job_id,
  observation.requisition_id,
  lower(job.title) as normalized_title,
  lower(job.display_location) as normalized_location,
  null::text as content_fingerprint,
  'source-observed'::text as verification_status,
  case
    when job.is_active then 'active'
    else 'possibly-closed'
  end::text as expiration_status,
  case when job.is_active then null else job.last_checked_at end as closed_at,
  case
    when job.salary_raw is null then 'unknown'
    else 'employer-listed'
  end::text as pay_evidence,
  case
    when coalesce(job.sponsorship, '') ~* '(citizens? only|u[.]?s[.]? citizenship|security clearance)'
      then 'restricted'
    when coalesce(job.sponsorship, '') ~* '(no|not|cannot|without).{0,24}sponsor'
      then 'not-offered'
    when coalesce(job.sponsorship, '') ~* '(offer|provide|will).{0,24}sponsor|visa sponsorship'
      then 'confirmed'
    else 'unknown'
  end::text as sponsorship_status,
  case
    when job.sponsorship is null then null
    else job.primary_source
  end as sponsorship_source,
  null::numeric as sponsorship_confidence,
  coalesce(job.legacy_identity_key, job.id::text) as duplicate_group,
  coalesce(job.legacy_identity_key, job.id::text) as canonical_record_key
from public.jobs as job
left join lateral (
  select source.external_id, source.requisition_id
  from public.job_sources as source
  where source.job_id = job.id
    and source.active
  order by
    (source.source = job.primary_source) desc,
    source.last_seen_at desc,
    source.id desc
  limit 1
) as observation on true;

revoke all on public.timley_public_jobs from public;
grant select on public.timley_public_jobs to anon, authenticated;

comment on view public.timley_public_jobs is
  'Public compatibility read model backed by the canonical nine-source jobs pipeline.';

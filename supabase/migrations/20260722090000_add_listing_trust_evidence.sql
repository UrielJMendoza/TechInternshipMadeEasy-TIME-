alter table public.internships
  add column if not exists original_source text,
  add column if not exists canonical_company text,
  add column if not exists canonical_url text,
  add column if not exists external_job_id text,
  add column if not exists requisition_id text,
  add column if not exists normalized_title text,
  add column if not exists normalized_location text,
  add column if not exists content_fingerprint text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists verification_status text not null default 'unchecked',
  add column if not exists expiration_status text not null default 'active',
  add column if not exists closed_at timestamptz,
  add column if not exists pay_evidence text not null default 'unknown',
  add column if not exists sponsorship_status text not null default 'unknown',
  add column if not exists sponsorship_source text,
  add column if not exists sponsorship_confidence numeric,
  add column if not exists duplicate_group text,
  add column if not exists canonical_record_key text;

update public.internships
set
  original_source = coalesce(original_source, source),
  canonical_company = coalesce(canonical_company, lower(company)),
  canonical_url = coalesce(canonical_url, link),
  normalized_title = coalesce(normalized_title, lower(title)),
  normalized_location = coalesce(normalized_location, lower(location)),
  last_verified_at = coalesce(last_verified_at, last_seen_at),
  verification_status = case
    when verification_status = 'unchecked' then 'source-observed'
    else verification_status
  end,
  expiration_status = case
    when is_active then 'active'
    when last_seen_at < now() - interval '30 days' then 'expired'
    else 'possibly-closed'
  end,
  closed_at = case
    when is_active then null
    else coalesce(closed_at, last_seen_at)
  end,
  pay_evidence = case
    when salary is not null and btrim(salary) <> '' then 'employer-listed'
    else pay_evidence
  end,
  canonical_record_key = coalesce(canonical_record_key, dedupe_key),
  duplicate_group = coalesce(duplicate_group, dedupe_key);

create index if not exists internships_canonical_url_idx
  on public.internships (canonical_url);

create index if not exists internships_external_job_id_idx
  on public.internships (canonical_company, external_job_id)
  where external_job_id is not null;

create index if not exists internships_requisition_id_idx
  on public.internships (canonical_company, requisition_id)
  where requisition_id is not null;

create index if not exists internships_duplicate_group_idx
  on public.internships (duplicate_group);

create index if not exists internships_verification_status_idx
  on public.internships (verification_status, last_verified_at desc);

create or replace function public.ingest_upsert_v3(
  payload jsonb,
  secret text,
  source_results jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  expected text;
  ins_count integer := 0;
  upd_count integer := 0;
  deact_count integer := 0;
  expire_count integer := 0;
begin
  select value->>'secret'
    into expected
    from public.app_meta
    where key = 'cron_secret';

  if expected is null or secret is distinct from expected then
    raise exception 'unauthorized';
  end if;

  if jsonb_typeof(payload) <> 'array' or jsonb_typeof(source_results) <> 'array' then
    raise exception 'payload and source_results must be JSON arrays';
  end if;

  insert into public.ingest_source_runs (
    source,
    succeeded,
    complete_snapshot,
    fetched_count,
    accepted_count,
    error
  )
  select distinct on (source)
    source,
    coalesce(succeeded, false),
    coalesce(complete_snapshot, false),
    greatest(coalesce(fetched, 0), 0),
    greatest(coalesce(accepted, 0), 0),
    nullif(error, '')
  from jsonb_to_recordset(source_results) as result(
    source text,
    fetched integer,
    accepted integer,
    succeeded boolean,
    complete_snapshot boolean,
    error text
  )
  where source is not null and source <> ''
  order by source;

  with rows as (
    select distinct on (row_data.dedupe_key) row_data.*
    from jsonb_to_recordset(payload) as row_data(
      title text,
      company text,
      location text,
      category text,
      role_type text,
      season text,
      salary text,
      link text,
      source text,
      sponsorship text,
      posted_date date,
      dedupe_key text,
      canonical_company text,
      canonical_url text,
      external_job_id text,
      requisition_id text,
      normalized_title text,
      normalized_location text,
      content_fingerprint text,
      verification_status text,
      pay_evidence text,
      sponsorship_status text,
      sponsorship_source text,
      sponsorship_confidence numeric,
      duplicate_group text,
      canonical_record_key text,
      company_domain text
    )
    where row_data.dedupe_key is not null
      and row_data.title is not null
      and row_data.company is not null
      and row_data.link is not null
      and row_data.source is not null
  ),
  matched_existing as (
    update public.internships existing
    set
      dedupe_key = rows.dedupe_key,
      canonical_record_key = rows.canonical_record_key,
      duplicate_group = rows.duplicate_group
    from rows
    where existing.dedupe_key is distinct from rows.dedupe_key
      and existing.source = rows.source
      and (
        existing.link = rows.canonical_url
        or existing.canonical_url = rows.canonical_url
      )
      and not exists (
        select 1
        from public.internships conflict
        where conflict.dedupe_key = rows.dedupe_key
      )
    returning existing.id
  ),
  upserted as (
    insert into public.internships (
      title,
      company,
      location,
      category,
      role_type,
      season,
      salary,
      link,
      source,
      sponsorship,
      posted_date,
      dedupe_key,
      company_domain,
      original_source,
      canonical_company,
      canonical_url,
      external_job_id,
      requisition_id,
      normalized_title,
      normalized_location,
      content_fingerprint,
      last_verified_at,
      verification_status,
      expiration_status,
      closed_at,
      pay_evidence,
      sponsorship_status,
      sponsorship_source,
      sponsorship_confidence,
      duplicate_group,
      canonical_record_key
    )
    select
      title,
      company,
      coalesce(location, ''),
      coalesce(category, 'other'),
      coalesce(role_type, 'internship'),
      season,
      salary,
      canonical_url,
      source,
      sponsorship,
      posted_date,
      dedupe_key,
      company_domain,
      source,
      canonical_company,
      canonical_url,
      external_job_id,
      requisition_id,
      normalized_title,
      normalized_location,
      content_fingerprint,
      now(),
      coalesce(verification_status, 'source-observed'),
      'active',
      null,
      coalesce(pay_evidence, 'unknown'),
      coalesce(sponsorship_status, 'unknown'),
      sponsorship_source,
      sponsorship_confidence,
      duplicate_group,
      canonical_record_key
    from rows
    cross join lateral (
      select count(*) from matched_existing
    ) as migration_guard
    on conflict (dedupe_key) do update set
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      category = excluded.category,
      role_type = excluded.role_type,
      season = coalesce(excluded.season, public.internships.season),
      salary = coalesce(excluded.salary, public.internships.salary),
      link = excluded.link,
      source = excluded.source,
      sponsorship = coalesce(excluded.sponsorship, public.internships.sponsorship),
      posted_date = coalesce(public.internships.posted_date, excluded.posted_date),
      company_domain = coalesce(excluded.company_domain, public.internships.company_domain),
      original_source = coalesce(public.internships.original_source, excluded.original_source),
      canonical_company = excluded.canonical_company,
      canonical_url = excluded.canonical_url,
      external_job_id = coalesce(excluded.external_job_id, public.internships.external_job_id),
      requisition_id = coalesce(excluded.requisition_id, public.internships.requisition_id),
      normalized_title = excluded.normalized_title,
      normalized_location = excluded.normalized_location,
      content_fingerprint = coalesce(excluded.content_fingerprint, public.internships.content_fingerprint),
      last_seen_at = now(),
      last_verified_at = now(),
      verification_status = excluded.verification_status,
      expiration_status = 'active',
      closed_at = null,
      pay_evidence = case
        when excluded.salary is not null then excluded.pay_evidence
        else public.internships.pay_evidence
      end,
      sponsorship_status = excluded.sponsorship_status,
      sponsorship_source = excluded.sponsorship_source,
      sponsorship_confidence = excluded.sponsorship_confidence,
      duplicate_group = excluded.duplicate_group,
      canonical_record_key = excluded.canonical_record_key,
      is_active = true
    returning (xmax = 0) as is_insert
  )
  select
    count(*) filter (where is_insert),
    count(*) filter (where not is_insert)
  into ins_count, upd_count
  from upserted;

  with complete_sources as (
    select distinct source
    from jsonb_to_recordset(source_results) as result(
      source text,
      fetched integer,
      accepted integer,
      succeeded boolean,
      complete_snapshot boolean,
      error text
    )
    where source is not null
      and succeeded is true
      and complete_snapshot is true
      and coalesce(fetched, 0) > 0
  ),
  batch_keys as (
    select row_data->>'dedupe_key' as dedupe_key
    from jsonb_array_elements(payload) as row_data
    where row_data->>'dedupe_key' is not null
  ),
  deactivated as (
    update public.internships internship
    set
      is_active = false,
      expiration_status = 'possibly-closed',
      closed_at = coalesce(internship.closed_at, now())
    where internship.is_active
      and internship.source in (select source from complete_sources)
      and not exists (
        select 1
        from batch_keys
        where batch_keys.dedupe_key = internship.dedupe_key
      )
    returning 1
  )
  select count(*) into deact_count from deactivated;

  with expired as (
    update public.internships
    set expiration_status = 'expired'
    where not is_active
      and expiration_status = 'possibly-closed'
      and closed_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into expire_count from expired;

  return jsonb_build_object(
    'inserted', ins_count,
    'updated', upd_count,
    'deactivated', deact_count,
    'expired', expire_count
  );
end;
$function$;

revoke execute on function public.ingest_upsert_v3(jsonb, text, jsonb)
  from public, authenticated;

grant execute on function public.ingest_upsert_v3(jsonb, text, jsonb)
  to anon;

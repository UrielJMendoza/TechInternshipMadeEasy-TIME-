-- Sanitized, idempotent production baseline and hardening upgrade for timley.dev.
--
-- This migration intentionally contains no credential values. The canonical
-- scheduler reads the Edge Function URL and opaque cron token from Supabase
-- Vault entries named `ingest_function_url` and `ingest_cron_secret`.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create schema if not exists app_meta;

revoke all on schema app_meta from public, anon, authenticated;
grant usage on schema app_meta to service_role;

-- RPC payloads originate from untrusted feeds. These private helpers turn
-- malformed scalar values into NULL so a bad row can quarantine its source
-- instead of aborting the transaction before the run is recorded.
create or replace function app_meta.try_integer(input text)
returns integer
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $function$
begin
  return input::integer;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$function$;

create or replace function app_meta.try_numeric(input text)
returns numeric
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $function$
declare
  parsed numeric;
begin
  parsed := input::numeric;
  if parsed::text in ('NaN', 'Infinity', '-Infinity') then
    return null;
  end if;
  return parsed;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$function$;

create or replace function app_meta.try_boolean(input text)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $function$
  select case lower(input)
    when 'true' then true
    when 'false' then false
    else null
  end;
$function$;

create or replace function app_meta.try_date(input text)
returns date
language plpgsql
stable
strict
security invoker
set search_path = ''
as $function$
begin
  return input::date;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return null;
end;
$function$;

create or replace function app_meta.ingest_job_payload_is_valid(payload jsonb)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    jsonb_typeof(payload) = 'object'
    and length(nullif(btrim(payload->>'source'), '')) between 1 and 64
    and length(nullif(btrim(payload->>'title'), '')) between 1 and 300
    and length(nullif(btrim(payload->>'company'), '')) between 1 and 200
    and (
      nullif(payload->>'category', '') is null
      or payload->>'category' in (
        'software', 'cloud', 'data-ml', 'quant', 'security', 'hardware',
        'mechanical', 'electrical', 'civil', 'aerospace', 'manufacturing',
        'industrial', 'materials', 'finance', 'consulting', 'accounting',
        'operations', 'product', 'marketing', 'supply-chain', 'other'
      )
    )
    and length(coalesce(payload->>'season', '')) <= 100
    and case
      when not (payload ? 'term_keys') then true
      when jsonb_typeof(payload->'term_keys') = 'array'
        and jsonb_array_length(payload->'term_keys') <= 20
        then not exists (
          select 1
          from jsonb_array_elements_text(payload->'term_keys') as term(value)
          where term.value is null
            or term.value !~ '^(winter|spring|summer|fall)-20[0-9]{2}$'
        )
      else false
    end
    and length(coalesce(payload->>'sponsorship', '')) <= 100
    and length(nullif(btrim(payload->>'location'), '')) between 1 and 1000
    and length(coalesce(payload->>'raw_location', '')) <= 2000
    and length(coalesce(payload->>'region_code', '')) <= 64
    and length(coalesce(payload->>'city', '')) <= 200
    and length(coalesce(payload->>'metro_id', '')) <= 128
    and length(coalesce(payload->>'dedupe_key', '')) <= 1024
    and length(coalesce(payload->>'requisition_id', '')) <= 512
    and length(coalesce(payload->>'search_text', '')) <= 4000
    and length(coalesce(payload->>'salary_raw', '')) <= 1000
    and length(coalesce(payload->>'company_domain', '')) <= 253
    and length(payload->>'link') between 1 and 2048
    and payload->>'link' ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    and (
      nullif(payload->>'source_url', '') is null
      or (
        length(payload->>'source_url') <= 2048
        and payload->>'source_url' ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      )
    )
    and (
      nullif(payload->>'external_id', '') is null
      or length(payload->>'external_id') <= 512
    )
    and (
      nullif(payload->>'role_type', '') is null
      or payload->>'role_type' in ('internship', 'new_grad')
    )
    and (
      nullif(payload->>'location_type', '') is null
      or payload->>'location_type' in ('remote', 'hybrid', 'onsite')
    )
    and (
      nullif(payload->>'country_code', '') is null
      or payload->>'country_code' ~ '^[A-Z]{2}$'
    )
    and (
      nullif(payload->>'salary_currency', '') is null
      or payload->>'salary_currency' ~ '^[A-Z]{3}$'
    )
    and (
      nullif(payload->>'salary_cadence', '') is null
      or payload->>'salary_cadence' in ('hourly', 'monthly', 'annual')
    )
    and (
      nullif(payload->>'posted_date', '') is null
      or (
        payload->>'posted_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and
        app_meta.try_date(payload->>'posted_date') is not null
        and app_meta.try_date(payload->>'posted_date') <= current_date + 7
      )
    )
    and (
      nullif(payload->>'normalization_confidence', '') is null
      or app_meta.try_numeric(payload->>'normalization_confidence') between 0 and 1
    )
    and (
      nullif(payload->>'salary_minimum', '') is null
      or app_meta.try_numeric(payload->>'salary_minimum') >= 0
    )
    and (
      nullif(payload->>'salary_maximum', '') is null
      or app_meta.try_numeric(payload->>'salary_maximum') >= 0
    )
    and (
      nullif(payload->>'salary_minimum', '') is null
      or nullif(payload->>'salary_maximum', '') is null
      or app_meta.try_numeric(payload->>'salary_minimum')
        <= app_meta.try_numeric(payload->>'salary_maximum')
    )
    and (
      nullif(payload->>'annualized_salary_minimum', '') is null
      or app_meta.try_numeric(payload->>'annualized_salary_minimum') >= 0
    )
    and (
      nullif(payload->>'annualized_salary_maximum', '') is null
      or app_meta.try_numeric(payload->>'annualized_salary_maximum') >= 0
    )
    and (
      nullif(payload->>'annualized_salary_minimum', '') is null
      or nullif(payload->>'annualized_salary_maximum', '') is null
      or app_meta.try_numeric(payload->>'annualized_salary_minimum')
        <= app_meta.try_numeric(payload->>'annualized_salary_maximum')
    )
    and (
      nullif(payload->>'salary_parse_confidence', '') is null
      or app_meta.try_numeric(payload->>'salary_parse_confidence') between 0 and 1
    )
    and (
      nullif(payload->>'company_domain_confidence', '') is null
      or app_meta.try_numeric(payload->>'company_domain_confidence') between 0 and 1
    )
    and case
      when not (payload ? 'location_facets') then true
      when jsonb_typeof(payload->'location_facets') = 'array'
        then jsonb_array_length(payload->'location_facets') <= 50
      else false
    end
    and case
      when not (payload ? 'major_ids') then true
      when jsonb_typeof(payload->'major_ids') = 'array'
        then jsonb_array_length(payload->'major_ids') <= 20
      else false
    end
    and case
      when not (payload ? 'niche_ids') then true
      when jsonb_typeof(payload->'niche_ids') = 'array'
        then jsonb_array_length(payload->'niche_ids') <= 50
      else false
    end,
    false
  );
$function$;

-- Legacy production tables are included so a clean clone reproduces the
-- pre-cutover schema as well as the canonical model. They remain available for
-- rollback, but new ingestion writes only jobs/job_sources.
create table if not exists public.internships (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null,
  location text not null default '',
  category text not null default 'other'
    check (category in (
      'software', 'cloud', 'data-ml', 'quant', 'security', 'hardware',
      'mechanical', 'electrical', 'civil', 'aerospace', 'manufacturing',
      'industrial', 'materials', 'finance', 'consulting', 'accounting',
      'operations', 'product', 'marketing', 'supply-chain', 'other'
    )),
  role_type text not null default 'internship'
    check (role_type in ('internship', 'new_grad')),
  season text,
  term_keys text[] not null default '{}',
  salary text,
  link text not null,
  source text not null,
  sponsorship text,
  posted_date date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  location_eligible boolean not null default false,
  dedupe_key text not null unique,
  company_domain text
);

alter table public.internships
  add column if not exists location_eligible boolean not null default false;
alter table public.internships
  add column if not exists term_keys text[] not null default '{}';

create table if not exists public.app_meta (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The legacy scheduler stored its URL-used credential in this exposed-schema
-- compatibility table. The reviewed deployment must provision a rotated
-- `ingest_cron_secret` in Vault first; if it does not, the new scheduler fails
-- closed and performs no request. Never copy the old value into Vault.
delete from public.app_meta where key = 'cron_secret';

create index if not exists internships_first_seen_idx
  on public.internships (first_seen_at desc);
create index if not exists internships_role_type_active_idx
  on public.internships (role_type, is_active);

create table if not exists app_meta.ingest_settings (
  singleton boolean primary key default true check (singleton),
  minimum_interval_seconds integer not null default 60
    check (minimum_interval_seconds between 0 and 3600),
  lease_seconds integer not null default 180
    check (lease_seconds between 30 and 900),
  accepted_drop_threshold numeric(5, 4) not null default 0.45
    check (accepted_drop_threshold between 0 and 1),
  rejection_rate_delta numeric(5, 4) not null default 0.25
    check (rejection_rate_delta between 0 and 1),
  maximum_rejection_rate numeric(5, 4) not null default 0.60
    check (maximum_rejection_rate between 0 and 1),
  max_posting_age_days integer not null default 120
    check (max_posting_age_days between 30 and 365),
  expected_ingest_code_version text
    check (
      expected_ingest_code_version is null
      or length(expected_ingest_code_version) between 1 and 128
    ),
  long_run_threshold_ms integer not null default 45000
    check (long_run_threshold_ms between 1000 and 600000),
  updated_at timestamptz not null default now()
);

alter table app_meta.ingest_settings
  add column if not exists expected_ingest_code_version text;
alter table app_meta.ingest_settings
  add column if not exists long_run_threshold_ms integer not null default 45000;
alter table app_meta.ingest_settings
  add column if not exists maximum_rejection_rate numeric(5, 4) not null default 0.60;

insert into app_meta.ingest_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'healthy', 'partial', 'quarantined', 'failed')),
  trigger_origin text not null default 'unknown'
    check (length(trigger_origin) between 1 and 64),
  ingest_code_version text not null
    check (length(ingest_code_version) between 1 and 128),
  parser_version text not null
    check (length(parser_version) between 1 and 128),
  snapshot_checksum text,
  raw_fetched_count integer not null default 0 check (raw_fetched_count >= 0),
  parsed_count integer not null default 0 check (parsed_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error text,
  monitoring jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists app_meta.ingest_lease (
  singleton boolean primary key default true check (singleton),
  run_id uuid not null references public.ingest_runs(id) on delete cascade,
  lease_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  tracking_key uuid not null default gen_random_uuid() unique,
  legacy_identity_key text unique,
  title text not null check (length(title) between 1 and 300),
  company text not null check (length(company) between 1 and 200),
  category text not null default 'other'
    check (category in (
      'software', 'cloud', 'data-ml', 'quant', 'security', 'hardware',
      'mechanical', 'electrical', 'civil', 'aerospace', 'manufacturing',
      'industrial', 'materials', 'finance', 'consulting', 'accounting',
      'operations', 'product', 'marketing', 'supply-chain', 'other'
    )),
  role_type text not null default 'internship'
    check (role_type in ('internship', 'new_grad')),
  primary_source text not null default 'unknown'
    check (length(primary_source) between 1 and 64),
  season text,
  term_keys text[] not null default '{}',
  sponsorship text,
  primary_apply_url text not null
    check (
      length(primary_apply_url) <= 2048
      and primary_apply_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    ),
  display_location text not null default '',
  raw_location text not null default '',
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region_code text,
  city text,
  metro_id text,
  location_type text not null default 'onsite'
    check (location_type in ('remote', 'hybrid', 'onsite')),
  normalization_confidence numeric(4, 3) not null default 0
    check (normalization_confidence between 0 and 1),
  location_facets text[] not null default '{}',
  major_ids text[] not null default array['all'],
  niche_ids text[] not null default array['all'],
  search_text text not null default '',
  search_vector tsvector generated always as
    (to_tsvector('simple', coalesce(search_text, ''))) stored,
  posted_date date check (posted_date is null or posted_date <= current_date + 7),
  sort_date date not null default current_date,
  salary_raw text,
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  salary_minimum numeric check (salary_minimum is null or salary_minimum >= 0),
  salary_maximum numeric check (salary_maximum is null or salary_maximum >= 0),
  check (salary_minimum is null or salary_maximum is null or salary_minimum <= salary_maximum),
  salary_cadence text
    check (salary_cadence is null or salary_cadence in ('hourly', 'monthly', 'annual')),
  annualized_salary_minimum numeric
    check (annualized_salary_minimum is null or annualized_salary_minimum >= 0),
  annualized_salary_maximum numeric
    check (annualized_salary_maximum is null or annualized_salary_maximum >= 0),
  check (
    annualized_salary_minimum is null
    or annualized_salary_maximum is null
    or annualized_salary_minimum <= annualized_salary_maximum
  ),
  salary_parse_confidence numeric(4, 3)
    check (salary_parse_confidence is null or salary_parse_confidence between 0 and 1),
  salary_provenance text
    check (salary_provenance is null or salary_provenance in ('source-listed', 'category-estimate')),
  source_salary_sort_max numeric
    check (source_salary_sort_max is null or source_salary_sort_max >= 0),
  company_domain text,
  company_domain_confidence numeric(4, 3)
    check (company_domain_confidence is null or company_domain_confidence between 0 and 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A partially applied preview of this baseline may already have `jobs`.
-- Keep the upgrade path additive rather than relying on CREATE IF NOT EXISTS.
alter table public.jobs
  add column if not exists primary_source text not null default 'unknown';
alter table public.jobs
  add column if not exists term_keys text[] not null default '{}';

create table if not exists public.job_sources (
  id bigint generated by default as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  source text not null check (length(source) between 1 and 64),
  external_id text not null check (length(external_id) between 1 and 512),
  source_url text check (
    source_url is null or (
      length(source_url) <= 2048
      and source_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    )
  ),
  apply_url text not null check (
    length(apply_url) <= 2048
    and apply_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  ),
  fuzzy_key text,
  raw_title text not null,
  raw_location text not null default '',
  season text,
  term_keys text[] not null default '{}',
  requisition_id text,
  posted_date date check (posted_date is null or posted_date <= current_date + 7),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region_code text,
  city text,
  metro_id text,
  location_type text not null default 'onsite'
    check (location_type in ('remote', 'hybrid', 'onsite')),
  normalization_confidence numeric(4, 3) not null default 0
    check (normalization_confidence between 0 and 1),
  salary_raw text,
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  salary_minimum numeric check (salary_minimum is null or salary_minimum >= 0),
  salary_maximum numeric check (salary_maximum is null or salary_maximum >= 0),
  check (salary_minimum is null or salary_maximum is null or salary_minimum <= salary_maximum),
  salary_cadence text
    check (salary_cadence is null or salary_cadence in ('hourly', 'monthly', 'annual')),
  annualized_salary_minimum numeric
    check (annualized_salary_minimum is null or annualized_salary_minimum >= 0),
  annualized_salary_maximum numeric
    check (annualized_salary_maximum is null or annualized_salary_maximum >= 0),
  check (
    annualized_salary_minimum is null
    or annualized_salary_maximum is null
    or annualized_salary_minimum <= annualized_salary_maximum
  ),
  salary_parse_confidence numeric(4, 3)
    check (salary_parse_confidence is null or salary_parse_confidence between 0 and 1),
  salary_provenance text
    check (salary_provenance is null or salary_provenance = 'source-listed'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  active boolean not null default true,
  healthy_miss_count smallint not null default 0
    check (healthy_miss_count between 0 and 2),
  last_seen_run_id uuid references public.ingest_runs(id) on delete set null,
  parser_version text not null
    check (length(parser_version) between 1 and 128),
  snapshot_checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

alter table public.job_sources alter column salary_provenance drop not null;
alter table public.job_sources alter column salary_provenance drop default;
alter table public.job_sources
  add column if not exists term_keys text[] not null default '{}';

create table if not exists public.ingest_source_runs (
  id bigint generated by default as identity primary key,
  run_id uuid references public.ingest_runs(id) on delete cascade,
  source text not null,
  succeeded boolean not null,
  complete_snapshot boolean not null default false,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  raw_fetched_count integer not null default 0 check (raw_fetched_count >= 0),
  parsed_count integer not null default 0 check (parsed_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  schema_valid boolean not null default false,
  expected_markers_present boolean not null default false,
  quarantined boolean not null default false,
  quarantine_reason text,
  previous_healthy_count integer check (previous_healthy_count is null or previous_healthy_count >= 0),
  rejection_rate numeric(6, 5) not null default 0 check (rejection_rate between 0 and 1),
  snapshot_checksum text,
  parser_version text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error text,
  ran_at timestamptz not null default now()
);

-- Upgrade the production audit table in place when it predates this baseline.
alter table public.ingest_source_runs add column if not exists run_id uuid;
alter table public.ingest_source_runs add column if not exists raw_fetched_count integer not null default 0;
alter table public.ingest_source_runs add column if not exists parsed_count integer not null default 0;
alter table public.ingest_source_runs add column if not exists rejected_count integer not null default 0;
alter table public.ingest_source_runs add column if not exists schema_valid boolean not null default false;
alter table public.ingest_source_runs add column if not exists expected_markers_present boolean not null default false;
alter table public.ingest_source_runs add column if not exists quarantined boolean not null default false;
alter table public.ingest_source_runs add column if not exists quarantine_reason text;
alter table public.ingest_source_runs add column if not exists previous_healthy_count integer;
alter table public.ingest_source_runs add column if not exists rejection_rate numeric(6, 5) not null default 0;
alter table public.ingest_source_runs add column if not exists snapshot_checksum text;
alter table public.ingest_source_runs add column if not exists parser_version text;
alter table public.ingest_source_runs add column if not exists duration_ms integer;

do $upgrade_ingest_source_runs$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.ingest_source_runs'::regclass
      and conname = 'ingest_source_runs_run_id_fkey'
  ) then
    alter table public.ingest_source_runs
      add constraint ingest_source_runs_run_id_fkey
      foreign key (run_id) references public.ingest_runs(id) on delete cascade
      not valid;
  end if;
end;
$upgrade_ingest_source_runs$;

create table if not exists public.job_match_candidates (
  id bigint generated by default as identity primary key,
  left_job_id uuid not null references public.jobs(id) on delete cascade,
  right_job_id uuid not null references public.jobs(id) on delete cascade,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (left_job_id <> right_job_id),
  unique (left_job_id, right_job_id)
);

create table if not exists public.job_changes (
  id bigint generated by default as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  run_id uuid references public.ingest_runs(id) on delete set null,
  changed_fields text[] not null
    check (cardinality(changed_fields) between 1 and 6),
  previous_values jsonb not null default '{}'::jsonb,
  current_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.job_changes
  drop constraint if exists job_changes_changed_fields_check;
alter table public.job_changes
  add constraint job_changes_changed_fields_check
  check (cardinality(changed_fields) between 1 and 7);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('closed', 'duplicate', 'wrong_location', 'wrong_pay', 'wrong_logo')),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists app_meta.job_url_aliases (
  url_hash text primary key check (url_hash ~ '^[a-f0-9]{64}$'),
  job_id uuid not null references public.jobs(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Transactional work tables are permanent private relations so schema linting
-- can validate every SQL statement. Rows are keyed by run and deleted before
-- return; a failed transaction rolls them back automatically.
create table if not exists app_meta.ingest_healthy_sources (
  run_id uuid not null references public.ingest_runs(id) on delete cascade,
  source text not null,
  parser_version text not null,
  snapshot_checksum text not null,
  primary key (run_id, source)
);

create table if not exists app_meta.ingest_touched_jobs (
  run_id uuid not null references public.ingest_runs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  primary key (run_id, job_id)
);

create table if not exists app_meta.ingest_previous_jobs (
  run_id uuid not null references public.ingest_runs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  primary_apply_url text not null,
  title text not null,
  company text not null,
  display_location text not null,
  posted_date date,
  term_keys text[] not null default '{}',
  salary jsonb not null,
  primary key (run_id, job_id)
);

alter table app_meta.ingest_previous_jobs
  add column if not exists term_keys text[] not null default '{}';

create or replace function app_meta.build_ingest_monitoring(
  target_run_id uuid,
  run_duration_ms integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with configuration as (
    select
      settings.expected_ingest_code_version,
      settings.long_run_threshold_ms
    from app_meta.ingest_settings as settings
    where settings.singleton
  ),
  target_run as (
    select run.ingest_code_version
    from public.ingest_runs as run
    where run.id = target_run_id
  ),
  current_sources as (
    select source_run.*
    from public.ingest_source_runs as source_run
    where source_run.run_id = target_run_id
  )
  select jsonb_build_object(
    'healthy_sources', (
      select count(*)
      from current_sources as source_run
      where source_run.succeeded and not source_run.quarantined
    ),
    'quarantined_sources', (
      select count(*)
      from current_sources as source_run
      where source_run.quarantined
    ),
    'stale_code_version', (
      configuration.expected_ingest_code_version is not null
      and target_run.ingest_code_version
        is distinct from configuration.expected_ingest_code_version
    ),
    'long_duration', (
      greatest(coalesce(run_duration_ms, 0), 0)
        >= configuration.long_run_threshold_ms
    ),
    'zero_accepted_sources', coalesce((
      select jsonb_agg(source_run.source order by source_run.source)
      from current_sources as source_run
      where source_run.accepted_count = 0
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source', source_run.source,
          'reason', source_run.quarantine_reason
        )
        order by source_run.source
      )
      from current_sources as source_run
      where source_run.quarantine_reason in (
        'invalid_source_result',
        'zero_accepted',
        'accepted_payload_mismatch',
        'accepted_count_drop',
        'rejection_rate_high',
        'rejection_rate_change'
      )
    ), '[]'::jsonb),
    'repeated_unhealthy_sources', coalesce((
      select jsonb_agg(repeated.source order by repeated.source)
      from (
        select distinct current.source
        from current_sources as current
        where (
          select count(*) = 3 and bool_and(recent.unhealthy)
          from (
            select (not historical.succeeded or historical.quarantined) as unhealthy
            from public.ingest_source_runs as historical
            where historical.source = current.source
            order by historical.ran_at desc, historical.id desc
            limit 3
          ) as recent
        )
      ) as repeated
    ), '[]'::jsonb)
  )
  from configuration
  cross join target_run;
$function$;

create index if not exists jobs_active_role_cursor_idx
  on public.jobs (role_type, first_seen_at desc, id desc)
  where is_active;
create index if not exists jobs_active_sort_date_idx
  on public.jobs (role_type, sort_date desc, id desc)
  where is_active;
create index if not exists jobs_active_salary_idx
  on public.jobs (
    role_type,
    source_salary_sort_max desc nulls last,
    first_seen_at desc,
    id desc
  )
  where is_active;
create index if not exists jobs_active_company_cursor_idx
  on public.jobs (role_type, lower(company), first_seen_at desc, id desc)
  where is_active;
create index if not exists jobs_active_location_cursor_idx
  on public.jobs (role_type, lower(display_location), first_seen_at desc, id desc)
  where is_active;
create index if not exists jobs_active_featured_cursor_idx
  on public.jobs (
    role_type,
    (case when category in ('software', 'cloud') then 0 else 1 end),
    first_seen_at desc,
    id desc
  )
  where is_active;
create index if not exists jobs_search_vector_idx on public.jobs using gin (search_vector);
create index if not exists jobs_location_facets_idx on public.jobs using gin (location_facets);
create index if not exists jobs_major_ids_idx on public.jobs using gin (major_ids);
create index if not exists jobs_niche_ids_idx on public.jobs using gin (niche_ids);
create index if not exists job_sources_job_id_idx on public.job_sources (job_id);
create index if not exists job_sources_active_source_idx on public.job_sources (source, active, last_seen_run_id);
create index if not exists job_sources_apply_url_idx on public.job_sources (apply_url);
create index if not exists job_sources_fuzzy_key_idx on public.job_sources (fuzzy_key) where fuzzy_key is not null;
create index if not exists ingest_runs_started_at_idx on public.ingest_runs (started_at desc);
create index if not exists ingest_source_runs_source_ran_at_idx
  on public.ingest_source_runs (source, ran_at desc);
do $ingest_source_run_unique$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.ingest_source_runs'::regclass
      and conname = 'ingest_source_runs_run_source_unique'
  ) then
    create unique index if not exists ingest_source_runs_run_source_unique
      on public.ingest_source_runs (run_id, source);
    alter table public.ingest_source_runs
      add constraint ingest_source_runs_run_source_unique
      unique using index ingest_source_runs_run_source_unique;
  end if;
end;
$ingest_source_run_unique$;
create index if not exists job_match_candidates_status_idx
  on public.job_match_candidates (status, confidence desc);
create index if not exists job_changes_job_created_idx on public.job_changes (job_id, created_at desc);
create unique index if not exists job_changes_job_run_key
  on public.job_changes (job_id, run_id)
  where run_id is not null;
create index if not exists job_reports_status_created_idx on public.job_reports (status, created_at desc);
create index if not exists job_url_aliases_job_id_idx on app_meta.job_url_aliases (job_id);

create or replace function public.protect_tracking_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.tracking_key is distinct from old.tracking_key then
    raise exception 'tracking_key is immutable';
  end if;
  return new;
end;
$function$;

drop trigger if exists jobs_tracking_key_immutable on public.jobs;
create trigger jobs_tracking_key_immutable
before update of tracking_key on public.jobs
for each row execute function public.protect_tracking_key();

-- Compare fixed-size digests without an early-exit mismatch branch.
create or replace function app_meta.fixed_digest_equal(
  provided_digest bytea,
  expected_digest bytea
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $function$
declare
  difference integer := 0;
  position integer;
begin
  if length(provided_digest) <> 32 or length(expected_digest) <> 32 then
    return false;
  end if;

  for position in 0..31 loop
    difference := difference
      | (get_byte(provided_digest, position) # get_byte(expected_digest, position));
  end loop;
  return difference = 0;
end;
$function$;

-- The scheduler credential has a single source of truth in Vault. The Edge
-- Function hashes the presented Bearer value and its service-role client calls
-- this private verifier; plaintext never needs to be copied into Edge settings
-- or forwarded to PostgREST.
create or replace function app_meta.ingest_bearer_digest_matches(
  provided_digest text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  expected_digest bytea;
begin
  if provided_digest is null
    or provided_digest !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select extensions.digest(
    pg_catalog.convert_to(secret.decrypted_secret, 'UTF8'),
    'sha256'
  )
  into strict expected_digest
  from vault.decrypted_secrets as secret
  where secret.name = 'ingest_cron_secret';

  return coalesce(
    app_meta.fixed_digest_equal(
      decode(provided_digest, 'hex'),
      expected_digest
    ),
    false
  );
exception
  when no_data_found or too_many_rows then
    return false;
end;
$function$;

-- Keep the Data API surface SECURITY INVOKER. Only service_role receives both
-- this wrapper and the private verifier it invokes.
create or replace function public.authorize_ingest_request(
  provided_digest text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select app_meta.ingest_bearer_digest_matches(provided_digest);
$function$;

create or replace function public.begin_ingest_run(
  trigger_origin text,
  ingest_code_version text,
  parser_version text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  new_run_id uuid := gen_random_uuid();
  acquired_run_id uuid;
  minimum_interval integer;
  lease_duration integer;
  most_recent timestamptz;
begin
  if nullif(btrim(ingest_code_version), '') is null
    or nullif(btrim(parser_version), '') is null then
    raise exception 'ingest versions are required';
  end if;

  select settings.minimum_interval_seconds, settings.lease_seconds
  into minimum_interval, lease_duration
  from app_meta.ingest_settings as settings
  where settings.singleton;

  if minimum_interval is null or lease_duration is null then
    raise exception 'ingest settings are not configured';
  end if;

  select max(run.started_at)
  into most_recent
  from public.ingest_runs as run
  where run.status <> 'running';

  if most_recent is not null
    and most_recent > now() - make_interval(secs => minimum_interval) then
    raise exception 'ingest rate limited';
  end if;

  insert into public.ingest_runs (
    id, status, trigger_origin, ingest_code_version, parser_version
  ) values (
    new_run_id,
    'running',
    left(coalesce(nullif(btrim(trigger_origin), ''), 'unknown'), 64),
    left(btrim(ingest_code_version), 128),
    left(btrim(parser_version), 128)
  );

  insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
  values (true, new_run_id, now() + make_interval(secs => lease_duration))
  on conflict (singleton) do update
  set run_id = excluded.run_id,
      lease_expires_at = excluded.lease_expires_at,
      updated_at = now()
  where app_meta.ingest_lease.lease_expires_at <= now()
  returning run_id into acquired_run_id;

  if acquired_run_id is distinct from new_run_id then
    raise exception 'ingest already running';
  end if;

  return new_run_id;
end;
$function$;

create or replace function public.apply_ingest_snapshot(
  run_id uuid,
  jobs_payload jsonb,
  source_results jsonb,
  snapshot_checksum text,
  duration_ms integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  source_result jsonb;
  job_payload jsonb;
  source_name text;
  external_key text;
  selected_job_id uuid;
  candidate_job_id uuid;
  is_new boolean;
  previous_count integer;
  previous_rejection numeric;
  rejection numeric;
  quarantine text;
  source_succeeded boolean;
  source_complete boolean;
  source_schema_valid boolean;
  source_markers_present boolean;
  source_raw_count integer;
  source_parsed_count integer;
  source_accepted_count integer;
  source_rejected_count integer;
  source_duration_ms integer;
  payload_count integer;
  payloads_valid boolean;
  invalid_source_result boolean;
  drop_threshold numeric;
  rejection_delta numeric;
  maximum_rejection numeric;
  max_age integer;
  inserted_total integer := 0;
  updated_total integer := 0;
  deactivated_total integer := 0;
  healthy_total integer := 0;
  quarantined_total integer := 0;
  raw_total integer := 0;
  parsed_total integer := 0;
  accepted_total integer := 0;
  rejected_total integer := 0;
begin
  if jsonb_typeof(jobs_payload) is distinct from 'array'
    or jsonb_typeof(source_results) is distinct from 'array' then
    raise exception 'jobs_payload and source_results must be arrays';
  end if;

  if coalesce(snapshot_checksum, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'snapshot_checksum must be a lowercase SHA-256 digest';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(source_results) as element(value)
    where jsonb_typeof(element.value) is distinct from 'object'
      or nullif(btrim(element.value->>'source'), '') is null
      or length(btrim(element.value->>'source')) > 64
  ) then
    raise exception 'every source result requires a valid source identifier';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(source_results) as element(value)
    group by btrim(element.value->>'source')
    having count(*) > 1
  ) then
    raise exception 'duplicate source results are not allowed';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('timley:apply-ingest-snapshot')) then
    raise exception 'ingest snapshot application is locked';
  end if;

  if not exists (
    select 1
    from app_meta.ingest_lease as lease
    where lease.singleton and lease.run_id = apply_ingest_snapshot.run_id
      and lease.lease_expires_at > now()
  ) then
    raise exception 'ingest lease is missing or expired';
  end if;

  select settings.accepted_drop_threshold,
         settings.rejection_rate_delta,
         settings.maximum_rejection_rate,
         settings.max_posting_age_days
  into drop_threshold, rejection_delta, maximum_rejection, max_age
  from app_meta.ingest_settings as settings
  where settings.singleton;

  if drop_threshold is null
    or rejection_delta is null
    or maximum_rejection is null
    or max_age is null
  then
    raise exception 'ingest settings are not configured';
  end if;

  delete from app_meta.ingest_previous_jobs as previous
  where previous.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_touched_jobs as touched
  where touched.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_healthy_sources as healthy
  where healthy.run_id = apply_ingest_snapshot.run_id;

  for source_result in select value from jsonb_array_elements(source_results)
  loop
    source_name := btrim(source_result->>'source');
    source_succeeded := app_meta.try_boolean(source_result->>'succeeded');
    source_complete := app_meta.try_boolean(source_result->>'complete_snapshot');
    source_schema_valid := app_meta.try_boolean(source_result->>'schema_valid');
    source_markers_present := app_meta.try_boolean(source_result->>'markers_present');
    source_raw_count := app_meta.try_integer(source_result->>'raw_fetched');
    source_parsed_count := app_meta.try_integer(source_result->>'parsed');
    source_accepted_count := app_meta.try_integer(source_result->>'accepted');
    source_rejected_count := app_meta.try_integer(source_result->>'rejected');
    source_duration_ms := app_meta.try_integer(source_result->>'duration_ms');

    invalid_source_result := source_succeeded is null
      or (source_result ? 'complete_snapshot' and source_complete is null)
      or source_schema_valid is null
      or source_markers_present is null
      or source_raw_count is null
      or source_parsed_count is null
      or source_accepted_count is null
      or source_rejected_count is null
      or source_raw_count < 0
      or source_parsed_count < 0
      or source_accepted_count < 0
      or source_rejected_count < 0
      or source_accepted_count > source_parsed_count
      or source_rejected_count > source_raw_count
      or source_parsed_count > source_raw_count
      or (source_duration_ms is not null and source_duration_ms < 0)
      or (
        coalesce(source_succeeded, false)
        and (
          nullif(btrim(source_result->>'parser_version'), '') is null
          or length(btrim(source_result->>'parser_version')) > 128
        )
      )
      or (
        coalesce(source_succeeded, false)
        and coalesce(source_result->>'snapshot_checksum', '') !~ '^[a-f0-9]{64}$'
      );

    source_raw_count := greatest(coalesce(source_raw_count, 0), 0);
    source_parsed_count := greatest(coalesce(source_parsed_count, 0), 0);
    source_accepted_count := greatest(coalesce(source_accepted_count, 0), 0);
    source_rejected_count := greatest(coalesce(source_rejected_count, 0), 0);
    source_duration_ms := greatest(coalesce(source_duration_ms, 0), 0);

    select count(*)::integer,
           coalesce(bool_and(app_meta.ingest_job_payload_is_valid(element.value)), false)
    into payload_count, payloads_valid
    from jsonb_array_elements(jobs_payload) as element(value)
    where element.value->>'source' = source_name;

    select previous.accepted_count, previous.rejection_rate
    into previous_count, previous_rejection
    from public.ingest_source_runs as previous
    where previous.source = source_name
      and previous.succeeded
      and not previous.quarantined
      and previous.accepted_count > 0
    order by previous.ran_at desc
    limit 1;

    rejection := case
      when source_parsed_count = 0 then 0
      else least(
        1,
        greatest(
          0,
          source_rejected_count::numeric
          / greatest(source_parsed_count::numeric, 1)
        )
      )
    end;

    quarantine := null;
    if invalid_source_result then
      quarantine := 'invalid_source_result';
    elsif not source_succeeded then
      quarantine := 'source_failed';
    elsif not coalesce(source_complete, false) then
      quarantine := 'partial_snapshot';
    elsif source_accepted_count = 0 then
      quarantine := 'zero_accepted';
    elsif not source_schema_valid then
      quarantine := 'schema_invalid';
    elsif not source_markers_present then
      quarantine := 'expected_markers_missing';
    elsif rejection > maximum_rejection then
      quarantine := 'rejection_rate_high';
    elsif payload_count <> source_accepted_count then
      quarantine := 'accepted_payload_mismatch';
    elsif not payloads_valid then
      quarantine := 'invalid_payload';
    elsif previous_count is not null
      and source_accepted_count < floor(previous_count * (1 - drop_threshold)) then
      quarantine := 'accepted_count_drop';
    elsif previous_rejection is not null
      and abs(rejection - previous_rejection) > rejection_delta then
      quarantine := 'rejection_rate_change';
    end if;

    insert into public.ingest_source_runs (
      run_id, source, succeeded, complete_snapshot, fetched_count,
      raw_fetched_count, parsed_count, accepted_count, rejected_count,
      schema_valid, expected_markers_present, quarantined,
      quarantine_reason, previous_healthy_count, rejection_rate,
      snapshot_checksum, parser_version, duration_ms, error, ran_at
    ) values (
      apply_ingest_snapshot.run_id,
      source_name,
      coalesce(source_succeeded, false),
      quarantine is null,
      source_raw_count,
      source_raw_count,
      source_parsed_count,
      source_accepted_count,
      source_rejected_count,
      coalesce(source_schema_valid, false),
      coalesce(source_markers_present, false),
      quarantine is not null,
      quarantine,
      previous_count,
      rejection,
      source_result->>'snapshot_checksum',
      source_result->>'parser_version',
      source_duration_ms,
      left(nullif(source_result->>'error', ''), 4000),
      now()
    )
    on conflict on constraint ingest_source_runs_run_source_unique do update set
      succeeded = excluded.succeeded,
      complete_snapshot = excluded.complete_snapshot,
      fetched_count = excluded.fetched_count,
      raw_fetched_count = excluded.raw_fetched_count,
      parsed_count = excluded.parsed_count,
      accepted_count = excluded.accepted_count,
      rejected_count = excluded.rejected_count,
      schema_valid = excluded.schema_valid,
      expected_markers_present = excluded.expected_markers_present,
      quarantined = excluded.quarantined,
      quarantine_reason = excluded.quarantine_reason,
      previous_healthy_count = excluded.previous_healthy_count,
      rejection_rate = excluded.rejection_rate,
      snapshot_checksum = excluded.snapshot_checksum,
      parser_version = excluded.parser_version,
      duration_ms = excluded.duration_ms,
      error = excluded.error,
      ran_at = excluded.ran_at;

    raw_total := raw_total + source_raw_count;
    parsed_total := parsed_total + source_parsed_count;
    accepted_total := accepted_total + source_accepted_count;
    rejected_total := rejected_total + source_rejected_count;

    if quarantine is null then
      insert into app_meta.ingest_healthy_sources (
        run_id, source, parser_version, snapshot_checksum
      ) values (
        apply_ingest_snapshot.run_id,
        source_name,
        btrim(source_result->>'parser_version'),
        source_result->>'snapshot_checksum'
      )
      on conflict do nothing;
      healthy_total := healthy_total + 1;
    else
      quarantined_total := quarantined_total + 1;
    end if;
  end loop;

  if healthy_total = 0 then
    update public.ingest_runs as run
    set status = 'quarantined',
        snapshot_checksum = apply_ingest_snapshot.snapshot_checksum,
        raw_fetched_count = raw_total,
        parsed_count = parsed_total,
        accepted_count = accepted_total,
        rejected_count = rejected_total,
        duration_ms = greatest(coalesce(apply_ingest_snapshot.duration_ms, 0), 0),
        monitoring = app_meta.build_ingest_monitoring(
          apply_ingest_snapshot.run_id,
          greatest(coalesce(apply_ingest_snapshot.duration_ms, 0), 0)
        ),
        finished_at = now()
    where run.id = apply_ingest_snapshot.run_id;

    delete from app_meta.ingest_lease as lease
    where lease.singleton and lease.run_id = apply_ingest_snapshot.run_id;

    delete from app_meta.ingest_healthy_sources as healthy
    where healthy.run_id = apply_ingest_snapshot.run_id;

    return jsonb_build_object(
      'inserted', 0, 'updated', 0, 'deactivated', 0,
      'healthy_sources', 0, 'quarantined_sources', quarantined_total
    );
  end if;

  for job_payload in
    select element.value || jsonb_build_object(
      'parser_version', healthy.parser_version,
      'snapshot_checksum', healthy.snapshot_checksum
    )
    from jsonb_array_elements(jobs_payload) as element(value)
    join app_meta.ingest_healthy_sources as healthy
      on healthy.run_id = apply_ingest_snapshot.run_id
      and healthy.source = element.value->>'source'
  loop
    source_name := job_payload->>'source';
    external_key := coalesce(
      nullif(job_payload->>'external_id', ''),
      encode(
        extensions.digest(
          source_name || '|' || coalesce(job_payload->>'link', ''),
          'sha256'
        ),
        'hex'
      )
    );
    selected_job_id := null;
    is_new := false;

    select observation.job_id
    into selected_job_id
    from public.job_sources as observation
    where observation.source = source_name
      and observation.external_id = external_key;

    if selected_job_id is null then
      select observation.job_id
      into selected_job_id
      from public.job_sources as observation
      where observation.apply_url = job_payload->>'link'
      order by observation.last_seen_at desc
      limit 1;
    end if;

    if selected_job_id is null then
      insert into public.jobs (
        title, company, category, role_type, primary_source, season, term_keys, sponsorship,
        primary_apply_url, display_location, raw_location,
        country_code, region_code, city, metro_id, location_type,
        normalization_confidence, location_facets, search_text,
        major_ids, niche_ids,
        posted_date, sort_date, salary_raw, salary_currency,
        salary_minimum, salary_maximum, salary_cadence,
        annualized_salary_minimum, annualized_salary_maximum,
        salary_parse_confidence, salary_provenance, source_salary_sort_max,
        company_domain, company_domain_confidence,
        first_seen_at, last_seen_at, last_checked_at, is_active
      ) values (
        left(job_payload->>'title', 300),
        left(job_payload->>'company', 200),
        coalesce(nullif(job_payload->>'category', ''), 'other'),
        coalesce(nullif(job_payload->>'role_type', ''), 'internship'),
        source_name,
        nullif(job_payload->>'season', ''),
        coalesce(
          array(select jsonb_array_elements_text(job_payload->'term_keys')),
          '{}'::text[]
        ),
        nullif(job_payload->>'sponsorship', ''),
        job_payload->>'link',
        coalesce(job_payload->>'location', ''),
        coalesce(job_payload->>'raw_location', job_payload->>'location', ''),
        nullif(job_payload->>'country_code', ''),
        nullif(job_payload->>'region_code', ''),
        nullif(job_payload->>'city', ''),
        nullif(job_payload->>'metro_id', ''),
        coalesce(nullif(job_payload->>'location_type', ''), 'onsite'),
        coalesce(app_meta.try_numeric(job_payload->>'normalization_confidence'), 0),
        coalesce(
          array(select jsonb_array_elements_text(job_payload->'location_facets')),
          '{}'::text[]
        ),
        coalesce(job_payload->>'search_text', concat_ws(' ', job_payload->>'title', job_payload->>'company', job_payload->>'location')),
        case
          when jsonb_typeof(job_payload->'major_ids') = 'array'
          then array(select jsonb_array_elements_text(job_payload->'major_ids'))
          else array['all']
        end,
        case
          when jsonb_typeof(job_payload->'niche_ids') = 'array'
          then array(select jsonb_array_elements_text(job_payload->'niche_ids'))
          else array['all']
        end,
        app_meta.try_date(nullif(job_payload->>'posted_date', '')),
        coalesce(app_meta.try_date(nullif(job_payload->>'posted_date', '')), current_date),
        nullif(job_payload->>'salary_raw', ''),
        nullif(job_payload->>'salary_currency', ''),
        app_meta.try_numeric(nullif(job_payload->>'salary_minimum', '')),
        app_meta.try_numeric(nullif(job_payload->>'salary_maximum', '')),
        nullif(job_payload->>'salary_cadence', ''),
        app_meta.try_numeric(nullif(job_payload->>'annualized_salary_minimum', '')),
        app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', '')),
        app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
        case
          when nullif(job_payload->>'salary_raw', '') is null then null
          else 'source-listed'
        end,
        case
          when coalesce(app_meta.try_numeric(job_payload->>'salary_parse_confidence'), 0) >= 0.8
            and coalesce(job_payload->>'salary_currency', 'USD') = 'USD'
          then app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', ''))
          else null
        end,
        nullif(job_payload->>'company_domain', ''),
        app_meta.try_numeric(nullif(job_payload->>'company_domain_confidence', '')),
        now(), now(), now(), true
      ) returning id into selected_job_id;
      inserted_total := inserted_total + 1;
      is_new := true;
    else
      insert into app_meta.ingest_previous_jobs (
        run_id, job_id, primary_apply_url, title, company, display_location,
        posted_date, term_keys, salary
      )
      select
        apply_ingest_snapshot.run_id,
        job.id,
        job.primary_apply_url,
        job.title,
        job.company,
        job.display_location,
        job.posted_date,
        job.term_keys,
        jsonb_build_object(
          'raw', job.salary_raw,
          'currency', job.salary_currency,
          'minimum', job.salary_minimum,
          'maximum', job.salary_maximum,
          'cadence', job.salary_cadence,
          'annualized_minimum', job.annualized_salary_minimum,
          'annualized_maximum', job.annualized_salary_maximum,
          'parse_confidence', job.salary_parse_confidence,
          'provenance', job.salary_provenance
        )
      from public.jobs as job
      where job.id = selected_job_id
      on conflict on constraint ingest_previous_jobs_pkey do nothing;

      update public.jobs as job
      set title = left(job_payload->>'title', 300),
          company = left(job_payload->>'company', 200),
          category = coalesce(nullif(job_payload->>'category', ''), job.category),
          role_type = coalesce(nullif(job_payload->>'role_type', ''), job.role_type),
          primary_source = source_name,
          season = coalesce(nullif(job_payload->>'season', ''), job.season),
          term_keys = coalesce(
            array(select jsonb_array_elements_text(job_payload->'term_keys')),
            '{}'::text[]
          ),
          sponsorship = coalesce(nullif(job_payload->>'sponsorship', ''), job.sponsorship),
          primary_apply_url = job_payload->>'link',
          -- Structured location is one atomic tuple from the selected source;
          -- never retain stale city/region fields from a previous observation.
          display_location = job_payload->>'location',
          raw_location = coalesce(job_payload->>'raw_location', job_payload->>'location'),
          country_code = nullif(job_payload->>'country_code', ''),
          region_code = nullif(job_payload->>'region_code', ''),
          city = nullif(job_payload->>'city', ''),
          metro_id = nullif(job_payload->>'metro_id', ''),
          location_type = coalesce(nullif(job_payload->>'location_type', ''), 'onsite'),
          normalization_confidence = coalesce(
            app_meta.try_numeric(job_payload->>'normalization_confidence'),
            0
          ),
          location_facets = case
            when jsonb_typeof(job_payload->'location_facets') = 'array'
            then array(select jsonb_array_elements_text(job_payload->'location_facets'))
            else '{}'::text[]
          end,
          search_text = coalesce(
            nullif(job_payload->>'search_text', ''),
            concat_ws(' ', job_payload->>'title', job_payload->>'company', job_payload->>'location')
          ),
          major_ids = case
            when jsonb_typeof(job_payload->'major_ids') = 'array'
            then array(select jsonb_array_elements_text(job_payload->'major_ids'))
            else job.major_ids
          end,
          niche_ids = case
            when jsonb_typeof(job_payload->'niche_ids') = 'array'
            then array(select jsonb_array_elements_text(job_payload->'niche_ids'))
            else job.niche_ids
          end,
          posted_date = case
            when nullif(job_payload->>'posted_date', '') is null then job.posted_date
            else greatest(
              job.posted_date,
              app_meta.try_date(job_payload->>'posted_date')
            )
          end,
          sort_date = case
            when nullif(job_payload->>'posted_date', '') is null then job.sort_date
            else greatest(
              job.sort_date,
              app_meta.try_date(job_payload->>'posted_date')
            )
          end,
          salary_raw = coalesce(nullif(job_payload->>'salary_raw', ''), job.salary_raw),
          salary_currency = coalesce(nullif(job_payload->>'salary_currency', ''), job.salary_currency),
          salary_minimum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'salary_minimum', '')),
            job.salary_minimum
          ),
          salary_maximum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'salary_maximum', '')),
            job.salary_maximum
          ),
          salary_cadence = coalesce(nullif(job_payload->>'salary_cadence', ''), job.salary_cadence),
          annualized_salary_minimum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'annualized_salary_minimum', '')),
            job.annualized_salary_minimum
          ),
          annualized_salary_maximum = coalesce(
            app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', '')),
            job.annualized_salary_maximum
          ),
          salary_parse_confidence = greatest(
            coalesce(job.salary_parse_confidence, 0),
            coalesce(
              app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
              0
            )
          ),
          salary_provenance = case
            when nullif(job_payload->>'salary_raw', '') is null then job.salary_provenance
            else 'source-listed'
          end,
          source_salary_sort_max = case
            when coalesce(
              app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
              0
            ) >= 0.8
              and coalesce(job_payload->>'salary_currency', 'USD') = 'USD'
            then greatest(
              job.source_salary_sort_max,
              app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', ''))
            )
            else job.source_salary_sort_max
          end,
          company_domain = case
            when coalesce(
              app_meta.try_numeric(nullif(job_payload->>'company_domain_confidence', '')),
              0
            ) >= 0.8
            then nullif(job_payload->>'company_domain', '')
            else job.company_domain
          end,
          company_domain_confidence = greatest(
            coalesce(job.company_domain_confidence, 0),
            coalesce(
              app_meta.try_numeric(nullif(job_payload->>'company_domain_confidence', '')),
              0
            )
          ),
          last_seen_at = now(),
          last_checked_at = now(),
          is_active = true,
          updated_at = now()
      where job.id = selected_job_id;
      updated_total := updated_total + 1;
    end if;

    insert into public.job_sources (
      job_id, source, external_id, source_url, apply_url, fuzzy_key,
      raw_title, raw_location, season, term_keys, requisition_id, posted_date,
      country_code, region_code, city, metro_id, location_type,
      normalization_confidence, salary_raw, salary_currency,
      salary_minimum, salary_maximum, salary_cadence,
      annualized_salary_minimum, annualized_salary_maximum,
      salary_parse_confidence, salary_provenance,
      first_seen_at, last_seen_at, last_checked_at, active,
      healthy_miss_count, last_seen_run_id, parser_version,
      snapshot_checksum, updated_at
    ) values (
      selected_job_id,
      source_name,
      external_key,
      nullif(job_payload->>'source_url', ''),
      job_payload->>'link',
      nullif(job_payload->>'dedupe_key', ''),
      job_payload->>'title',
      coalesce(job_payload->>'raw_location', job_payload->>'location', ''),
      nullif(job_payload->>'season', ''),
      coalesce(
        array(select jsonb_array_elements_text(job_payload->'term_keys')),
        '{}'::text[]
      ),
      nullif(job_payload->>'requisition_id', ''),
      app_meta.try_date(nullif(job_payload->>'posted_date', '')),
      nullif(job_payload->>'country_code', ''),
      nullif(job_payload->>'region_code', ''),
      nullif(job_payload->>'city', ''),
      nullif(job_payload->>'metro_id', ''),
      coalesce(nullif(job_payload->>'location_type', ''), 'onsite'),
      coalesce(app_meta.try_numeric(job_payload->>'normalization_confidence'), 0),
      nullif(job_payload->>'salary_raw', ''),
      nullif(job_payload->>'salary_currency', ''),
      app_meta.try_numeric(nullif(job_payload->>'salary_minimum', '')),
      app_meta.try_numeric(nullif(job_payload->>'salary_maximum', '')),
      nullif(job_payload->>'salary_cadence', ''),
      app_meta.try_numeric(nullif(job_payload->>'annualized_salary_minimum', '')),
      app_meta.try_numeric(nullif(job_payload->>'annualized_salary_maximum', '')),
      app_meta.try_numeric(nullif(job_payload->>'salary_parse_confidence', '')),
      case
        when nullif(job_payload->>'salary_raw', '') is null then null
        else 'source-listed'
      end,
      now(), now(), now(), true, 0,
      apply_ingest_snapshot.run_id,
      coalesce(job_payload->>'parser_version', 'unknown'),
      nullif(job_payload->>'snapshot_checksum', ''),
      now()
    )
    on conflict (source, external_id) do update set
      job_id = excluded.job_id,
      source_url = excluded.source_url,
      apply_url = excluded.apply_url,
      fuzzy_key = excluded.fuzzy_key,
      raw_title = excluded.raw_title,
      raw_location = excluded.raw_location,
      season = coalesce(excluded.season, public.job_sources.season),
      term_keys = excluded.term_keys,
      requisition_id = coalesce(excluded.requisition_id, public.job_sources.requisition_id),
      posted_date = case
        when excluded.posted_date is null then public.job_sources.posted_date
        else greatest(public.job_sources.posted_date, excluded.posted_date)
      end,
      country_code = excluded.country_code,
      region_code = excluded.region_code,
      city = excluded.city,
      metro_id = excluded.metro_id,
      location_type = excluded.location_type,
      normalization_confidence = excluded.normalization_confidence,
      salary_raw = excluded.salary_raw,
      salary_currency = excluded.salary_currency,
      salary_minimum = excluded.salary_minimum,
      salary_maximum = excluded.salary_maximum,
      salary_cadence = excluded.salary_cadence,
      annualized_salary_minimum = excluded.annualized_salary_minimum,
      annualized_salary_maximum = excluded.annualized_salary_maximum,
      salary_parse_confidence = excluded.salary_parse_confidence,
      salary_provenance = excluded.salary_provenance,
      last_seen_at = now(),
      last_checked_at = now(),
      active = true,
      healthy_miss_count = 0,
      last_seen_run_id = excluded.last_seen_run_id,
      parser_version = excluded.parser_version,
      snapshot_checksum = excluded.snapshot_checksum,
      updated_at = now();

    insert into app_meta.job_url_aliases (url_hash, job_id)
    values (
      encode(extensions.digest(job_payload->>'link', 'sha256'), 'hex'),
      selected_job_id
    )
    on conflict (url_hash) do update
    set job_id = excluded.job_id, last_seen_at = now();

    insert into app_meta.ingest_touched_jobs (run_id, job_id)
    values (apply_ingest_snapshot.run_id, selected_job_id)
    on conflict do nothing;

    if is_new and nullif(job_payload->>'dedupe_key', '') is not null then
      select observation.job_id
      into candidate_job_id
      from public.job_sources as observation
      where observation.fuzzy_key = job_payload->>'dedupe_key'
        and observation.job_id <> selected_job_id
      order by observation.last_seen_at desc
      limit 1;

      if candidate_job_id is not null then
        insert into public.job_match_candidates (
          left_job_id, right_job_id, confidence, reason
        ) values (
          least(selected_job_id, candidate_job_id),
          greatest(selected_job_id, candidate_job_id),
          0.70,
          'normalized company/title/location candidate'
        ) on conflict (left_job_id, right_job_id) do nothing;
      end if;
    end if;
  end loop;

  with missed as (
    update public.job_sources as observation
    set healthy_miss_count = least(observation.healthy_miss_count + 1, 2),
        active = observation.healthy_miss_count + 1 < 2,
        last_checked_at = now(),
        updated_at = now()
    from app_meta.ingest_healthy_sources as healthy
    where healthy.run_id = apply_ingest_snapshot.run_id
      and observation.source = healthy.source
      and observation.active
      and observation.last_seen_run_id is distinct from apply_ingest_snapshot.run_id
    returning observation.job_id
  )
  insert into app_meta.ingest_touched_jobs (run_id, job_id)
  select distinct apply_ingest_snapshot.run_id, missed.job_id from missed
  on conflict do nothing;

  with aged_out as (
    update public.job_sources as observation
    set active = false,
        last_checked_at = now(),
        updated_at = now()
    where observation.active
      and observation.posted_date is null
      and observation.first_seen_at < now() - make_interval(days => max_age)
    returning observation.job_id
  )
  insert into app_meta.ingest_touched_jobs (run_id, job_id)
  select distinct apply_ingest_snapshot.run_id, aged_out.job_id from aged_out
  on conflict do nothing;

  -- Report canonical jobs that transition inactive, not the number of source
  -- observations that happened to miss or age out.
  select count(*)::integer
  into deactivated_total
  from public.jobs as job
  where job.is_active
    and job.id in (
      select touched.job_id
      from app_meta.ingest_touched_jobs as touched
      where touched.run_id = apply_ingest_snapshot.run_id
    )
    and not exists (
      select 1
      from public.job_sources as observation
      where observation.job_id = job.id and observation.active
    );

  update public.jobs as job
  set is_active = exists (
        select 1 from public.job_sources as observation
        where observation.job_id = job.id and observation.active
      ),
      first_seen_at = coalesce((
        select min(observation.first_seen_at)
        from public.job_sources as observation where observation.job_id = job.id
      ), job.first_seen_at),
      last_seen_at = coalesce((
        select max(observation.last_seen_at)
        from public.job_sources as observation where observation.job_id = job.id
      ), job.last_seen_at),
      primary_source = coalesce((
        select observation.source
        from public.job_sources as observation
        where observation.job_id = job.id and observation.active
        order by observation.last_seen_at desc, observation.id desc
        limit 1
      ), job.primary_source),
      primary_apply_url = coalesce((
        select observation.apply_url
        from public.job_sources as observation
        where observation.job_id = job.id and observation.active
        order by observation.last_seen_at desc, observation.id desc
        limit 1
      ), job.primary_apply_url),
      term_keys = coalesce((
        select array_agg(term.value order by
          split_part(term.value, '-', 2)::integer,
          case split_part(term.value, '-', 1)
            when 'winter' then 0
            when 'spring' then 1
            when 'summer' then 2
            when 'fall' then 3
            else 4
          end
        )
        from (
          select distinct unnest(observation.term_keys) as value
          from public.job_sources as observation
          where observation.job_id = job.id and observation.active
        ) as term
      ), '{}'::text[]),
      salary_raw = canonical_salary.salary_raw,
      salary_currency = canonical_salary.salary_currency,
      salary_minimum = canonical_salary.salary_minimum,
      salary_maximum = canonical_salary.salary_maximum,
      salary_cadence = canonical_salary.salary_cadence,
      annualized_salary_minimum = canonical_salary.annualized_salary_minimum,
      annualized_salary_maximum = canonical_salary.annualized_salary_maximum,
      salary_parse_confidence = canonical_salary.salary_parse_confidence,
      salary_provenance = case
        when canonical_salary.id is null then null
        else 'source-listed'
      end,
      source_salary_sort_max = (
        select max(observation.annualized_salary_maximum)
        from public.job_sources as observation
        where observation.job_id = job.id
          and observation.active
          and observation.salary_provenance = 'source-listed'
          and observation.salary_currency = 'USD'
          and observation.salary_parse_confidence >= 0.8
      ),
      last_checked_at = now(),
      updated_at = now()
  from app_meta.ingest_touched_jobs as touched
  left join lateral (
    select observation.*
    from public.job_sources as observation
    where observation.job_id = touched.job_id
      and observation.active
      and observation.salary_raw is not null
      and observation.salary_provenance = 'source-listed'
    order by
      observation.salary_parse_confidence desc nulls last,
      observation.last_seen_at desc,
      observation.id desc
    limit 1
  ) as canonical_salary on true
  where touched.run_id = apply_ingest_snapshot.run_id
    and job.id = touched.job_id;

  insert into public.job_changes (
    job_id, run_id, changed_fields, previous_values, current_values
  )
  select
    job.id,
    apply_ingest_snapshot.run_id,
    array_remove(array[
      case
        when previous.primary_apply_url is distinct from job.primary_apply_url
          then 'apply_url'
      end,
      case when previous.title is distinct from job.title then 'title' end,
      case when previous.company is distinct from job.company then 'company' end,
      case
        when previous.display_location is distinct from job.display_location
          then 'location'
      end,
      case
        when previous.posted_date is distinct from job.posted_date
          then 'posted_date'
      end,
      case
        when previous.term_keys is distinct from job.term_keys
          then 'term_keys'
      end,
      case
        when previous.salary is distinct from jsonb_build_object(
          'raw', job.salary_raw,
          'currency', job.salary_currency,
          'minimum', job.salary_minimum,
          'maximum', job.salary_maximum,
          'cadence', job.salary_cadence,
          'annualized_minimum', job.annualized_salary_minimum,
          'annualized_maximum', job.annualized_salary_maximum,
          'parse_confidence', job.salary_parse_confidence,
          'provenance', job.salary_provenance
        ) then 'salary'
      end
    ], null::text),
    (case
      when previous.primary_apply_url is distinct from job.primary_apply_url
        then jsonb_build_object('apply_url', previous.primary_apply_url)
      else '{}'::jsonb
    end)
    || (case
      when previous.title is distinct from job.title
        then jsonb_build_object('title', previous.title)
      else '{}'::jsonb
    end)
    || (case
      when previous.company is distinct from job.company
        then jsonb_build_object('company', previous.company)
      else '{}'::jsonb
    end)
    || (case
      when previous.display_location is distinct from job.display_location
        then jsonb_build_object('location', previous.display_location)
      else '{}'::jsonb
    end)
    || (case
      when previous.posted_date is distinct from job.posted_date
        then jsonb_build_object('posted_date', previous.posted_date)
      else '{}'::jsonb
    end)
    || (case
      when previous.term_keys is distinct from job.term_keys
        then jsonb_build_object('term_keys', previous.term_keys)
      else '{}'::jsonb
    end)
    || (case
      when previous.salary is distinct from jsonb_build_object(
        'raw', job.salary_raw,
        'currency', job.salary_currency,
        'minimum', job.salary_minimum,
        'maximum', job.salary_maximum,
        'cadence', job.salary_cadence,
        'annualized_minimum', job.annualized_salary_minimum,
        'annualized_maximum', job.annualized_salary_maximum,
        'parse_confidence', job.salary_parse_confidence,
        'provenance', job.salary_provenance
      ) then jsonb_build_object('salary', previous.salary)
      else '{}'::jsonb
    end),
    (case
      when previous.primary_apply_url is distinct from job.primary_apply_url
        then jsonb_build_object('apply_url', job.primary_apply_url)
      else '{}'::jsonb
    end)
    || (case
      when previous.title is distinct from job.title
        then jsonb_build_object('title', job.title)
      else '{}'::jsonb
    end)
    || (case
      when previous.company is distinct from job.company
        then jsonb_build_object('company', job.company)
      else '{}'::jsonb
    end)
    || (case
      when previous.display_location is distinct from job.display_location
        then jsonb_build_object('location', job.display_location)
      else '{}'::jsonb
    end)
    || (case
      when previous.posted_date is distinct from job.posted_date
        then jsonb_build_object('posted_date', job.posted_date)
      else '{}'::jsonb
    end)
    || (case
      when previous.term_keys is distinct from job.term_keys
        then jsonb_build_object('term_keys', job.term_keys)
      else '{}'::jsonb
    end)
    || (case
      when previous.salary is distinct from jsonb_build_object(
        'raw', job.salary_raw,
        'currency', job.salary_currency,
        'minimum', job.salary_minimum,
        'maximum', job.salary_maximum,
        'cadence', job.salary_cadence,
        'annualized_minimum', job.annualized_salary_minimum,
        'annualized_maximum', job.annualized_salary_maximum,
        'parse_confidence', job.salary_parse_confidence,
        'provenance', job.salary_provenance
      ) then jsonb_build_object(
        'salary',
        jsonb_build_object(
          'raw', job.salary_raw,
          'currency', job.salary_currency,
          'minimum', job.salary_minimum,
          'maximum', job.salary_maximum,
          'cadence', job.salary_cadence,
          'annualized_minimum', job.annualized_salary_minimum,
          'annualized_maximum', job.annualized_salary_maximum,
          'parse_confidence', job.salary_parse_confidence,
          'provenance', job.salary_provenance
        )
      )
      else '{}'::jsonb
    end)
  from app_meta.ingest_previous_jobs as previous
  join public.jobs as job on job.id = previous.job_id
  where previous.run_id = apply_ingest_snapshot.run_id
    and (
       previous.primary_apply_url is distinct from job.primary_apply_url
     or previous.title is distinct from job.title
     or previous.company is distinct from job.company
     or previous.display_location is distinct from job.display_location
     or previous.posted_date is distinct from job.posted_date
     or previous.term_keys is distinct from job.term_keys
     or previous.salary is distinct from jsonb_build_object(
       'raw', job.salary_raw,
       'currency', job.salary_currency,
       'minimum', job.salary_minimum,
       'maximum', job.salary_maximum,
       'cadence', job.salary_cadence,
       'annualized_minimum', job.annualized_salary_minimum,
       'annualized_maximum', job.annualized_salary_maximum,
       'parse_confidence', job.salary_parse_confidence,
       'provenance', job.salary_provenance
     )
    );

  update public.ingest_runs as run
  set status = case when quarantined_total > 0 then 'partial' else 'healthy' end,
      snapshot_checksum = apply_ingest_snapshot.snapshot_checksum,
      raw_fetched_count = raw_total,
      parsed_count = parsed_total,
      accepted_count = accepted_total,
      rejected_count = rejected_total,
      inserted_count = inserted_total,
      updated_count = updated_total,
      deactivated_count = deactivated_total,
      duration_ms = greatest(coalesce(apply_ingest_snapshot.duration_ms, 0), 0),
      monitoring = app_meta.build_ingest_monitoring(
        apply_ingest_snapshot.run_id,
        greatest(coalesce(apply_ingest_snapshot.duration_ms, 0), 0)
      ),
      finished_at = now()
  where run.id = apply_ingest_snapshot.run_id;

  delete from app_meta.ingest_lease as lease
  where lease.singleton and lease.run_id = apply_ingest_snapshot.run_id;

  delete from app_meta.ingest_previous_jobs as previous
  where previous.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_touched_jobs as touched
  where touched.run_id = apply_ingest_snapshot.run_id;
  delete from app_meta.ingest_healthy_sources as healthy
  where healthy.run_id = apply_ingest_snapshot.run_id;

  return jsonb_build_object(
    'inserted', inserted_total,
    'updated', updated_total,
    'deactivated', deactivated_total,
    'healthy_sources', healthy_total,
    'quarantined_sources', quarantined_total
  );
end;
$function$;

create or replace function public.fail_ingest_run(
  run_id uuid,
  source_results jsonb,
  error_message text,
  duration_ms integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  source_result jsonb;
begin
  if jsonb_typeof(source_results) = 'array' then
    for source_result in select value from jsonb_array_elements(source_results)
    loop
      if jsonb_typeof(source_result) is distinct from 'object'
        or nullif(btrim(source_result->>'source'), '') is null then
        continue;
      end if;
      insert into public.ingest_source_runs (
        run_id, source, succeeded, complete_snapshot, fetched_count,
        raw_fetched_count, parsed_count, accepted_count, rejected_count,
        schema_valid, expected_markers_present, quarantined,
        quarantine_reason, rejection_rate, snapshot_checksum,
        parser_version, duration_ms, error, ran_at
      ) values (
        fail_ingest_run.run_id,
        left(btrim(source_result->>'source'), 64),
        false,
        false,
        greatest(coalesce(app_meta.try_integer(source_result->>'raw_fetched'), 0), 0),
        greatest(coalesce(app_meta.try_integer(source_result->>'raw_fetched'), 0), 0),
        greatest(coalesce(app_meta.try_integer(source_result->>'parsed'), 0), 0),
        greatest(coalesce(app_meta.try_integer(source_result->>'accepted'), 0), 0),
        greatest(coalesce(app_meta.try_integer(source_result->>'rejected'), 0), 0),
        coalesce(app_meta.try_boolean(source_result->>'schema_valid'), false),
        coalesce(app_meta.try_boolean(source_result->>'markers_present'), false),
        true,
        'run_failed',
        0,
        source_result->>'snapshot_checksum',
        left(nullif(btrim(source_result->>'parser_version'), ''), 128),
        greatest(
          coalesce(app_meta.try_integer(source_result->>'duration_ms'), 0),
          0
        ),
        coalesce(
          nullif(source_result->>'error', ''),
          left(coalesce(error_message, 'ingestion failed'), 4000)
        ),
        now()
      ) on conflict on constraint ingest_source_runs_run_source_unique do update set
        succeeded = false,
        complete_snapshot = false,
        fetched_count = excluded.fetched_count,
        raw_fetched_count = excluded.raw_fetched_count,
        parsed_count = excluded.parsed_count,
        accepted_count = excluded.accepted_count,
        rejected_count = excluded.rejected_count,
        schema_valid = excluded.schema_valid,
        expected_markers_present = excluded.expected_markers_present,
        quarantined = true,
        quarantine_reason = 'run_failed',
        rejection_rate = excluded.rejection_rate,
        snapshot_checksum = excluded.snapshot_checksum,
        parser_version = excluded.parser_version,
        duration_ms = excluded.duration_ms,
        error = excluded.error,
        ran_at = now();
    end loop;
  end if;

  update public.ingest_runs as run
  set status = 'failed',
      error = left(coalesce(error_message, 'ingestion failed'), 4000),
      duration_ms = greatest(coalesce(fail_ingest_run.duration_ms, 0), 0),
      monitoring = app_meta.build_ingest_monitoring(
        fail_ingest_run.run_id,
        greatest(coalesce(fail_ingest_run.duration_ms, 0), 0)
      ),
      finished_at = now()
  where run.id = fail_ingest_run.run_id;

  delete from app_meta.ingest_lease as lease
  where lease.singleton and lease.run_id = fail_ingest_run.run_id;
end;
$function$;

drop function if exists public.search_jobs(
  text, text, text, text, text[], boolean, boolean, text,
  uuid[], text, text, timestamptz, uuid, integer
);

create or replace function public.search_jobs(
  p_role_type text default 'internship',
  p_query text default null,
  p_major_id text default null,
  p_niche_id text default null,
  p_location_ids text[] default '{}'::text[],
  p_term_keys text[] default '{}'::text[],
  p_remote_only boolean default false,
  p_visa_sponsorship boolean default false,
  p_freshness text default 'all',
  p_tracking_keys uuid[] default null,
  p_sort_key text default 'newest',
  p_cursor_sort text default null,
  p_cursor_time timestamptz default null,
  p_cursor_id uuid default null,
  p_page_size integer default 30
)
returns setof public.jobs
language sql
stable
security invoker
set search_path = ''
as $function$
  select job.*
  from public.jobs as job
  where job.is_active
    and p_role_type in ('internship', 'new_grad')
    and (p_query is null or length(p_query) <= 100)
    and (p_major_id is null or p_major_id ~ '^[a-z0-9-]{1,64}$')
    and (p_niche_id is null or p_niche_id ~ '^[a-z0-9-]{1,64}$')
    and p_freshness in ('all', 'hot', 'new')
    and (p_cursor_sort is null or length(p_cursor_sort) <= 300)
    and p_sort_key in (
      'featured', 'newest', 'company', 'salary', 'location', 'application-stage'
    )
    and job.role_type = p_role_type
    and coalesce(job.posted_date, job.first_seen_at::date) >= current_date - 120
    and (
      nullif(btrim(p_query), '') is null
      or job.search_vector @@ websearch_to_tsquery('simple', left(p_query, 100))
    )
    and (
      p_major_id is null or p_major_id = 'all' or job.major_ids @> array[p_major_id]
    )
    and (
      p_niche_id is null or p_niche_id = 'all' or job.niche_ids @> array[p_niche_id]
    )
    and case
      when coalesce(cardinality(p_location_ids), 0) = 0 then true
      when cardinality(p_location_ids) <= 25
        and not exists (
          select 1
          from unnest(p_location_ids) as requested(location_id)
          where requested.location_id is null
            or requested.location_id !~ '^[a-z0-9:-]{1,80}$'
        )
      then job.location_facets && p_location_ids
      else false
    end
    and case
      when coalesce(cardinality(p_term_keys), 0) = 0 then true
      when cardinality(p_term_keys) <= 20
        and not exists (
          select 1
          from unnest(p_term_keys) as requested(term_key)
          where requested.term_key is null
            or (
              requested.term_key <> 'not-listed'
              and requested.term_key !~ '^(winter|spring|summer|fall)-20[0-9]{2}$'
            )
        )
      then (
        job.term_keys && array_remove(p_term_keys, 'not-listed')
        or (
          'not-listed' = any(p_term_keys)
          and cardinality(job.term_keys) = 0
        )
      )
      else false
    end
    and (not p_remote_only or job.location_type = 'remote')
    and (not p_visa_sponsorship or job.sponsorship = 'offers-sponsorship')
    and (
      p_freshness = 'all'
      or (p_freshness = 'hot' and job.sort_date >= current_date - 3)
      or (p_freshness = 'new' and job.sort_date >= current_date - 7)
    )
    and case
      when p_tracking_keys is null then true
      when cardinality(p_tracking_keys) <= 500
        then job.tracking_key = any(p_tracking_keys)
      else false
    end
    and (
      p_cursor_id is null
      or (
        p_cursor_time is not null
        and (
          (
            p_sort_key = 'featured'
            and p_cursor_sort in ('0', '1')
            and (
              (case when job.category in ('software', 'cloud') then 0 else 1 end)
                > (case when p_cursor_sort in ('0', '1') then p_cursor_sort::integer end)
              or (
                (case when job.category in ('software', 'cloud') then 0 else 1 end)
                  = (case when p_cursor_sort in ('0', '1') then p_cursor_sort::integer end)
                and (job.first_seen_at, job.id) < (p_cursor_time, p_cursor_id)
              )
            )
          )
          or (
            p_sort_key = 'newest'
            and p_cursor_sort ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and pg_catalog.pg_input_is_valid(p_cursor_sort, 'date')
            and (
              job.sort_date < (
                case
                  when p_cursor_sort ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    and pg_catalog.pg_input_is_valid(p_cursor_sort, 'date')
                  then p_cursor_sort::date
                end
              )
              or (
                job.sort_date = (
                  case
                    when p_cursor_sort ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                      and pg_catalog.pg_input_is_valid(p_cursor_sort, 'date')
                    then p_cursor_sort::date
                  end
                )
                and (job.first_seen_at, job.id) < (p_cursor_time, p_cursor_id)
              )
            )
          )
          or (
            p_sort_key = 'application-stage'
            and (job.first_seen_at, job.id) < (p_cursor_time, p_cursor_id)
          )
          or (
            p_sort_key = 'company'
            and p_cursor_sort is not null
            and (
              lower(job.company) > p_cursor_sort
              or (
                lower(job.company) = p_cursor_sort
                and (job.first_seen_at, job.id) < (p_cursor_time, p_cursor_id)
              )
            )
          )
          or (
            p_sort_key = 'location'
            and p_cursor_sort is not null
            and (
              lower(job.display_location) > p_cursor_sort
              or (
                lower(job.display_location) = p_cursor_sort
                and (job.first_seen_at, job.id) < (p_cursor_time, p_cursor_id)
              )
            )
          )
          or (
            p_sort_key = 'salary'
            and length(p_cursor_sort) <= 64
            and p_cursor_sort ~ '^-?[0-9]+([.][0-9]+)?$'
            and (
              coalesce(job.source_salary_sort_max, -1) < (
                case
                  when length(p_cursor_sort) <= 64
                    and p_cursor_sort ~ '^-?[0-9]+([.][0-9]+)?$'
                  then p_cursor_sort::numeric
                end
              )
              or (
                coalesce(job.source_salary_sort_max, -1) = (
                  case
                    when length(p_cursor_sort) <= 64
                      and p_cursor_sort ~ '^-?[0-9]+([.][0-9]+)?$'
                    then p_cursor_sort::numeric
                  end
                )
                and (job.first_seen_at, job.id) < (p_cursor_time, p_cursor_id)
              )
            )
          )
        )
      )
    )
  order by
    case when p_sort_key = 'featured'
      then case when job.category in ('software', 'cloud') then 0 else 1 end
    end asc,
    case when p_sort_key = 'company' then lower(job.company) end asc,
    case when p_sort_key = 'location' then lower(job.display_location) end asc,
    case when p_sort_key = 'salary' then job.source_salary_sort_max end desc nulls last,
    case when p_sort_key = 'newest' then job.sort_date end desc,
    job.first_seen_at desc,
    job.id desc
  limit least(greatest(p_page_size, 1), 60);
$function$;

drop function if exists public.count_jobs(
  text, text, text, text, text[], boolean, boolean, text, uuid[]
);

create or replace function public.count_jobs(
  p_role_type text default 'internship',
  p_query text default null,
  p_major_id text default null,
  p_niche_id text default null,
  p_location_ids text[] default '{}'::text[],
  p_term_keys text[] default '{}'::text[],
  p_remote_only boolean default false,
  p_visa_sponsorship boolean default false,
  p_freshness text default 'all',
  p_tracking_keys uuid[] default null
)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $function$
  select count(*)::bigint
  from public.jobs as job
  where job.is_active
    and p_role_type in ('internship', 'new_grad')
    and (p_query is null or length(p_query) <= 100)
    and (p_major_id is null or p_major_id ~ '^[a-z0-9-]{1,64}$')
    and (p_niche_id is null or p_niche_id ~ '^[a-z0-9-]{1,64}$')
    and p_freshness in ('all', 'hot', 'new')
    and job.role_type = p_role_type
    and coalesce(job.posted_date, job.first_seen_at::date) >= current_date - 120
    and (
      nullif(btrim(p_query), '') is null
      or job.search_vector @@ websearch_to_tsquery('simple', left(p_query, 100))
    )
    and (
      p_major_id is null or p_major_id = 'all' or job.major_ids @> array[p_major_id]
    )
    and (
      p_niche_id is null or p_niche_id = 'all' or job.niche_ids @> array[p_niche_id]
    )
    and case
      when coalesce(cardinality(p_location_ids), 0) = 0 then true
      when cardinality(p_location_ids) <= 25
        and not exists (
          select 1
          from unnest(p_location_ids) as requested(location_id)
          where requested.location_id is null
            or requested.location_id !~ '^[a-z0-9:-]{1,80}$'
        )
      then job.location_facets && p_location_ids
      else false
    end
    and case
      when coalesce(cardinality(p_term_keys), 0) = 0 then true
      when cardinality(p_term_keys) <= 20
        and not exists (
          select 1
          from unnest(p_term_keys) as requested(term_key)
          where requested.term_key is null
            or (
              requested.term_key <> 'not-listed'
              and requested.term_key !~ '^(winter|spring|summer|fall)-20[0-9]{2}$'
            )
        )
      then (
        job.term_keys && array_remove(p_term_keys, 'not-listed')
        or (
          'not-listed' = any(p_term_keys)
          and cardinality(job.term_keys) = 0
        )
      )
      else false
    end
    and (not p_remote_only or job.location_type = 'remote')
    and (not p_visa_sponsorship or job.sponsorship = 'offers-sponsorship')
    and (
      p_freshness = 'all'
      or (p_freshness = 'hot' and job.sort_date >= current_date - 3)
      or (p_freshness = 'new' and job.sort_date >= current_date - 7)
    )
    and case
      when p_tracking_keys is null then true
      when cardinality(p_tracking_keys) <= 500
        then job.tracking_key = any(p_tracking_keys)
      else false
    end;
$function$;

create or replace function public.resolve_job_url_aliases(p_url_hashes text[])
returns table(url_hash text, tracking_key uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_url_hashes is null or cardinality(p_url_hashes) = 0 then
    return;
  end if;

  if cardinality(p_url_hashes) > 100 then
    raise exception 'at most 100 URL hashes may be resolved at once'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_url_hashes) as requested(hash)
    where requested.hash is null
      or requested.hash !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'URL hashes must be lowercase SHA-256 digests'
      using errcode = '22023';
  end if;

  return query
  select alias.url_hash, job.tracking_key
  from app_meta.job_url_aliases as alias
  join public.jobs as job on job.id = alias.job_id
  where alias.url_hash = any(p_url_hashes)
  order by alias.url_hash;
end;
$function$;

create or replace view public.job_location_facets
with (security_invoker = true)
as
select job.role_type, facet.id, count(*)::bigint as job_count
from public.jobs as job
cross join lateral unnest(job.location_facets) as facet(id)
where job.is_active
  and coalesce(job.posted_date, job.first_seen_at::date) >= current_date - 120
group by job.role_type, facet.id;

create or replace view public.job_category_facets
with (security_invoker = true)
as
select job.role_type, job.category as id, count(*)::bigint as job_count
from public.jobs as job
where job.is_active
  and coalesce(job.posted_date, job.first_seen_at::date) >= current_date - 120
group by job.role_type, job.category;

create or replace view public.job_source_facets
with (security_invoker = true)
as
select job.role_type, observation.source as id, count(distinct observation.job_id)::bigint as job_count
from public.job_sources as observation
join public.jobs as job on job.id = observation.job_id
where observation.active and job.is_active
  and coalesce(job.posted_date, job.first_seen_at::date) >= current_date - 120
group by job.role_type, observation.source;

-- Conservative sanitation for the one-time legacy cutover and its temporary
-- compatibility policy. New observations always use the shared TypeScript
-- structured-location normalizer.
create or replace function app_meta.sanitize_legacy_us_location(value text)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  raw_value text := btrim(regexp_replace(coalesce(value, ''), '[[:space:]]+', ' ', 'g'));
  part text;
  normalized text;
  safe_parts text[] := '{}'::text[];
begin
  if raw_value = '' then
    return null;
  end if;

  foreach part in array regexp_split_to_array(
    raw_value,
    '[[:space:]]*(;|<br[[:space:]]*/?>)[[:space:]]*',
    'i'
  )
  loop
    part := btrim(regexp_replace(part, '[[:space:]]+', ' ', 'g'));
    normalized := btrim(regexp_replace(lower(part), '[^a-z0-9]+', ' ', 'g'));
    if normalized = '' then
      continue;
    end if;

    if normalized = 'chicago puerto rico' then
      safe_parts := array_cat(safe_parts, array['Chicago, IL', 'Puerto Rico']);
      continue;
    elsif normalized = 'chicago nyc' then
      safe_parts := array_cat(safe_parts, array['Chicago, IL', 'New York, NY']);
      continue;
    elsif normalized = 'chicago austin' then
      safe_parts := array_cat(safe_parts, array['Chicago, IL', 'Austin, TX']);
      continue;
    end if;

    if normalized ~ '(^| )(amsterdam nh|amsterdam north holland|buenos aires)( |$)'
      or normalized ~ '(^| )(united kingdom|uk|canada|israel|south africa|costa rica|netherlands|north holland|nl|germany|france|india|ireland|spain|singapore|switzerland|australia|new zealand|mexico|brazil|argentina|japan|china|hong kong|taiwan|south korea|poland|italy|portugal|sweden|norway|denmark|finland|belgium|austria|romania|hungary|united arab emirates|uae|europe|emea|apac|latin america)( |$)'
      or normalized ~ '(^| )(worldwide|global|anywhere|international)( |$)'
    then
      continue;
    end if;

    if normalized ~ '(^| )(united states( of america)?|usa|us|u s a|u s|nationwide|puerto rico|guam|us virgin islands|u s virgin islands|northern mariana islands|american samoa)( |$)'
      or part ~ ',[[:space:]]*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)([[:space:]]|$)'
      or normalized ~ '(^| )(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)( |$)'
    then
      safe_parts := array_append(safe_parts, part);
    end if;
  end loop;

  if cardinality(safe_parts) = 0 then
    return null;
  end if;
  return array_to_string(
    array(
      select item
      from unnest(safe_parts) with ordinality as ordered(item, position)
      group by item
      order by min(position)
    ),
    '; '
  );
end;
$function$;

-- Backfill current production rows without changing their immutable tracking
-- key on repeated migration or local resets.
do $backfill$
begin
  if to_regclass('public.internships') is not null then
    update public.internships as internship
    set location_eligible =
          app_meta.sanitize_legacy_us_location(internship.location) is not null,
        term_keys = case
          when cardinality(internship.term_keys) > 0 then internship.term_keys
          when lower(btrim(coalesce(internship.season, '')))
            ~ '^(winter|spring|summer|fall)[[:space:]]+20[0-9]{2}$'
          then array[replace(lower(btrim(internship.season)), ' ', '-')]
          else '{}'::text[]
        end,
        is_active = internship.is_active
          and app_meta.sanitize_legacy_us_location(internship.location) is not null;

    insert into public.jobs (
      legacy_identity_key, title, company, category, role_type, primary_source, season,
      term_keys,
      sponsorship, primary_apply_url, display_location, raw_location,
      country_code, region_code, city, metro_id, location_type,
      normalization_confidence, location_facets, major_ids, niche_ids,
      posted_date, sort_date, salary_raw, salary_provenance,
      company_domain, first_seen_at, last_seen_at, last_checked_at, is_active,
      search_text
    )
    select
      internship.dedupe_key,
      internship.title,
      internship.company,
      internship.category,
      internship.role_type,
      internship.source,
      internship.season,
      internship.term_keys,
      internship.sponsorship,
      internship.link,
      sanitized.safe_location,
      internship.location,
      'US',
      substring(
        sanitized.safe_location
        from ',[[:space:]]*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)([[:space:]]|;|$)'
      ),
      case
        when sanitized.safe_location ~* '\m(remote|work from home|wfh)\M' then null
        else nullif(btrim(split_part(sanitized.safe_location, ',', 1)), '')
      end,
      case
        when sanitized.safe_location ~* '\m(new york|nyc|manhattan|brooklyn|queens|bronx)\M' then 'nyc'
        when sanitized.safe_location ~* '\m(san francisco|sf|bay area|oakland|berkeley|san jose|mountain view|palo alto|sunnyvale|santa clara)\M' then 'sf-bay'
        when sanitized.safe_location ~* '\m(denver|boulder)\M' then 'denver'
        when sanitized.safe_location ~* '\mchicago\M' then 'chicago'
        when sanitized.safe_location ~* '\m(boston|cambridge)\M' then 'boston'
        when sanitized.safe_location ~* '\m(austin|round rock)\M' then 'austin'
        when sanitized.safe_location ~* '\m(seattle|bellevue|redmond)\M' then 'seattle'
        when sanitized.safe_location ~* '\m(los angeles|santa monica|culver city|long beach)\M' then 'los-angeles'
        when sanitized.safe_location ~* '\m(washington dc|district of columbia|arlington|mclean|bethesda)\M' then 'washington-dc'
        else null
      end,
      case
        when sanitized.safe_location ~* '\m(remote|work from home|wfh)\M' then 'remote'
        when sanitized.safe_location ~* '\mhybrid\M' then 'hybrid'
        else 'onsite'
      end,
      1,
      array_remove(array[
        case when sanitized.safe_location ~* '\m(denver|boulder)\M' then 'denver-co' end,
        case when sanitized.safe_location ~* '\m(new york|nyc|manhattan|brooklyn|queens|bronx)\M' then 'new-york-ny' end,
        case when sanitized.safe_location ~* '\m(san francisco|sf|bay area|oakland|berkeley|san jose|mountain view|palo alto|sunnyvale|santa clara)\M' then 'san-francisco-bay-area' end,
        case when sanitized.safe_location ~* '\m(seattle|bellevue|redmond)\M' then 'seattle-wa' end,
        case when sanitized.safe_location ~* '\m(austin|round rock)\M' then 'austin-tx' end,
        case when sanitized.safe_location ~* '\mchicago\M' then 'chicago-il' end,
        case when sanitized.safe_location ~* '\m(boston|cambridge)\M' then 'boston-ma' end,
        case when sanitized.safe_location ~* '\m(los angeles|santa monica|culver city|long beach)\M' then 'los-angeles-ca' end,
        case when sanitized.safe_location ~* '\m(washington dc|district of columbia|arlington|mclean|bethesda)\M' then 'washington-dc' end,
        case when sanitized.safe_location ~* '\m(dallas|fort worth|plano|irving)\M' then 'dallas-tx' end,
        case when sanitized.safe_location ~* '\matlanta\M' then 'atlanta-ga' end
      ]::text[], null),
      array_cat(
        array['all']::text[],
        case
          when internship.category = 'quant' then array['computer-science', 'business']::text[]
          when internship.category in ('software', 'cloud', 'data-ml', 'security') then array['computer-science']::text[]
          when internship.category in ('hardware', 'mechanical', 'electrical', 'civil', 'aerospace', 'manufacturing', 'industrial', 'materials') then array['engineering']::text[]
          when internship.category in ('finance', 'consulting', 'accounting', 'operations', 'product', 'marketing', 'supply-chain') then array['business']::text[]
          else '{}'::text[]
        end
      ),
      array_cat(
        array['all']::text[],
        case internship.category
          when 'software' then array['software-engineering']::text[]
          when 'cloud' then array['cloud-infra']::text[]
          when 'data-ml' then array['data-ml']::text[]
          when 'quant' then array['quant', 'finance']::text[]
          when 'security' then array['security']::text[]
          when 'hardware' then array['hardware-firmware']::text[]
          when 'mechanical' then array['mechanical']::text[]
          when 'electrical' then array['electrical']::text[]
          when 'civil' then array['civil']::text[]
          when 'aerospace' then array['aerospace']::text[]
          when 'manufacturing' then array['manufacturing']::text[]
          when 'industrial' then array['industrial']::text[]
          when 'materials' then array['materials']::text[]
          when 'finance' then array['finance']::text[]
          when 'consulting' then array['consulting']::text[]
          when 'accounting' then array['accounting']::text[]
          when 'operations' then array['operations']::text[]
          when 'product' then array['product']::text[]
          when 'marketing' then array['marketing']::text[]
          when 'supply-chain' then array['supply-chain']::text[]
          else '{}'::text[]
        end
      ),
      case when internship.posted_date <= current_date + 7 then internship.posted_date else null end,
      coalesce(
        case when internship.posted_date <= current_date + 7 then internship.posted_date end,
        internship.first_seen_at::date
      ),
      case
        when nullif(btrim(internship.salary), '') is null
          or lower(btrim(internship.salary)) ~ '^(n/?a|none|not available|not disclosed|competitive|competitive pay|tbd|unknown|-+|—)$'
        then null
        else btrim(internship.salary)
      end,
      case
        when nullif(btrim(internship.salary), '') is null
          or lower(btrim(internship.salary)) ~ '^(n/?a|none|not available|not disclosed|competitive|competitive pay|tbd|unknown|-+|—)$'
        then null
        else 'source-listed'
      end,
      internship.company_domain,
      internship.first_seen_at,
      internship.last_seen_at,
      internship.last_seen_at,
      internship.is_active,
      concat_ws(' ', internship.title, internship.company, sanitized.safe_location, internship.category)
    from public.internships as internship
    cross join lateral (
      select app_meta.sanitize_legacy_us_location(internship.location) as safe_location
    ) as sanitized
    where length(internship.link) <= 2048
      and sanitized.safe_location is not null
      and internship.link ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    on conflict (legacy_identity_key) do nothing;

    insert into public.job_sources (
      job_id, source, external_id, apply_url, fuzzy_key, raw_title,
      raw_location, season, term_keys, posted_date, salary_raw, salary_provenance,
      country_code, region_code, city, metro_id, location_type,
      normalization_confidence,
      first_seen_at, last_seen_at, last_checked_at, active,
      parser_version, updated_at
    )
    select
      job.id,
      internship.source,
      internship.dedupe_key,
      internship.link,
      internship.dedupe_key,
      internship.title,
      internship.location,
      internship.season,
      internship.term_keys,
      case when internship.posted_date <= current_date + 7 then internship.posted_date else null end,
      case
        when nullif(btrim(internship.salary), '') is null
          or lower(btrim(internship.salary)) ~ '^(n/?a|none|not available|not disclosed|competitive|competitive pay|tbd|unknown|-+|—)$'
        then null
        else btrim(internship.salary)
      end,
      case
        when nullif(btrim(internship.salary), '') is null
          or lower(btrim(internship.salary)) ~ '^(n/?a|none|not available|not disclosed|competitive|competitive pay|tbd|unknown|-+|—)$'
        then null
        else 'source-listed'
      end,
      'US',
      substring(
        sanitized.safe_location
        from ',[[:space:]]*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)([[:space:]]|;|$)'
      ),
      case
        when sanitized.safe_location ~* '\m(remote|work from home|wfh)\M' then null
        else nullif(btrim(split_part(sanitized.safe_location, ',', 1)), '')
      end,
      case
        when sanitized.safe_location ~* '\m(new york|nyc|manhattan|brooklyn|queens|bronx)\M' then 'nyc'
        when sanitized.safe_location ~* '\m(san francisco|sf|bay area|oakland|berkeley|san jose|mountain view|palo alto|sunnyvale|santa clara)\M' then 'sf-bay'
        when sanitized.safe_location ~* '\m(denver|boulder)\M' then 'denver'
        when sanitized.safe_location ~* '\mchicago\M' then 'chicago'
        when sanitized.safe_location ~* '\m(boston|cambridge)\M' then 'boston'
        when sanitized.safe_location ~* '\m(austin|round rock)\M' then 'austin'
        when sanitized.safe_location ~* '\m(seattle|bellevue|redmond)\M' then 'seattle'
        when sanitized.safe_location ~* '\m(los angeles|santa monica|culver city|long beach)\M' then 'los-angeles'
        when sanitized.safe_location ~* '\m(washington dc|district of columbia|arlington|mclean|bethesda)\M' then 'washington-dc'
        else null
      end,
      case
        when sanitized.safe_location ~* '\m(remote|work from home|wfh)\M' then 'remote'
        when sanitized.safe_location ~* '\mhybrid\M' then 'hybrid'
        else 'onsite'
      end,
      1,
      internship.first_seen_at,
      internship.last_seen_at,
      internship.last_seen_at,
      internship.is_active,
      'legacy-backfill',
      now()
    from public.internships as internship
    join public.jobs as job on job.legacy_identity_key = internship.dedupe_key
    cross join lateral (
      select app_meta.sanitize_legacy_us_location(internship.location) as safe_location
    ) as sanitized
    where sanitized.safe_location is not null
    on conflict (source, external_id) do nothing;

    insert into app_meta.job_url_aliases (url_hash, job_id)
    select encode(extensions.digest(internship.link, 'sha256'), 'hex'), job.id
    from public.internships as internship
    join public.jobs as job on job.legacy_identity_key = internship.dedupe_key
    cross join lateral (
      select app_meta.sanitize_legacy_us_location(internship.location) as safe_location
    ) as sanitized
    where length(internship.link) <= 2048
      and sanitized.safe_location is not null
      and internship.link ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
    on conflict (url_hash) do nothing;
  end if;
end;
$backfill$;

alter table public.jobs enable row level security;
alter table public.job_sources enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.ingest_source_runs enable row level security;
alter table public.job_match_candidates enable row level security;
alter table public.job_changes enable row level security;
alter table public.job_reports enable row level security;
alter table app_meta.ingest_settings enable row level security;
alter table app_meta.ingest_lease enable row level security;
alter table app_meta.job_url_aliases enable row level security;
alter table app_meta.ingest_healthy_sources enable row level security;
alter table app_meta.ingest_touched_jobs enable row level security;
alter table app_meta.ingest_previous_jobs enable row level security;

drop policy if exists "public read active jobs" on public.jobs;
create policy "public read active jobs"
on public.jobs for select to anon, authenticated
using (
  is_active
  and country_code = 'US'
  and coalesce(posted_date, first_seen_at::date)
    >= current_date - 120
);

drop policy if exists "public read active job sources" on public.job_sources;
create policy "public read active job sources"
on public.job_sources for select to anon, authenticated
using (
  active
  and exists (
    select 1
    from public.jobs as job
    where job.id = job_sources.job_id
  )
);

drop policy if exists "public read active job changes" on public.job_changes;
create policy "public read active job changes"
on public.job_changes for select to anon, authenticated
using (
  exists (
    select 1
    from public.jobs as job
    where job.id = job_changes.job_id
  )
);

drop policy if exists "public read internships" on public.internships;
drop policy if exists "public read active internships" on public.internships;
create policy "public read active internships"
on public.internships for select to anon, authenticated
using (
  is_active
  and location_eligible
  and coalesce(posted_date, first_seen_at::date) >= current_date - 120
);

-- Lock down the legacy production objects even before cutover is complete.
do $legacy_security$
begin
  if to_regclass('public.app_meta') is not null then
    execute 'alter table public.app_meta enable row level security';
    execute 'revoke all on table public.app_meta from public, anon, authenticated';
  end if;
  if to_regclass('public.internships') is not null then
    execute 'alter table public.internships enable row level security';
    execute 'revoke all on table public.internships from public, anon, authenticated';
  end if;
end;
$legacy_security$;

drop function if exists public.ingest_upsert(jsonb, text);
drop function if exists public.ingest_upsert_v2(jsonb, text, jsonb);

revoke all on all tables in schema app_meta from public, anon, authenticated;
revoke all on all sequences in schema app_meta from public, anon, authenticated;
revoke execute on all functions in schema app_meta from public, anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema app_meta revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_meta revoke all on tables from public, anon, authenticated;

grant select on public.internships, public.jobs, public.job_sources, public.job_changes
  to anon, authenticated;
grant select on public.job_location_facets, public.job_category_facets, public.job_source_facets
  to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all tables in schema app_meta to service_role;
grant all on all sequences in schema app_meta to service_role;
grant select on app_meta.job_url_aliases to service_role;
grant execute on function app_meta.ingest_bearer_digest_matches(text) to service_role;
grant execute on function public.authorize_ingest_request(text) to service_role;
grant execute on function public.begin_ingest_run(text, text, text) to service_role;
grant execute on function public.apply_ingest_snapshot(uuid, jsonb, jsonb, text, integer) to service_role;
grant execute on function public.fail_ingest_run(uuid, jsonb, text, integer) to service_role;
grant execute on function public.search_jobs(
  text, text, text, text, text[], text[], boolean, boolean, text,
  uuid[], text, text, timestamptz, uuid, integer
) to anon, authenticated, service_role;
grant execute on function public.count_jobs(
  text, text, text, text, text[], text[], boolean, boolean, text, uuid[]
) to anon, authenticated, service_role;
-- URL aliases are addressed only by an exact lowercase SHA-256 digest and
-- return the same opaque tracking key exposed on public job rows. This narrow
-- definer RPC keeps the alias table private while allowing legacy browser
-- tracking data to recover without distributing a server credential.
revoke execute on function public.resolve_job_url_aliases(text[]) from public;
grant execute on function public.resolve_job_url_aliases(text[]) to anon, authenticated, service_role;
grant execute on function app_meta.try_integer(text) to service_role;
grant execute on function app_meta.try_numeric(text) to service_role;
grant execute on function app_meta.try_boolean(text) to service_role;
grant execute on function app_meta.try_date(text) to service_role;
grant execute on function app_meta.ingest_job_payload_is_valid(jsonb) to service_role;
grant execute on function app_meta.build_ingest_monitoring(uuid, integer) to service_role;

revoke execute on function public.protect_tracking_key() from public, anon, authenticated, service_role;

-- Canonical scheduler: missing Vault entries produce zero rows and therefore
-- zero network requests. No secret is ever placed in the URL or migration.
-- pg_cron's named overload updates the existing `ingest-listings` job, so a
-- rerun cannot create duplicate schedules.
select cron.schedule(
  'ingest-listings',
  '15 */2 * * *',
  $cron$
    with configuration as (
      select
        (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_function_url') as function_url,
        (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cron_secret') as cron_secret
    )
    select net.http_post(
      url := configuration.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || configuration.cron_secret
      ),
      body := jsonb_build_object('trigger', 'pg_cron'),
      timeout_milliseconds := 60000
    )
    from configuration
    where length(configuration.function_url) <= 2048
      and configuration.function_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
      and nullif(btrim(configuration.cron_secret), '') is not null;
  $cron$
);

-- Release activation is a separate, observable step. A migration must never
-- start network ingestion before the reviewed Edge artifact is deployed and
-- its checksum has been verified.
select cron.alter_job(job_id := jobid, active := false)
from cron.job
where jobname = 'ingest-listings';

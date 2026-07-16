-- Deterministic, non-production fixtures for local smoke and browser tests.
insert into public.jobs (
  tracking_key,
  legacy_identity_key,
  title,
  company,
  category,
  role_type,
  primary_source,
  season,
  term_keys,
  primary_apply_url,
  display_location,
  raw_location,
  country_code,
  region_code,
  city,
  metro_id,
  location_type,
  normalization_confidence,
  location_facets,
  search_text,
  posted_date,
  sort_date,
  first_seen_at,
  last_seen_at,
  last_checked_at,
  is_active
) values (
  '00000000-0000-4000-8000-000000000001',
  'fixture|software-engineering-intern|denver',
  'Software Engineering Intern',
  'Fixture Labs',
  'software',
  'internship',
  'fixture',
  'Summer 2027',
  array['summer-2027'],
  'https://example.com/jobs/fixture-1',
  'Denver, CO',
  'Denver, CO',
  'US',
  'CO',
  'Denver',
  'denver',
  'hybrid',
  1,
  array['denver'],
  'software engineering intern fixture labs denver colorado',
  current_date,
  current_date,
  now(),
  now(),
  now(),
  true
)
on conflict (tracking_key) do nothing;

insert into public.job_sources (
  job_id,
  source,
  external_id,
  source_url,
  apply_url,
  fuzzy_key,
  raw_title,
  raw_location,
  season,
  term_keys,
  posted_date,
  country_code,
  region_code,
  city,
  metro_id,
  location_type,
  normalization_confidence,
  first_seen_at,
  last_seen_at,
  last_checked_at,
  active,
  parser_version
)
select
  job.id,
  'fixture',
  'fixture-1',
  'https://example.com/source/fixture-1',
  'https://example.com/jobs/fixture-1',
  'fixture|software-engineering-intern|denver',
  'Software Engineering Intern',
  'Denver, CO',
  'Summer 2027',
  array['summer-2027'],
  current_date,
  'US',
  'CO',
  'Denver',
  'denver',
  'hybrid',
  1,
  now(),
  now(),
  now(),
  true,
  'fixture-v1'
from public.jobs as job
where job.tracking_key = '00000000-0000-4000-8000-000000000001'
on conflict (source, external_id) do nothing;

-- A deterministic 3,000-row dataset keeps local pagination and browser tests
-- representative without copying any production records.
with fixture as (
  select ordinal
  from generate_series(1, 3000) as generated(ordinal)
)
insert into public.jobs (
  tracking_key,
  legacy_identity_key,
  title,
  company,
  category,
  role_type,
  primary_source,
  season,
  term_keys,
  primary_apply_url,
  display_location,
  raw_location,
  country_code,
  region_code,
  city,
  metro_id,
  location_type,
  normalization_confidence,
  location_facets,
  major_ids,
  niche_ids,
  search_text,
  posted_date,
  sort_date,
  salary_raw,
  salary_currency,
  salary_minimum,
  salary_maximum,
  salary_cadence,
  annualized_salary_minimum,
  annualized_salary_maximum,
  salary_parse_confidence,
  salary_provenance,
  source_salary_sort_max,
  first_seen_at,
  last_seen_at,
  last_checked_at,
  is_active
)
select
  ('10000000-0000-4000-8000-' || lpad(fixture.ordinal::text, 12, '0'))::uuid,
  'performance-fixture|' || fixture.ordinal,
  'Performance Fixture Role ' || fixture.ordinal,
  'Fixture Company ' || ((fixture.ordinal - 1) % 200 + 1),
  case fixture.ordinal % 5
    when 0 then 'software'
    when 1 then 'data-ml'
    when 2 then 'finance'
    when 3 then 'hardware'
    else 'operations'
  end,
  case when fixture.ordinal % 6 = 0 then 'new_grad' else 'internship' end,
  'performance-fixture',
  case
    when fixture.ordinal % 6 = 0 then null
    when fixture.ordinal % 4 = 0 then 'Fall 2026'
    when fixture.ordinal % 4 = 1 then 'Spring 2027'
    when fixture.ordinal % 4 = 2 then 'Summer 2027'
    else null
  end,
  case
    when fixture.ordinal % 6 = 0 then '{}'::text[]
    when fixture.ordinal % 4 = 0 then array['fall-2026']
    when fixture.ordinal % 4 = 1 then array['spring-2027']
    when fixture.ordinal % 4 = 2 then array['summer-2027']
    else '{}'::text[]
  end,
  'https://example.com/jobs/performance-' || fixture.ordinal,
  case fixture.ordinal % 3
    when 0 then 'Denver, CO'
    when 1 then 'New York, NY'
    else 'Remote, USA'
  end,
  case fixture.ordinal % 3
    when 0 then 'Denver, CO'
    when 1 then 'New York, NY'
    else 'Remote, USA'
  end,
  'US',
  case fixture.ordinal % 3 when 0 then 'CO' when 1 then 'NY' else null end,
  case fixture.ordinal % 3 when 0 then 'Denver' when 1 then 'New York' else null end,
  case fixture.ordinal % 3 when 0 then 'denver' when 1 then 'nyc' else null end,
  case when fixture.ordinal % 3 = 2 then 'remote' else 'onsite' end,
  1,
  array[
    case fixture.ordinal % 3
      when 0 then 'denver-co'
      when 1 then 'new-york-ny'
      else 'remote'
    end
  ],
  case
    when fixture.ordinal % 5 in (0, 1) then array['all', 'computer-science']
    when fixture.ordinal % 5 = 3 then array['all', 'engineering']
    else array['all', 'business']
  end,
  array['all'],
  concat_ws(
    ' ',
    'performance fixture role',
    fixture.ordinal,
    'fixture company',
    ((fixture.ordinal - 1) % 200 + 1)
  ),
  current_date - ((fixture.ordinal - 1) % 90),
  current_date - ((fixture.ordinal - 1) % 90),
  case when fixture.ordinal % 4 = 0 then '$40-$50/hr' end,
  case when fixture.ordinal % 4 = 0 then 'USD' end,
  case when fixture.ordinal % 4 = 0 then 40 end,
  case when fixture.ordinal % 4 = 0 then 50 end,
  case when fixture.ordinal % 4 = 0 then 'hourly' end,
  case when fixture.ordinal % 4 = 0 then 83200 end,
  case when fixture.ordinal % 4 = 0 then 104000 end,
  case when fixture.ordinal % 4 = 0 then 0.95 end,
  case when fixture.ordinal % 4 = 0 then 'source-listed' end,
  case when fixture.ordinal % 4 = 0 then 104000 end,
  now() - make_interval(days => ((fixture.ordinal - 1) % 90)),
  now(),
  now(),
  true
from fixture
on conflict (tracking_key) do nothing;

insert into public.job_sources (
  job_id,
  source,
  external_id,
  source_url,
  apply_url,
  fuzzy_key,
  raw_title,
  raw_location,
  season,
  term_keys,
  posted_date,
  country_code,
  region_code,
  city,
  metro_id,
  location_type,
  normalization_confidence,
  salary_raw,
  salary_currency,
  salary_minimum,
  salary_maximum,
  salary_cadence,
  annualized_salary_minimum,
  annualized_salary_maximum,
  salary_parse_confidence,
  salary_provenance,
  first_seen_at,
  last_seen_at,
  last_checked_at,
  active,
  parser_version,
  snapshot_checksum
)
select
  job.id,
  'performance-fixture',
  job.legacy_identity_key,
  'https://example.com/sources/performance-fixture',
  job.primary_apply_url,
  job.legacy_identity_key,
  job.title,
  job.raw_location,
  job.season,
  job.term_keys,
  job.posted_date,
  job.country_code,
  job.region_code,
  job.city,
  job.metro_id,
  job.location_type,
  job.normalization_confidence,
  job.salary_raw,
  job.salary_currency,
  job.salary_minimum,
  job.salary_maximum,
  job.salary_cadence,
  job.annualized_salary_minimum,
  job.annualized_salary_maximum,
  job.salary_parse_confidence,
  'source-listed',
  job.first_seen_at,
  job.last_seen_at,
  job.last_checked_at,
  true,
  'performance-fixture-v1',
  repeat('0', 64)
from public.jobs as job
where job.legacy_identity_key like 'performance-fixture|%'
on conflict (source, external_id) do nothing;

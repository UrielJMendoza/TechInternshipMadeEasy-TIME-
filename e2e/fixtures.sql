-- Browser-only deterministic fixtures. `supabase db reset --sql-paths` runs
-- this against the local stack; it is never applied to a linked project. This
-- file targets the current jobs/observations model, not the rollback-only
-- legacy internships table.

insert into public.jobs (
  id,
  tracking_key,
  legacy_identity_key,
  title,
  company,
  category,
  role_type,
  primary_source,
  season,
  term_keys,
  sponsorship,
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
  company_domain,
  company_domain_confidence,
  first_seen_at,
  last_seen_at,
  last_checked_at,
  is_active
)
select
  ('20000000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  ('00000000-0000-4000-8000-' || lpad(fixture.number::text, 12, '0'))::uuid,
  'e2e|fixture|' || fixture.number,
  case fixture.number % 6
    when 0 then 'Data Science Intern'
    when 1 then 'Software Engineering Intern'
    when 2 then 'Cloud Infrastructure Intern'
    when 3 then 'Product Management Intern'
    when 4 then 'Security Engineering Intern'
    else 'Quantitative Research Intern'
  end || ' ' || lpad(fixture.number::text, 4, '0'),
  'E2E Fixture Company ' || lpad(((fixture.number - 1) / 10 + 1)::text, 3, '0'),
  case fixture.number % 6
    when 0 then 'data-ml'
    when 1 then 'software'
    when 2 then 'cloud'
    when 3 then 'product'
    when 4 then 'security'
    else 'quant'
  end,
  case when fixture.number % 10 = 0 then 'new_grad' else 'internship' end,
  'fixture',
  case
    when fixture.number % 10 = 0 then null
    when fixture.number % 4 = 0 then 'Fall 2026'
    when fixture.number % 4 = 1 then 'Summer 2027'
    when fixture.number % 4 = 2 then 'Fall 2026 / Winter 2027'
    else null
  end,
  case
    when fixture.number % 10 = 0 then '{}'::text[]
    when fixture.number % 4 = 0 then array['fall-2026']
    when fixture.number % 4 = 1 then array['summer-2027']
    when fixture.number % 4 = 2 then array['fall-2026', 'winter-2027']
    else '{}'::text[]
  end,
  case when fixture.number % 5 = 0 then 'offers-sponsorship' else null end,
  'https://example.com/jobs/e2e-' || fixture.number,
  case fixture.number % 4
    when 0 then 'Remote in USA'
    when 1 then 'Denver, CO'
    when 2 then 'New York, NY'
    else 'Austin, TX'
  end,
  case fixture.number % 4
    when 0 then 'Remote in USA'
    when 1 then 'Denver, CO'
    when 2 then 'New York, NY'
    else 'Austin, TX'
  end,
  'US',
  case fixture.number % 4
    when 1 then 'CO'
    when 2 then 'NY'
    when 3 then 'TX'
    else null
  end,
  case fixture.number % 4
    when 1 then 'Denver'
    when 2 then 'New York'
    when 3 then 'Austin'
    else null
  end,
  case fixture.number % 4
    when 1 then 'denver'
    when 2 then 'new-york'
    when 3 then 'austin'
    else null
  end,
  case when fixture.number % 4 = 0 then 'remote' else 'onsite' end,
  1,
  case fixture.number % 4
    when 0 then array['remote']
    when 1 then array['denver-co']
    when 2 then array['new-york-ny']
    else array['austin-tx']
  end,
  case fixture.number % 6
    when 3 then array['all', 'business']
    when 5 then array['all', 'computer-science', 'business']
    else array['all', 'computer-science']
  end,
  case fixture.number % 6
    when 0 then array['all', 'data-ml']
    when 1 then array['all', 'software-engineering']
    when 2 then array['all', 'cloud-infra']
    when 3 then array['all', 'product']
    when 4 then array['all', 'security']
    else array['all', 'quant', 'finance']
  end,
  concat_ws(
    ' ',
    case fixture.number % 6
      when 0 then 'data science intern'
      when 1 then 'software engineering intern'
      when 2 then 'cloud infrastructure intern'
      when 3 then 'product management intern'
      when 4 then 'security engineering intern'
      else 'quantitative research intern'
    end,
    'e2e fixture company',
    ((fixture.number - 1) / 10 + 1),
    case fixture.number % 4
      when 0 then 'remote united states'
      when 1 then 'denver colorado'
      when 2 then 'new york'
      else 'austin texas'
    end
  ),
  case when fixture.number % 20 = 0 then null else current_date - (fixture.number % 30) end,
  current_date - (fixture.number % 30),
  case when fixture.number % 3 = 0 then '$42–$55/hr' else null end,
  case when fixture.number % 3 = 0 then 'USD' else null end,
  case when fixture.number % 3 = 0 then 42 else null end,
  case when fixture.number % 3 = 0 then 55 else null end,
  case when fixture.number % 3 = 0 then 'hourly' else null end,
  case when fixture.number % 3 = 0 then 87360 else null end,
  case when fixture.number % 3 = 0 then 114400 else null end,
  case when fixture.number % 3 = 0 then 1 else null end,
  case when fixture.number % 3 = 0 then 'source-listed' else null end,
  case when fixture.number % 3 = 0 then 114400 else null end,
  'example.com',
  1,
  now() - make_interval(secs => fixture.number),
  now(),
  now(),
  true
from generate_series(1, 3000) as fixture(number)
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
  requisition_id,
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
  'fixture',
  job.tracking_key::text,
  'https://example.com/sources/' || job.tracking_key,
  job.primary_apply_url,
  job.legacy_identity_key,
  job.title,
  job.raw_location,
  job.season,
  job.term_keys,
  job.tracking_key::text,
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
  'e2e-fixture-v1',
  'e2e-fixture-snapshot-v1'
from public.jobs as job
where job.legacy_identity_key like 'e2e|fixture|%'
on conflict (source, external_id) do nothing;

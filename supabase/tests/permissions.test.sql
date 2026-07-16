begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(68);

select has_table('public', 'jobs', 'canonical jobs table exists');
select has_table('public', 'job_sources', 'source observations table exists');
select has_table('public', 'ingest_runs', 'ingest run table exists');
select has_table('public', 'ingest_source_runs', 'source run table exists');
select has_table('app_meta', 'ingest_settings', 'non-secret ingest settings exist');
select has_column('public', 'jobs', 'primary_source', 'jobs expose a canonical primary source');
select has_column('app_meta', 'ingest_settings', 'expected_ingest_code_version', 'expected ingest version is configurable without a secret');
select has_column('app_meta', 'ingest_settings', 'long_run_threshold_ms', 'long-run monitoring threshold is configurable');
select has_column('app_meta', 'ingest_settings', 'maximum_rejection_rate', 'absolute rejection-rate threshold is configurable');
select has_column('public', 'internships', 'location_eligible', 'legacy rows carry an explicit cutover eligibility flag');
select has_column('public', 'jobs', 'term_keys', 'canonical jobs retain normalized internship terms');
select has_column('public', 'job_sources', 'term_keys', 'source observations retain normalized internship terms');
select is(
  (select count(*) from cron.job where jobname = 'ingest-listings'),
  1::bigint,
  'exactly one canonical ingest scheduler exists'
);
select is(
  (select active from cron.job where jobname = 'ingest-listings'),
  false,
  'the canonical scheduler stays disabled until release activation'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.jobs'::regclass),
  'jobs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.job_sources'::regclass),
  'job_sources has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ingest_runs'::regclass),
  'ingest_runs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'app_meta.ingest_settings'::regclass),
  'private settings have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.job_changes'::regclass),
  'job change history has RLS enabled'
);

select ok(has_table_privilege('anon', 'public.jobs', 'select'), 'anon may read active jobs');
select ok(has_table_privilege('authenticated', 'public.jobs', 'select'), 'authenticated may read active jobs');
select ok(has_table_privilege('anon', 'public.internships', 'select'), 'anon retains legacy reads during cutover');
select ok(has_table_privilege('authenticated', 'public.internships', 'select'), 'authenticated retains legacy reads during cutover');
select ok(has_table_privilege('anon', 'public.job_changes', 'select'), 'anon may read visible job history');
select ok(has_table_privilege('anon', 'public.job_term_facets', 'select'), 'anon may read bounded term facets');
select ok(
  coalesce((
    select 'security_invoker=true' = any(reloptions)
    from pg_class
    where oid = 'public.job_term_facets'::regclass
  ), false),
  'term facets execute with the caller privileges enforced by jobs RLS'
);
select ok(not has_table_privilege('anon', 'public.jobs', 'insert'), 'anon cannot insert jobs');
select ok(not has_table_privilege('anon', 'public.jobs', 'update'), 'anon cannot update jobs');
select ok(not has_table_privilege('anon', 'public.jobs', 'delete'), 'anon cannot delete jobs');
select ok(not has_table_privilege('authenticated', 'public.jobs', 'insert'), 'authenticated cannot insert jobs');
select ok(not has_schema_privilege('anon', 'app_meta', 'usage'), 'anon cannot use app_meta schema');
select ok(not has_schema_privilege('authenticated', 'app_meta', 'usage'), 'authenticated cannot use app_meta schema');

select ok(
  not has_function_privilege('anon', 'public.begin_ingest_run(text,text,text)', 'execute'),
  'anon cannot begin ingestion'
);
select ok(
  not has_function_privilege('authenticated', 'public.begin_ingest_run(text,text,text)', 'execute'),
  'authenticated cannot begin ingestion'
);
select ok(
  not has_function_privilege('anon', 'public.authorize_ingest_request(text)', 'execute'),
  'anon cannot validate scheduler credentials'
);
select ok(
  not has_function_privilege('authenticated', 'public.authorize_ingest_request(text)', 'execute'),
  'authenticated users cannot validate scheduler credentials'
);
select ok(
  has_function_privilege('service_role', 'public.authorize_ingest_request(text)', 'execute'),
  'service role can validate scheduler credentials'
);
select ok(
  not has_function_privilege('anon', 'app_meta.ingest_bearer_digest_matches(text)', 'execute'),
  'anon cannot execute the private Vault verifier'
);
select ok(
  not has_function_privilege('authenticated', 'app_meta.ingest_bearer_digest_matches(text)', 'execute'),
  'authenticated users cannot execute the private Vault verifier'
);
select ok(
  has_function_privilege('service_role', 'app_meta.ingest_bearer_digest_matches(text)', 'execute'),
  'service role can execute the private Vault verifier'
);
select is(
  (select prosecdef from pg_proc where oid = 'app_meta.ingest_bearer_digest_matches(text)'::regprocedure),
  true,
  'the private Vault verifier is SECURITY DEFINER'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.authorize_ingest_request(text)'::regprocedure),
  false,
  'the exposed scheduler credential wrapper is SECURITY INVOKER'
);
select is(
  public.authorize_ingest_request(repeat('0', 64)),
  false,
  'scheduler credential validation fails closed when Vault is unconfigured'
);
do $vault_fixture$
begin
  perform vault.create_secret(repeat('a', 64), 'ingest_cron_secret');
end;
$vault_fixture$;
set local role service_role;
select is(
  public.authorize_ingest_request(
    encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex')
  ),
  true,
  'the service-only verifier accepts the Vault-backed scheduler digest'
);
select is(
  public.authorize_ingest_request(repeat('b', 64)),
  false,
  'the service-only verifier rejects an incorrect digest'
);
select is(
  public.authorize_ingest_request('malformed'),
  false,
  'the service-only verifier rejects malformed digests'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)', 'execute'),
  'anon cannot apply an ingestion snapshot'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)', 'execute'),
  'authenticated cannot apply an ingestion snapshot'
);
select ok(
  has_function_privilege('service_role', 'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)', 'execute'),
  'service role can apply an ingestion snapshot'
);
select ok(
  has_function_privilege('anon', 'public.count_jobs(text,text,text,text,text[],text[],boolean,boolean,text,uuid[])', 'execute'),
  'anon may execute the filtered count RPC'
);
select ok(
  not has_function_privilege('anon', 'app_meta.try_integer(text)', 'execute'),
  'anon cannot execute private payload conversion helpers'
);
select ok(
  has_function_privilege('anon', 'public.resolve_job_url_aliases(text[])', 'execute'),
  'anon may resolve an exact URL digest without reading the private alias table'
);
select ok(
  has_function_privilege('authenticated', 'public.resolve_job_url_aliases(text[])', 'execute'),
  'authenticated users may resolve an exact URL digest without reading the private alias table'
);
select ok(
  has_function_privilege('service_role', 'public.resolve_job_url_aliases(text[])', 'execute'),
  'service role can resolve URL aliases'
);
select ok(
  not has_table_privilege('anon', 'app_meta.job_url_aliases', 'select'),
  'anon cannot read the private URL alias table'
);
select ok(
  not has_table_privilege('authenticated', 'app_meta.job_url_aliases', 'select'),
  'authenticated users cannot read the private URL alias table'
);
select ok(
  has_table_privilege('service_role', 'app_meta.job_url_aliases', 'select'),
  'service role may read the private alias map'
);
select is(to_regprocedure('public.ingest_upsert(jsonb,text)'), null, 'obsolete ingest_upsert is absent');
select is(to_regprocedure('public.ingest_upsert_v2(jsonb,text,jsonb)'), null, 'obsolete ingest_upsert_v2 is absent');
select is(
  (select prosecdef from pg_proc where oid = 'public.apply_ingest_snapshot(uuid,jsonb,jsonb,text,integer)'::regprocedure),
  false,
  'snapshot RPC is SECURITY INVOKER'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.count_jobs(text,text,text,text,text[],text[],boolean,boolean,text,uuid[])'::regprocedure),
  false,
  'count RPC is SECURITY INVOKER'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.resolve_job_url_aliases(text[])'::regprocedure),
  true,
  'URL alias resolver is a narrow SECURITY DEFINER boundary'
);
select ok(
  (
    select exists (
      select 1
      from unnest(coalesce(proconfig, '{}'::text[])) as setting(value)
      where setting.value in ('search_path=', 'search_path=""')
    )
    from pg_proc
    where oid = 'public.resolve_job_url_aliases(text[])'::regprocedure
  ),
  'URL alias resolver has an empty locked search path'
);

select results_eq(
  $$
    select app_meta.sanitize_legacy_us_location(raw_location)
    from (values
      (1, 'London, UK; Chicago, IL'),
      (2, 'Amsterdam, NH'),
      (3, 'Amsterdam, NY'),
      (4, 'Chicago, Puerto Rico'),
      (5, 'Remote in Canada'),
      (6, 'Remote in USA'),
      (7, 'Remote in Israel'),
      (8, 'Remote in South Africa'),
      (9, 'San Jose, Costa Rica'),
      (10, 'Remote worldwide')
    ) as fixture(ordinal, raw_location)
    order by ordinal
  $$,
  $$
    values
      ('Chicago, IL'::text),
      (null::text),
      ('Amsterdam, NY'::text),
      ('Chicago, IL; Puerto Rico'::text),
      (null::text),
      ('Remote in USA'::text),
      (null::text),
      (null::text),
      (null::text),
      (null::text)
  $$,
  'legacy cutover sanitizer keeps only explicit US evidence'
);

insert into public.jobs (
  tracking_key, legacy_identity_key, title, company, role_type,
  primary_source, primary_apply_url, first_seen_at, last_seen_at,
  last_checked_at, country_code, is_active
) values
  (
    '20000000-0000-4000-8000-000000000001', 'rls-active', 'RLS Active',
    'Fixture', 'internship', 'rls-fixture', 'https://example.com/rls-active',
    now(), now(), now(), 'US', true
  ),
  (
    '20000000-0000-4000-8000-000000000002', 'rls-inactive', 'RLS Inactive',
    'Fixture', 'internship', 'rls-fixture', 'https://example.com/rls-inactive',
    now(), now(), now(), 'US', false
  ),
  (
    '20000000-0000-4000-8000-000000000003', 'rls-old', 'RLS Old',
    'Fixture', 'internship', 'rls-fixture', 'https://example.com/rls-old',
    now() - interval '121 days', now(), now(), 'US', true
  );

insert into public.job_sources (
  job_id, source, external_id, apply_url, raw_title, parser_version, active
)
select
  job.id,
  'rls-fixture',
  job.legacy_identity_key,
  job.primary_apply_url,
  job.title,
  'rls-fixture-v1',
  true
from public.jobs as job
where job.legacy_identity_key in ('rls-active', 'rls-inactive', 'rls-old');

insert into public.job_changes (
  job_id, changed_fields, previous_values, current_values
)
select
  job.id,
  array['title'],
  jsonb_build_object('marker', job.legacy_identity_key),
  jsonb_build_object('title', job.title)
from public.jobs as job
where job.legacy_identity_key in ('rls-active', 'rls-inactive', 'rls-old');

insert into public.internships (
  title, company, link, source, dedupe_key, location,
  first_seen_at, last_seen_at, is_active, location_eligible
) values
  (
    'Legacy Active', 'Fixture', 'https://example.com/legacy-active',
    'rls-fixture', 'legacy-rls-active', 'Denver, CO', now(), now(), true, true
  ),
  (
    'Legacy Inactive', 'Fixture', 'https://example.com/legacy-inactive',
    'rls-fixture', 'legacy-rls-inactive', 'Denver, CO', now(), now(), false, true
  ),
  (
    'Legacy Old', 'Fixture', 'https://example.com/legacy-old',
    'rls-fixture', 'legacy-rls-old', 'Denver, CO',
    now() - interval '121 days', now(), true, true
  ),
  (
    'Legacy Foreign', 'Fixture', 'https://example.com/legacy-foreign',
    'rls-fixture', 'legacy-rls-foreign', 'Remote in Israel', now(), now(), true, false
  );

set local role anon;

select results_eq(
  $$
    select tracking_key::text
    from public.jobs
    where tracking_key in (
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000003'
    )
    order by tracking_key
  $$,
  array['20000000-0000-4000-8000-000000000001']::text[],
  'anon sees only current active canonical jobs'
);

select results_eq(
  $$
    select external_id
    from public.job_sources
    where external_id in ('rls-active', 'rls-inactive', 'rls-old')
    order by external_id
  $$,
  array['rls-active']::text[],
  'source observations cannot bypass parent job visibility'
);

select results_eq(
  $$
    select previous_values->>'marker'
    from public.job_changes
    where previous_values->>'marker' like 'rls-%'
    order by previous_values->>'marker'
  $$,
  array['rls-active']::text[],
  'job history cannot bypass parent job visibility'
);

select results_eq(
  $$
    select dedupe_key
    from public.internships
    where dedupe_key like 'legacy-rls-%'
    order by dedupe_key
  $$,
  array['legacy-rls-active']::text[],
  'legacy policy exposes only current active rows during cutover'
);

reset role;

select * from finish();
rollback;

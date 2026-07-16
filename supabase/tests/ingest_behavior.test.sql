begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(31);

select is(
  app_meta.ingest_job_payload_is_valid(
    '{"source":"term-null","title":"Term null","company":"Fixture","location":"Denver, CO","link":"https://example.com/term-null","term_keys":[null]}'::jsonb
  ),
  false,
  'JSON null term keys are rejected before persistence'
);
select is(
  app_meta.ingest_job_payload_is_valid(
    '{"source":"missing-location","title":"Missing location","company":"Fixture","link":"https://example.com/missing-location"}'::jsonb
  ),
  false,
  'jobs without a non-empty location are rejected before persistence'
);

update app_meta.ingest_settings
set expected_ingest_code_version = 'expected-code',
    long_run_threshold_ms = 1000
where singleton;

-- Malformed counters are quarantined instead of throwing an unsafe-cast error.
insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000001',
  'running',
  'pgtap',
  'test-code',
  'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000001', now() + interval '5 minutes');

select lives_ok(
  $$
    select public.apply_ingest_snapshot(
      '30000000-0000-4000-8000-000000000001',
      '[{"source":"bad-count","external_id":"bad-1","title":"Bad count fixture","company":"Fixture","location":"Denver, CO","link":"https://example.com/bad-count"}]'::jsonb,
      '[{"source":"bad-count","succeeded":true,"complete_snapshot":true,"raw_fetched":"oops","parsed":0,"accepted":0,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      1000
    )
  $$,
  'malformed source counters fail closed without aborting the run record'
);
select is(
  (
    select quarantine_reason
    from public.ingest_source_runs
    where run_id = '30000000-0000-4000-8000-000000000001'
      and source = 'bad-count'
  ),
  'invalid_source_result',
  'malformed counters receive an explicit quarantine reason'
);
select is(
  (
    select status
    from public.ingest_runs
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'quarantined',
  'a run with no healthy sources is quarantined'
);
select ok(
  (
    select (monitoring->>'stale_code_version')::boolean
      and (monitoring->>'long_duration')::boolean
      and monitoring->'zero_accepted_sources' @> '["bad-count"]'::jsonb
      and jsonb_array_length(monitoring->'anomalies') = 1
    from public.ingest_runs
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'monitoring records stale code, long duration, zero acceptance, and anomalies'
);

-- A partial snapshot must not touch miss counters or deactivate observations.
insert into public.jobs (
  id, tracking_key, legacy_identity_key, title, company, primary_source,
  primary_apply_url, first_seen_at, last_seen_at, last_checked_at, is_active
) values (
  '31000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000002',
  'partial-existing',
  'Partial Existing',
  'Fixture',
  'partial-fixture',
  'https://example.com/partial-existing',
  now(), now(), now(), true
);
insert into public.job_sources (
  job_id, source, external_id, apply_url, raw_title, parser_version, active
) values (
  '31000000-0000-4000-8000-000000000001',
  'partial-fixture',
  'partial-existing',
  'https://example.com/partial-existing',
  'Partial Existing',
  'test-parser',
  true
);
insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000002',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000002', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000002',
  '[{"source":"partial-fixture","external_id":"partial-existing","title":"Partial Existing","company":"Fixture","location":"Denver, CO","link":"https://example.com/partial-existing"}]'::jsonb,
  '[{"source":"partial-fixture","succeeded":true,"complete_snapshot":false,"raw_fetched":1,"parsed":1,"accepted":1,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]'::jsonb,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  1
);
select is(
  (
    select quarantine_reason
    from public.ingest_source_runs
    where run_id = '30000000-0000-4000-8000-000000000002'
  ),
  'partial_snapshot',
  'partial snapshots are quarantined explicitly'
);
select ok(
  (
    select active and healthy_miss_count = 0
    from public.job_sources
    where source = 'partial-fixture' and external_id = 'partial-existing'
  ),
  'partial snapshots do not advance miss counters'
);

-- Accepted counts must match the rows supplied for that source.
insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000003',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000003', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000003',
  '[{"source":"mismatch-fixture","external_id":"only-one","title":"Only one","company":"Fixture","location":"Denver, CO","link":"https://example.com/only-one"}]'::jsonb,
  '[{"source":"mismatch-fixture","succeeded":true,"complete_snapshot":true,"raw_fetched":2,"parsed":2,"accepted":2,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}]'::jsonb,
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  1
);
select is(
  (
    select quarantine_reason
    from public.ingest_source_runs
    where run_id = '30000000-0000-4000-8000-000000000003'
  ),
  'accepted_payload_mismatch',
  'count/payload mismatches cannot authorize deactivation'
);

-- A first-ever snapshot with an excessive rejection rate is quarantined even
-- without a previous healthy baseline to compare against.
insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000013',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000013', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000013',
  '[{"source":"rejection-fixture","external_id":"accepted-one","title":"Accepted one","company":"Fixture","location":"Denver, CO","link":"https://example.com/accepted-one"}]'::jsonb,
  '[{"source":"rejection-fixture","succeeded":true,"complete_snapshot":true,"raw_fetched":5,"parsed":5,"accepted":1,"rejected":4,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"abababababababababababababababababababababababababababababababab"}]'::jsonb,
  'abababababababababababababababababababababababababababababababab',
  1
);
select is(
  (
    select quarantine_reason
    from public.ingest_source_runs
    where run_id = '30000000-0000-4000-8000-000000000013'
  ),
  'rejection_rate_high',
  'an excessive first-run rejection rate is quarantined'
);

-- A source observation deactivates only after two consecutive healthy misses.
insert into public.jobs (
  id, tracking_key, legacy_identity_key, title, company, primary_source,
  primary_apply_url, first_seen_at, last_seen_at, last_checked_at, is_active
) values (
  '32000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000002',
  'healthy-missing',
  'Healthy Missing',
  'Fixture',
  'healthy-fixture',
  'https://example.com/healthy-missing',
  now(), now(), now(), true
);
insert into public.job_sources (
  job_id, source, external_id, apply_url, raw_title, parser_version, active
) values (
  '32000000-0000-4000-8000-000000000001',
  'healthy-fixture',
  'healthy-missing',
  'https://example.com/healthy-missing',
  'Healthy Missing',
  'test-parser',
  true
);

insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000004',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000004', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000004',
  '[{"source":"healthy-fixture","external_id":"healthy-present","title":"Healthy Present","company":"Fixture","location":"Denver, CO","link":"https://example.com/healthy-present"}]'::jsonb,
  '[{"source":"healthy-fixture","succeeded":true,"complete_snapshot":true,"raw_fetched":1,"parsed":1,"accepted":1,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}]'::jsonb,
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  1
);
select ok(
  (
    select active and healthy_miss_count = 1
    from public.job_sources
    where source = 'healthy-fixture' and external_id = 'healthy-missing'
  ),
  'the first healthy miss keeps the source observation active'
);

insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000005',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000005', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000005',
  '[{"source":"healthy-fixture","external_id":"healthy-present","title":"Healthy Present","company":"Fixture","location":"Denver, CO","link":"https://example.com/healthy-present"}]'::jsonb,
  '[{"source":"healthy-fixture","succeeded":true,"complete_snapshot":true,"raw_fetched":1,"parsed":1,"accepted":1,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"}]'::jsonb,
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  1
);
select ok(
  (
    select not active and healthy_miss_count = 2
    from public.job_sources
    where source = 'healthy-fixture' and external_id = 'healthy-missing'
  ),
  'the second consecutive healthy miss deactivates the source observation'
);
select ok(
  not (
    select is_active
    from public.jobs
    where id = '32000000-0000-4000-8000-000000000001'
  ),
  'canonical activity follows the remaining active source observations'
);
select is(
  (
    select deactivated_count
    from public.ingest_runs
    where id = '30000000-0000-4000-8000-000000000005'
  ),
  1,
  'deactivated_count counts canonical jobs rather than source rows'
);
select is(
  (
    select count(*)
    from public.job_changes
    where run_id = '30000000-0000-4000-8000-000000000005'
  ),
  0::bigint,
  'unchanged canonical rows do not create history noise'
);

-- Null-date observations age by first_seen_at and update their canonical job.
insert into public.jobs (
  id, tracking_key, legacy_identity_key, title, company, primary_source,
  primary_apply_url, first_seen_at, last_seen_at, last_checked_at, is_active
) values (
  '33000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000002',
  'old-null-date',
  'Old null date',
  'Fixture',
  'old-null-fixture',
  'https://example.com/old-null-date',
  now() - interval '121 days', now(), now(), true
);
insert into public.job_sources (
  job_id, source, external_id, apply_url, raw_title, parser_version,
  first_seen_at, active
) values (
  '33000000-0000-4000-8000-000000000001',
  'old-null-fixture',
  'old-null-date',
  'https://example.com/old-null-date',
  'Old null date',
  'test-parser',
  now() - interval '121 days',
  true
);
insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000006',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000006', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000006',
  '[{"source":"age-trigger","external_id":"age-trigger","title":"Age Trigger","company":"Fixture","location":"Denver, CO","link":"https://example.com/age-trigger"}]'::jsonb,
  '[{"source":"age-trigger","succeeded":true,"complete_snapshot":true,"raw_fetched":1,"parsed":1,"accepted":1,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}]'::jsonb,
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  1
);
select ok(
  (
    select not observation.active and not job.is_active
    from public.job_sources as observation
    join public.jobs as job on job.id = observation.job_id
    where observation.source = 'old-null-fixture'
      and observation.external_id = 'old-null-date'
  ),
  'null-date aging deactivates both the observation and canonical job'
);

-- Canonical salary sorting is recomputed from current active observations.
insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000007',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000007', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000007',
  '[{"source":"salary-fixture","external_id":"salary-one","title":"Salary Fixture","company":"Fixture","location":"Denver, CO","link":"https://example.com/salary-one","term_keys":["fall-2026","summer-2027"],"salary_raw":"$50/hr","salary_currency":"USD","salary_minimum":50,"salary_maximum":50,"salary_cadence":"hourly","annualized_salary_minimum":104000,"annualized_salary_maximum":104000,"salary_parse_confidence":0.95}]'::jsonb,
  '[{"source":"salary-fixture","succeeded":true,"complete_snapshot":true,"raw_fetched":1,"parsed":1,"accepted":1,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"1111111111111111111111111111111111111111111111111111111111111111"}]'::jsonb,
  '1111111111111111111111111111111111111111111111111111111111111111',
  1
);
select is(
  (
    select source_salary_sort_max
    from public.jobs
    where legacy_identity_key is null
      and primary_source = 'salary-fixture'
      and primary_apply_url = 'https://example.com/salary-one'
  ),
  104000::numeric,
  'confident source-listed pay populates the salary sort value'
);

insert into public.ingest_runs (
  id, status, trigger_origin, ingest_code_version, parser_version
) values (
  '30000000-0000-4000-8000-000000000008',
  'running', 'pgtap', 'test-code', 'test-parser'
);
insert into app_meta.ingest_lease (singleton, run_id, lease_expires_at)
values (true, '30000000-0000-4000-8000-000000000008', now() + interval '5 minutes');
select public.apply_ingest_snapshot(
  '30000000-0000-4000-8000-000000000008',
  '[{"source":"salary-fixture","external_id":"salary-one","title":"Salary Fixture","company":"Fixture","location":"Denver, CO","link":"https://example.com/salary-one","term_keys":["summer-2027"],"salary_raw":"$40/hr","salary_currency":"USD","salary_minimum":40,"salary_maximum":40,"salary_cadence":"hourly","annualized_salary_minimum":83200,"annualized_salary_maximum":83200,"salary_parse_confidence":0.95}]'::jsonb,
  '[{"source":"salary-fixture","succeeded":true,"complete_snapshot":true,"raw_fetched":1,"parsed":1,"accepted":1,"rejected":0,"schema_valid":true,"markers_present":true,"parser_version":"test-parser","snapshot_checksum":"2222222222222222222222222222222222222222222222222222222222222222"}]'::jsonb,
  '2222222222222222222222222222222222222222222222222222222222222222',
  1
);
select is(
  (
    select source_salary_sort_max
    from public.jobs
    where primary_source = 'salary-fixture'
      and primary_apply_url = 'https://example.com/salary-one'
  ),
  83200::numeric,
  'salary sorting drops stale historical highs after an observation changes'
);
select results_eq(
  $$
    select term_keys
    from public.jobs
    where primary_source = 'salary-fixture'
      and primary_apply_url = 'https://example.com/salary-one'
  $$,
  $$ values (array['summer-2027']::text[]) $$,
  'canonical terms are recomputed from current active observations without stale cycles'
);
select ok(
  public.count_jobs(p_term_keys => array['summer-2027']) >= 1,
  'term filtering returns canonical jobs with any requested explicit term'
);
select ok(
  (
    select changed_fields = array['term_keys', 'salary']
      and previous_values->'term_keys' = '["fall-2026", "summer-2027"]'::jsonb
      and current_values->'term_keys' = '["summer-2027"]'::jsonb
      and previous_values->'salary'->>'annualized_maximum' = '104000'
      and current_values->'salary'->>'annualized_maximum' = '83200'
    from public.job_changes
    where run_id = '30000000-0000-4000-8000-000000000008'
  ),
  'meaningful term and salary changes record bounded before/after history'
);

select lives_ok(
  $$
    select count(*)
    from public.search_jobs(
      p_sort_key => 'salary',
      p_cursor_sort => 'not-a-number',
      p_cursor_time => now(),
      p_cursor_id => '34000000-0000-4000-8000-000000000001',
      p_page_size => 1
    )
  $$,
  'malformed salary cursors never reach an unsafe numeric cast'
);
select is(
  (
    select count(*)
    from public.search_jobs(
      p_sort_key => 'salary',
      p_cursor_sort => 'not-a-number',
      p_cursor_time => now(),
      p_cursor_id => '34000000-0000-4000-8000-000000000001',
      p_page_size => 1
    )
  ),
  0::bigint,
  'invalid salary cursors fail closed with no page'
);

select lives_ok(
  $$
    select count(*)
    from public.search_jobs(
      p_sort_key => 'newest',
      p_cursor_sort => '2026-99-99',
      p_cursor_time => now(),
      p_cursor_id => '34000000-0000-4000-8000-000000000001',
      p_page_size => 1
    )
  $$,
  'invalid calendar-date cursors never reach a date cast'
);
select is(
  (
    select count(*)
    from public.search_jobs(
      p_sort_key => 'newest',
      p_cursor_sort => '2026-99-99',
      p_cursor_time => now(),
      p_cursor_id => '34000000-0000-4000-8000-000000000001',
      p_page_size => 1
    )
  ),
  0::bigint,
  'invalid newest cursors fail closed with no page'
);

insert into public.jobs (
  id, tracking_key, legacy_identity_key, title, company, primary_source,
  primary_apply_url, sort_date, first_seen_at, last_seen_at, last_checked_at, is_active
) values
  (
    '34000000-0000-4000-8000-000000000001',
    '34000000-0000-4000-8000-000000000011',
    'cursor-one', 'Cursor One', 'Fixture', 'cursor-fixture',
    'https://example.com/cursor-one', current_date - 2, date_trunc('second', now()), now(), now(), true
  ),
  (
    '34000000-0000-4000-8000-000000000002',
    '34000000-0000-4000-8000-000000000012',
    'cursor-two', 'Cursor Two', 'Fixture', 'cursor-fixture',
    'https://example.com/cursor-two', current_date, date_trunc('second', now()), now(), now(), true
  ),
  (
    '34000000-0000-4000-8000-000000000003',
    '34000000-0000-4000-8000-000000000013',
    'cursor-three', 'Cursor Three', 'Fixture', 'cursor-fixture',
    'https://example.com/cursor-three', current_date - 1, date_trunc('second', now()), now(), now(), true
  );

select results_eq(
  $$
    select id::text
    from public.search_jobs(
      p_tracking_keys => array[
        '34000000-0000-4000-8000-000000000011'::uuid,
        '34000000-0000-4000-8000-000000000012'::uuid,
        '34000000-0000-4000-8000-000000000013'::uuid
      ],
      p_sort_key => 'newest'
    )
  $$,
  array[
    '34000000-0000-4000-8000-000000000002',
    '34000000-0000-4000-8000-000000000003',
    '34000000-0000-4000-8000-000000000001'
  ]::text[],
  'newest sort follows source posting date before first-seen tie breakers'
);

select results_eq(
  $$
    select id::text
    from public.search_jobs(
      p_tracking_keys => array[
        '34000000-0000-4000-8000-000000000011'::uuid,
        '34000000-0000-4000-8000-000000000012'::uuid,
        '34000000-0000-4000-8000-000000000013'::uuid
      ],
      p_sort_key => 'featured',
      p_cursor_sort => '1',
      p_cursor_time => (
        select first_seen_at
        from public.jobs
        where id = '34000000-0000-4000-8000-000000000003'
      ),
      p_cursor_id => '34000000-0000-4000-8000-000000000003',
      p_page_size => 1
    )
  $$,
  array['34000000-0000-4000-8000-000000000002']::text[],
  'keyset pagination resumes strictly after the composite cursor'
);
select is(
  public.count_jobs(
    p_tracking_keys => array[
      '34000000-0000-4000-8000-000000000011'::uuid,
      '34000000-0000-4000-8000-000000000012'::uuid,
      '34000000-0000-4000-8000-000000000013'::uuid
    ]
  ),
  3::bigint,
  'count_jobs returns the full filtered count independently of page size'
);

insert into app_meta.job_url_aliases (url_hash, job_id)
values (
  repeat('9', 64),
  '34000000-0000-4000-8000-000000000001'
);
set local role anon;
select results_eq(
  $$
    select url_hash, tracking_key
    from public.resolve_job_url_aliases(array[repeat('9', 64)])
  $$,
  $$
    values (
      repeat('9', 64)::text,
      '34000000-0000-4000-8000-000000000011'::uuid
    )
  $$,
  'public digest-only alias resolution maps URLs to immutable tracking keys'
);
select throws_ok(
  $$
    select *
    from public.resolve_job_url_aliases(array['INVALID'])
  $$,
  '22023',
  'URL hashes must be lowercase SHA-256 digests',
  'public alias resolution rejects malformed digests'
);
select throws_ok(
  $$
    select *
    from public.resolve_job_url_aliases(
      array(
        select lpad(to_hex(value), 64, '0')
        from generate_series(1, 101) as values(value)
      )
    )
  $$,
  '22023',
  'at most 100 URL hashes may be resolved at once',
  'public alias resolution enforces the database-side request cap'
);
reset role;

select * from finish();
rollback;

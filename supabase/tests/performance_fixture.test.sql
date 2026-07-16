begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(8);

select is(
  (
    select count(*)
    from public.jobs
    where legacy_identity_key like 'performance-fixture|%'
  ),
  3000::bigint,
  'local seed contains 3,000 canonical performance fixtures'
);

select is(
  (
    select count(*)
    from public.job_sources
    where source = 'performance-fixture'
  ),
  3000::bigint,
  'every performance fixture retains a source observation'
);

select is(
  (
    select count(*)
    from public.search_jobs(
      p_role_type => 'internship',
      p_query => 'performance fixture',
      p_page_size => 60
    )
  ),
  60::bigint,
  'the largest public page remains capped at 60 rows'
);

select is(
  public.count_jobs(
    p_role_type => 'internship',
    p_query => 'performance fixture'
  ),
  2500::bigint,
  'filtered totals are independent of the page cap across 3,000 fixtures'
);

select is(
  public.count_jobs(
    p_role_type => 'internship',
    p_location_ids => array_fill('denver-co'::text, array[26])
  ),
  0::bigint,
  'direct count RPC calls fail closed above the location-array cap'
);

select is(
  public.count_jobs(
    p_role_type => 'internship',
    p_term_keys => array_fill('summer-2027'::text, array[21])
  ),
  0::bigint,
  'direct count RPC calls fail closed above the term-array cap'
);

select throws_ok(
  $$
    update public.jobs
    set term_keys = array['fall-2026,summer-2027']
    where id = (
      select id
      from public.jobs
      where legacy_identity_key like 'performance-fixture|%'
      limit 1
    )
  $$,
  '23514',
  'new row for relation "jobs" violates check constraint "jobs_term_keys_valid"',
  'term constraints validate every array element independently'
);

select is(
  public.count_jobs(
    p_role_type => 'internship',
    p_tracking_keys => array(
      select gen_random_uuid() from generate_series(1, 501)
    )
  ),
  0::bigint,
  'direct count RPC calls fail closed above the tracking-key cap'
);

select * from finish();
rollback;

-- Normalize explicit internship terms without guessing from posting dates or
-- bare years. Empty arrays intentionally mean the source did not provide
-- enough evidence to classify the work term.

alter table public.internships
  add column if not exists term_keys text[] not null default '{}';
alter table public.jobs
  add column if not exists term_keys text[] not null default '{}';
alter table public.job_sources
  add column if not exists term_keys text[] not null default '{}';

update public.internships
set term_keys = array[replace(lower(btrim(season)), ' ', '-')]
where cardinality(term_keys) = 0
  and lower(btrim(coalesce(season, '')))
    ~ '^(winter|spring|summer|fall)[[:space:]]+20[0-9]{2}$';

update public.job_sources
set term_keys = array[replace(lower(btrim(season)), ' ', '-')]
where cardinality(term_keys) = 0
  and lower(btrim(coalesce(season, '')))
    ~ '^(winter|spring|summer|fall)[[:space:]]+20[0-9]{2}$';

update public.jobs as job
set term_keys = coalesce((
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
    select distinct unnest(source.term_keys) as value
    from public.job_sources as source
    where source.job_id = job.id and source.active
    union
    select distinct unnest(job.term_keys) as value
  ) as term
), case
  when lower(btrim(coalesce(job.season, '')))
    ~ '^(winter|spring|summer|fall)[[:space:]]+20[0-9]{2}$'
  then array[replace(lower(btrim(job.season)), ' ', '-')]
  else '{}'::text[]
end);

do $term_constraints$
declare
  target regclass;
  constraint_name text;
begin
  foreach target in array array[
    'public.internships'::regclass,
    'public.jobs'::regclass,
    'public.job_sources'::regclass
  ] loop
    constraint_name := replace(target::text, '.', '_') || '_term_keys_valid';
    if not exists (
      select 1
      from pg_catalog.pg_constraint
      where conrelid = target and conname = constraint_name
    ) then
      execute format(
        'alter table %s add constraint %I check (
          cardinality(term_keys) <= 20
          and array_position(term_keys, null) is null
          and (
            cardinality(term_keys) = 0
            or array_to_string(term_keys, '''')
              ~ ''^((winter|spring|summer|fall)-20[0-9]{2})*$''
          )
        )',
        target,
        constraint_name
      );
    end if;
  end loop;
end;
$term_constraints$;

create index if not exists jobs_active_term_keys_idx
  on public.jobs using gin (term_keys)
  where is_active and role_type = 'internship';

create or replace view public.job_term_facets
with (security_invoker = true)
as
with current_jobs as (
  select job.id, job.role_type, job.term_keys
  from public.jobs as job
  where job.is_active
    and coalesce(job.posted_date, job.first_seen_at::date) >= current_date - 120
), classified as (
  select current_job.id as job_id, current_job.role_type, term.value as id
  from current_jobs as current_job
  cross join lateral unnest(current_job.term_keys) as term(value)
  union all
  select current_job.id, current_job.role_type, 'not-listed'::text
  from current_jobs as current_job
  where cardinality(current_job.term_keys) = 0
)
select classified.role_type, classified.id, count(distinct classified.job_id)::bigint as job_count
from classified
group by classified.role_type, classified.id;

revoke all on public.job_term_facets from public;
grant select on public.job_term_facets to anon, authenticated, service_role;

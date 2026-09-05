-- Keep raw jobs and source history; persist the canonical membership and old URLs.
create table app_meta.canonical_job_groups (
  canonical_id text primary key check (canonical_id ~ '^job_[0-9a-f]{16}$'),
  created_at timestamptz not null default clock_timestamp()
);
create table app_meta.canonical_job_members (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  canonical_id text not null references app_meta.canonical_job_groups(canonical_id)
);
create index canonical_job_members_group_idx on app_meta.canonical_job_members(canonical_id);
create table app_meta.canonical_job_aliases (
  alias_id text primary key check(alias_id ~ '^job_[0-9a-f]{16}$'),
  canonical_id text not null references app_meta.canonical_job_groups(canonical_id)
);
create index canonical_job_aliases_group_idx on app_meta.canonical_job_aliases(canonical_id);
alter table app_meta.canonical_job_groups enable row level security;
alter table app_meta.canonical_job_members enable row level security;
alter table app_meta.canonical_job_aliases enable row level security;
revoke all on app_meta.canonical_job_groups,app_meta.canonical_job_members,app_meta.canonical_job_aliases from public,anon,authenticated;
grant select on app_meta.canonical_job_groups,app_meta.canonical_job_members,app_meta.canonical_job_aliases to service_role;

create or replace function public.record_canonical_job_groups(p_groups jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare g jsonb; v_canonical text; v_alias text; v_job uuid; v_count int:=0;
begin
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>100 then raise exception 'Use a batch of at most 100 groups'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timley-canonical-registry',0));
  for g in select value from jsonb_array_elements(p_groups) loop
    v_canonical:=g->>'canonicalId';
    if v_canonical is null or v_canonical !~ '^job_[0-9a-f]{16}$'
      or jsonb_typeof(g->'sourceIds') is distinct from 'array' or jsonb_array_length(g->'sourceIds') not between 1 and 100
      or jsonb_typeof(g->'aliases') is distinct from 'array' or jsonb_array_length(g->'aliases')>200 then raise exception 'Invalid canonical group'; end if;
    insert into app_meta.canonical_job_groups(canonical_id) values(v_canonical) on conflict do nothing;
    for v_job in select value::uuid from jsonb_array_elements_text(g->'sourceIds') loop
      if exists(select 1 from app_meta.canonical_job_members where job_id=v_job and canonical_id<>v_canonical) then raise exception 'Membership conflict requires an explicit reviewed merge'; end if;
      insert into app_meta.canonical_job_members(job_id,canonical_id) values(v_job,v_canonical) on conflict do nothing;
    end loop;
    for v_alias in select value from jsonb_array_elements_text((g->'aliases')||jsonb_build_array(v_canonical)) loop
      if exists(select 1 from app_meta.canonical_job_aliases where alias_id=v_alias and canonical_id<>v_canonical) then raise exception 'Alias conflict requires review'; end if;
      insert into app_meta.canonical_job_aliases(alias_id,canonical_id) values(v_alias,v_canonical) on conflict do nothing;
    end loop;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.record_canonical_job_groups(jsonb) from public,anon,authenticated;
grant execute on function public.record_canonical_job_groups(jsonb) to service_role;

-- Only resolve requested opaque IDs to active publicly visible jobs, at most 100.
create or replace function public.resolve_public_job_ids(p_ids text[])
returns table(requested_id text,job_ids uuid[]) language sql stable security definer set search_path='' as $$
  select a.alias_id,array_agg(m.job_id order by m.job_id)
  from app_meta.canonical_job_aliases a
  join app_meta.canonical_job_members m using(canonical_id)
  join public.jobs j on j.id=m.job_id
  where cardinality(p_ids)<=100 and a.alias_id=any(p_ids) and j.is_active
    and j.country_code='US' and coalesce(j.posted_date,j.first_seen_at::date)>=current_date-120
  group by a.alias_id;
$$;
revoke all on function public.resolve_public_job_ids(text[]) from public;
grant execute on function public.resolve_public_job_ids(text[]) to anon,authenticated,service_role;

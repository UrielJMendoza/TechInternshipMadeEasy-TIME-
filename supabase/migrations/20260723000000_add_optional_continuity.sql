create table if not exists public.timley_continuity_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  snapshot_version integer not null check (snapshot_version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.timley_continuity_snapshots enable row level security;

revoke all privileges
  on table public.timley_continuity_snapshots
  from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on table public.timley_continuity_snapshots
  to authenticated;
grant select, insert, update, delete
  on table public.timley_continuity_snapshots
  to service_role;

drop policy if exists "Continuity snapshots are owner-readable"
  on public.timley_continuity_snapshots;
create policy "Continuity snapshots are owner-readable"
  on public.timley_continuity_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Continuity snapshots are owner-creatable"
  on public.timley_continuity_snapshots;
create policy "Continuity snapshots are owner-creatable"
  on public.timley_continuity_snapshots
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Continuity snapshots are owner-updatable"
  on public.timley_continuity_snapshots;
create policy "Continuity snapshots are owner-updatable"
  on public.timley_continuity_snapshots
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Continuity snapshots are owner-deletable"
  on public.timley_continuity_snapshots;
create policy "Continuity snapshots are owner-deletable"
  on public.timley_continuity_snapshots
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_timley_continuity_snapshot_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all
  on function public.set_timley_continuity_snapshot_updated_at()
  from public, anon;
grant execute
  on function public.set_timley_continuity_snapshot_updated_at()
  to authenticated, service_role;

drop trigger if exists set_timley_continuity_snapshot_updated_at
  on public.timley_continuity_snapshots;
create trigger set_timley_continuity_snapshot_updated_at
  before insert or update
  on public.timley_continuity_snapshots
  for each row
  execute function public.set_timley_continuity_snapshot_updated_at();

create or replace function public.read_timley_continuity_snapshot_categories(
  p_expected_user_id uuid,
  p_selected_categories text[]
)
returns table (
  snapshot_version integer,
  snapshot jsonb,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or (select auth.uid()) <> p_expected_user_id then
    raise exception 'continuity account mismatch'
      using errcode = '42501';
  end if;

  if p_selected_categories is null
    or exists (
      select 1
      from unnest(p_selected_categories) as selected(category)
      where selected.category <> all (
        array[
          'savedJobs',
          'applications',
          'filters',
          'savedSearches'
        ]::text[]
      )
    ) then
    raise exception 'invalid continuity category selection'
      using errcode = '22023';
  end if;

  return query
  select
    continuity.snapshot_version,
    (continuity.snapshot - 'categories')
      || jsonb_build_object(
        'categories',
        coalesce(
          (
            select jsonb_object_agg(category.key, category.value)
            from jsonb_each(
              case
                when jsonb_typeof(
                  continuity.snapshot -> 'categories'
                ) = 'object'
                  then continuity.snapshot -> 'categories'
                else '{}'::jsonb
              end
            ) as category
            where category.key = any(p_selected_categories)
          ),
          '{}'::jsonb
        )
      ),
    continuity.updated_at
  from public.timley_continuity_snapshots as continuity
  where continuity.user_id = p_expected_user_id;
end;
$$;

revoke all
  on function public.read_timley_continuity_snapshot_categories(
    uuid,
    text[]
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.read_timley_continuity_snapshot_categories(
    uuid,
    text[]
  )
  to authenticated, service_role;

create or replace function public.patch_timley_continuity_snapshot_categories(
  p_expected_user_id uuid,
  p_selected_categories text[],
  p_snapshot_version integer,
  p_snapshot_patch jsonb
)
returns table (
  snapshot_version integer,
  snapshot jsonb,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or (select auth.uid()) <> p_expected_user_id then
    raise exception 'continuity account mismatch'
      using errcode = '42501';
  end if;

  if p_selected_categories is null
    or exists (
      select 1
      from unnest(p_selected_categories) as selected(category)
      where selected.category <> all (
        array[
          'savedJobs',
          'applications',
          'filters',
          'savedSearches'
        ]::text[]
      )
    ) then
    raise exception 'invalid continuity category selection'
      using errcode = '22023';
  end if;

  if p_snapshot_version is null
    or p_snapshot_version < 1
    or p_snapshot_patch is null
    or jsonb_typeof(p_snapshot_patch) <> 'object'
    or jsonb_typeof(p_snapshot_patch -> 'categories') <> 'object'
    or exists (
      select 1
      from jsonb_object_keys(
        p_snapshot_patch -> 'categories'
      ) as patched(category)
      where patched.category <> all(p_selected_categories)
    ) then
    raise exception 'invalid continuity snapshot patch'
      using errcode = '22023';
  end if;

  return query
  with upserted as (
    insert into public.timley_continuity_snapshots (
      user_id,
      snapshot_version,
      snapshot
    )
    values (
      p_expected_user_id,
      p_snapshot_version,
      p_snapshot_patch
    )
    on conflict (user_id) do update
    set
      snapshot_version = excluded.snapshot_version,
      snapshot =
        (
          public.timley_continuity_snapshots.snapshot
            - 'categories'
        )
        || (excluded.snapshot - 'categories')
        || jsonb_build_object(
          'categories',
          (
            case
              when jsonb_typeof(
                public.timley_continuity_snapshots.snapshot
                  -> 'categories'
              ) = 'object'
                then public.timley_continuity_snapshots.snapshot
                  -> 'categories'
              else '{}'::jsonb
            end
          )
          || (excluded.snapshot -> 'categories')
        )
    returning
      public.timley_continuity_snapshots.snapshot_version,
      public.timley_continuity_snapshots.snapshot,
      public.timley_continuity_snapshots.updated_at
  )
  select
    upserted.snapshot_version,
    (upserted.snapshot - 'categories')
      || jsonb_build_object(
        'categories',
        coalesce(
          (
            select jsonb_object_agg(category.key, category.value)
            from jsonb_each(
              upserted.snapshot -> 'categories'
            ) as category
            where category.key = any(p_selected_categories)
          ),
          '{}'::jsonb
        )
      ),
    upserted.updated_at
  from upserted;
end;
$$;

revoke all
  on function public.patch_timley_continuity_snapshot_categories(
    uuid,
    text[],
    integer,
    jsonb
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.patch_timley_continuity_snapshot_categories(
    uuid,
    text[],
    integer,
    jsonb
  )
  to authenticated, service_role;

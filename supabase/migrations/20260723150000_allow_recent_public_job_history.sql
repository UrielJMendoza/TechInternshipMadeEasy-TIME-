-- Prompt 7 public company and stable job-detail pages may show a bounded
-- history of listings recently removed from a successfully refreshed source.
-- These rows contain public job observations only; old expired observations
-- and every user-owned continuity row remain inaccessible.

create index if not exists internships_recent_closed_public_idx
  on public.internships (closed_at desc, id)
  where is_active is false and closed_at is not null;

drop policy if exists "Recent removed listings are publicly readable"
  on public.internships;

create policy "Recent removed listings are publicly readable"
  on public.internships
  for select
  to anon
  using (
    is_active is false
    and location_eligible is true
    and closed_at is not null
    and closed_at >= current_timestamp - interval '90 days'
  );

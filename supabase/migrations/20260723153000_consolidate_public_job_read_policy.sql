-- Keep the current and bounded recent-history read rules in one permissive
-- policy. This preserves the existing active-row boundary while avoiding two
-- policies being evaluated for every public listing read.

drop policy if exists "public read active internships"
  on public.internships;

drop policy if exists "Recent removed listings are publicly readable"
  on public.internships;

create policy "Public read current and recent internships"
  on public.internships
  for select
  to anon, authenticated
  using (
    (
      is_active is true
      and location_eligible is true
      and coalesce(posted_date, first_seen_at::date) >= current_date - 120
    )
    or
    (
      is_active is false
      and location_eligible is true
      and closed_at is not null
      and closed_at >= current_timestamp - interval '90 days'
    )
  );

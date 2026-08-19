-- Support the view's stable identifier and the three bounded read patterns
-- used by the public Next.js cache.
create unique index if not exists jobs_effective_public_id_key
  on public.jobs ((coalesce(public_id, id)));

create index if not exists jobs_public_feed_cursor_idx
  on public.jobs (first_seen_at desc, (coalesce(public_id, id)))
  where is_active;

create index if not exists jobs_public_category_cursor_idx
  on public.jobs (category, first_seen_at desc, (coalesce(public_id, id)))
  where is_active;

create index if not exists jobs_public_closed_cursor_idx
  on public.jobs (last_checked_at desc, (coalesce(public_id, id)))
  where not is_active;

drop index if exists public.jobs_public_id_key;

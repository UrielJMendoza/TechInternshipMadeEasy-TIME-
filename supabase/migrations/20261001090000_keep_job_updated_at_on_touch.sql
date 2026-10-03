-- Each import stamps last_seen_at, last_checked_at and updated_at on every
-- listing it sees, even when nothing a visitor can see has changed. The site
-- syncs incrementally on updated_at, so that churn made thousands of rows look
-- changed after every import window and pushed the delta over its per-sync
-- budget. Keep updated_at when an update only refreshes those observation
-- timestamps. Every other column change, including is_active, still moves it.
--
-- search_vector is a stored generated column. BEFORE triggers see it unset in
-- NEW, so it is excluded too; it is derived from compared columns.
create or replace function app_meta.keep_job_updated_at_on_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['updated_at', 'last_seen_at', 'last_checked_at', 'search_vector'])
     = (to_jsonb(old) - array['updated_at', 'last_seen_at', 'last_checked_at', 'search_vector']) then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function app_meta.keep_job_updated_at_on_touch() from public, anon, authenticated;

-- BEFORE triggers run in name order. The zz_ prefix makes this one run last,
-- after jobs_evidence_overlay has settled the final row.
drop trigger if exists jobs_zz_keep_updated_at_on_touch on public.jobs;
create trigger jobs_zz_keep_updated_at_on_touch
before update on public.jobs
for each row execute function app_meta.keep_job_updated_at_on_touch();

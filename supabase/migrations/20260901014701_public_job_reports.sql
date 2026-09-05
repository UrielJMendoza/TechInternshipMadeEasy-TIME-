alter table public.job_reports
  add column if not exists reporter_token uuid;

alter table public.job_reports
  alter column reporter_token set not null;

create unique index if not exists job_reports_one_per_browser_reason
  on public.job_reports (job_id, kind, reporter_token);

alter table public.job_reports enable row level security;

revoke all on table public.job_reports from anon, authenticated;
grant insert (job_id, kind, details, reporter_token)
  on table public.job_reports
  to anon, authenticated;

drop policy if exists public_create_job_report on public.job_reports;
create policy public_create_job_report
  on public.job_reports
  for insert
  to anon, authenticated
  with check (
    status = 'open'
    and resolved_at is null
    and exists (
      select 1
      from public.jobs as job
      where job.id = job_reports.job_id
        and job.is_active
    )
  );

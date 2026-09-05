-- Additive report operations; no public access to submissions or resolutions.
alter table public.job_reports drop constraint job_reports_kind_check;
alter table public.job_reports add constraint job_reports_kind_check check
  (kind in ('closed','duplicate','wrong_location','wrong_pay','wrong_logo','wrong_sponsorship','wrong_title'));
create index if not exists job_reports_reporter_created_idx on public.job_reports(reporter_token,created_at desc);
create index if not exists job_reports_created_idx on public.job_reports(created_at desc);
create table app_meta.job_report_resolutions (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.job_reports(id),
  previous_status text not null,
  status text not null check (status in ('resolved','dismissed')),
  actor text not null check (length(actor) between 1 and 120),
  resolution text not null check (length(resolution) between 10 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
alter table app_meta.job_report_resolutions enable row level security;
revoke all on app_meta.job_report_resolutions from public,anon,authenticated;
grant select,insert on app_meta.job_report_resolutions to service_role;

create or replace function app_meta.bound_job_report_intake() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('timley-report-intake',0));
  new.created_at := clock_timestamp();
  if exists (select 1 from public.job_reports where job_id=new.job_id and kind=new.kind and reporter_token=new.reporter_token) then
    raise unique_violation using message='Report already recorded';
  end if;
  if (select count(*) from public.job_reports where reporter_token=new.reporter_token and created_at>clock_timestamp()-interval '24 hours') >= 5
    or (select count(*) from public.job_reports where job_id=new.job_id and created_at>clock_timestamp()-interval '24 hours') >= 25
    or (select count(*) from public.job_reports where created_at>clock_timestamp()-interval '1 hour') >= 500 then
    raise exception 'Report limit reached' using errcode='P0001';
  end if;
  return new;
end $$;
revoke all on function app_meta.bound_job_report_intake() from public,anon,authenticated;
create trigger job_reports_bound_intake before insert on public.job_reports
  for each row execute function app_meta.bound_job_report_intake();

create or replace function public.resolve_job_report(p_report_id uuid,p_status text,p_actor text,p_resolution text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous text;
begin
  if p_status not in ('resolved','dismissed') or p_status is null
    or length(trim(p_actor)) not between 1 and 120 or p_actor is null
    or length(trim(p_resolution)) not between 10 and 2000 or p_resolution is null then
    raise exception 'A valid disposition, actor and evidence-based resolution are required';
  end if;
  select status into v_previous from public.job_reports where id=p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if v_previous <> 'open' then raise exception 'Report already resolved'; end if;
  insert into app_meta.job_report_resolutions(report_id,previous_status,status,actor,resolution)
    values(p_report_id,v_previous,p_status,trim(p_actor),trim(p_resolution));
  update public.job_reports set status=p_status,resolved_at=clock_timestamp() where id=p_report_id;
end $$;
revoke all on function public.resolve_job_report(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_job_report(uuid,text,text,text) to service_role;

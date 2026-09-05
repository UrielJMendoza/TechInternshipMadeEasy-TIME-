-- One observation per canonical employer job; stale facts are refreshed in small batches.
create or replace function public.employer_evidence_batch()
returns table(id uuid,primary_apply_url text,employer_evidence jsonb)
language sql stable security definer set search_path='' as $$
 with eligible as (
   select j.id,j.primary_apply_url,j.employer_evidence,j.employer_checked_at,j.first_seen_at,
     coalesce(m.canonical_id,j.id::text) as group_id
   from public.jobs j left join app_meta.canonical_job_members m on m.job_id=j.id
   where j.is_active and j.country_code='US' and coalesce(j.posted_date,j.first_seen_at::date)>=current_date-120
 ), due as (
   select group_id,max(employer_checked_at) as checked,max(first_seen_at) as discovered
   from eligible group by group_id
   having max(employer_checked_at) is null or max(employer_checked_at)<now()-interval '24 hours'
   order by checked nulls first,discovered desc,group_id limit 6
 )
 select choice.id,choice.primary_apply_url,choice.employer_evidence
 from due cross join lateral (
   select e.id,e.primary_apply_url,e.employer_evidence from eligible e where e.group_id=due.group_id
   order by (e.employer_evidence->>'status'='verified') desc nulls last,e.first_seen_at,e.id limit 1
 ) choice;
$$;
revoke all on function public.employer_evidence_batch() from public,anon,authenticated;
grant execute on function public.employer_evidence_batch() to service_role;

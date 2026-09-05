create or replace function app_meta.protect_verified_employer_facts()
returns trigger language plpgsql set search_path='' as $$
declare e jsonb := new.employer_evidence; checked timestamptz;
begin
  if e->>'status' is distinct from 'verified' or coalesce(e->>'contentHash','') !~ '^[a-f0-9]{64}$' then return new; end if;
  begin checked := (e->>'checkedAt')::timestamptz; exception when others then return new; end;
  if checked is null or checked > now() or checked < now()-interval '14 days' or
    split_part(split_part(e->>'sourceUrl','?',1),'#',1) is distinct from split_part(split_part(new.primary_apply_url,'?',1),'#',1) then return new; end if;
  if length(e->>'title') between 1 and 300 then new.title := e->>'title'; end if;
  new.sponsorship := case e->>'sponsorship' when 'Confirmed' then 'offers-sponsorship' when 'Not offered' then 'no-sponsorship' else null end;
  if length(e->>'compensation') between 1 and 500 then new.salary_raw := e->>'compensation'; end if;
  return new;
end;
$$;
revoke all on function app_meta.protect_verified_employer_facts() from public, anon, authenticated;
drop trigger if exists jobs_evidence_overlay on public.jobs;
create trigger jobs_evidence_overlay before insert or update on public.jobs for each row execute function app_meta.protect_verified_employer_facts();

revoke execute on function public.resolve_job_url_aliases(text[])
  from public, anon, authenticated;

grant execute on function public.resolve_job_url_aliases(text[])
  to service_role;

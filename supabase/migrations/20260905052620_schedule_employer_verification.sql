-- Six distinct employer jobs per invocation; fresh groups are skipped for 24 hours.
-- The Vault credential can only go to the existing Timley project's own function.
select cron.schedule('timley-employer-verification','*/2 * * * *',$request$
 select net.http_post(
   url := 'https://ogkocdharscqzdrnlpnq.supabase.co/functions/v1/enrich-employer-evidence',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || credential.decrypted_secret),
   body := '{"trigger":"scheduled-employer-verification"}'::jsonb,
   timeout_milliseconds := 60000
 )
 from vault.decrypted_secrets credential
 where credential.name='ingest_cron_secret'
   and exists(select 1 from vault.decrypted_secrets where name='ingest_function_url'
     and decrypted_secret='https://ogkocdharscqzdrnlpnq.supabase.co/functions/v1/ingest');
$request$);

-- Advance the expected version after a formatting-only artifact regeneration.
update app_meta.ingest_settings
set
  expected_ingest_code_version =
    '0ffb2548802a3044afc2e4fcc23b172c3e42e9e705660f33b9f828962ee29bfa',
  updated_at = clock_timestamp()
where singleton;

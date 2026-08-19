-- Keep production monitoring aligned with the reviewed Edge artifact released
-- alongside this migration. The checksum contains no credential material.
update app_meta.ingest_settings
set
  expected_ingest_code_version =
    '80b9901cb3ad6c519e92b8761112382c8e51ffb387430bed5f23eec9e112e403',
  updated_at = clock_timestamp()
where singleton;

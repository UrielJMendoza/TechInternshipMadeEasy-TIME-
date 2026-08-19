-- Sanitized local history marker.
--
-- Production already records migration version 20260710043141 under the name
-- `add_source_safe_ingest`. Its historical SQL is intentionally not replayed:
-- it contained the legacy ingestion path that this repository replaces. The
-- later, idempotent 20260712180000_production_hardening migration is the
-- authoritative clean-clone baseline and production upgrade.
--
-- This marker contains no credentials and performs no schema or data writes.
do $remote_history_marker$
begin
  null;
end;
$remote_history_marker$;

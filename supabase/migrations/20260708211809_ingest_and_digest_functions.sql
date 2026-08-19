-- Sanitized no-op marker for a migration version already recorded remotely.
-- Legacy SECURITY DEFINER ingestion functions are intentionally not replayed.
do $remote_history_marker$ begin null; end; $remote_history_marker$;

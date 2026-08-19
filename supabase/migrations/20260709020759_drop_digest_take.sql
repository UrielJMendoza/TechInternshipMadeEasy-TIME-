-- Sanitized no-op marker for a migration version already recorded remotely.
-- The authoritative baseline contains the final digest/function definitions.
do $remote_history_marker$ begin null; end; $remote_history_marker$;

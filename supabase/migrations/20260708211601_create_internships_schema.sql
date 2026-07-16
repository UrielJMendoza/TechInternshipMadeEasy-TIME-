-- Sanitized no-op marker for a migration version already recorded remotely.
-- The authoritative clean-clone schema is created by 20260712180000.
do $remote_history_marker$ begin null; end; $remote_history_marker$;

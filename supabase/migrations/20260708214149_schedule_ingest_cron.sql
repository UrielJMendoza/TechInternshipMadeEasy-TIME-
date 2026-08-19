-- Sanitized no-op marker for a migration version already recorded remotely.
-- The historical scheduler is not replayed; the hardened named job replaces it.
do $remote_history_marker$ begin null; end; $remote_history_marker$;

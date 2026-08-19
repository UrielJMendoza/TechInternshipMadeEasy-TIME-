-- Sanitized no-op marker for a migration version already recorded remotely.
-- The authoritative baseline creates the final confidence-gated domain fields.
do $remote_history_marker$ begin null; end; $remote_history_marker$;

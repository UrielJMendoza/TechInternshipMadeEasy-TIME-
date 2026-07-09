/**
 * Extract the cron secret from a trigger request: a Bearer token (what Vercel
 * Cron sends when a CRON_SECRET env var is configured) or a ?key= query param
 * (used by pg_cron and manual curl). The caller must always present it —
 * falling back to the server's own env var would let anyone trigger ingestion
 * unauthenticated.
 *
 * The value is never validated here — it's forwarded to the ingest_upsert
 * Postgres function, which compares it against the secret stored in the
 * app_meta table. Postgres is the single source of truth.
 */
export function requestSecret(req: Request): string | null {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice("Bearer ".length);
  return new URL(req.url).searchParams.get("key");
}

export function isUnauthorized(message: string): boolean {
  return message.toLowerCase().includes("unauthorized");
}

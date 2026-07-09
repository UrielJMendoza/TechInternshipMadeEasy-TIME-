/**
 * Extract the cron secret from a trigger request: a Bearer token (what Vercel
 * Cron sends when a CRON_SECRET env var is configured), a ?key= query param
 * (used by pg_cron and manual curl), or the CRON_SECRET env var itself.
 *
 * The value is never validated here — it's forwarded to the ingest_upsert
 * Postgres function, which compares it against the secret stored in the
 * app_meta table. Postgres is the single source of truth.
 */
export function requestSecret(req: Request): string | null {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice("Bearer ".length);
  return new URL(req.url).searchParams.get("key") ?? process.env.CRON_SECRET ?? null;
}

export function isUnauthorized(message: string): boolean {
  return message.toLowerCase().includes("unauthorized");
}

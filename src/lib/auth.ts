/**
 * Cron/manual trigger auth: accepts the secret as a Bearer token (what
 * Vercel Cron sends when a CRON_SECRET env var exists) or as a ?key= query
 * param (handy for pg_cron and manual curl).
 */
export function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("key") === secret;
}

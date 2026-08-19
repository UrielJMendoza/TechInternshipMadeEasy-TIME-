import { createHash, timingSafeEqual } from "node:crypto";

const MAX_CRON_SECRET_LENGTH = 512;

function boundedSecret(value: string | null): string | null {
  if (!value || value.length > MAX_CRON_SECRET_LENGTH) return null;
  return value;
}

/**
 * Extract a bounded secret from an Authorization Bearer token. Secrets are deliberately
 * rejected in query strings because URLs can be copied into browser history,
 * access logs, referrer data, and monitoring tools.
 *
 * Callers must validate the returned value before performing remote work.
 */
export function requestSecret(req: Request): string | null {
  const bearer = req.headers.get("authorization");
  const match = bearer?.match(/^Bearer ([^\s]+)$/i);
  if (match) return boundedSecret(match[1]);
  return null;
}

/** Constant-time comparison keeps rejected trigger requests cheap and quiet. */
export function secretsMatch(
  presented: string,
  expected: string | undefined,
): boolean {
  if (
    !presented ||
    presented.length > MAX_CRON_SECRET_LENGTH ||
    !expected ||
    expected.length > MAX_CRON_SECRET_LENGTH
  ) {
    return false;
  }
  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

export function isUnauthorized(message: string): boolean {
  return message.toLowerCase().includes("unauthorized");
}

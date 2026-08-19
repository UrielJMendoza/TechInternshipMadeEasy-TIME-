import { runtimeEnv } from "./runtimeEnv.ts";

const BEARER_PREFIX = "Bearer ";
const MAX_TOKEN_LENGTH = 512;

/**
 * Read an opaque cron credential from Authorization only. Query-string
 * credentials are deliberately unsupported because URLs are commonly logged.
 */
export function requestBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(BEARER_PREFIX)) return null;

  const token = header.slice(BEARER_PREFIX.length);
  if (!token || token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) return null;
  return token;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

/** Compare fixed-length digests without an early-exit mismatch branch. */
export async function timingSafeEqualText(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedDigest, expectedDigest] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);

  let difference = 0;
  for (let index = 0; index < expectedDigest.length; index += 1) {
    difference |= providedDigest[index] ^ expectedDigest[index];
  }
  return difference === 0;
}

/**
 * Fail closed when the server secret is missing. This function performs no
 * network or database work and is safe to call before importing adapters.
 */
export async function authorizeCronRequest(
  request: Request,
  expectedSecret = runtimeEnv("CRON_SECRET"),
): Promise<boolean> {
  if (!expectedSecret || expectedSecret.length > MAX_TOKEN_LENGTH) return false;
  const provided = requestBearerToken(request);
  if (!provided) return false;
  return timingSafeEqualText(provided, expectedSecret);
}

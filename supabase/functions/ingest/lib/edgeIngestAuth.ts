import { requestBearerToken } from "./auth.ts";
import { serviceSupabase } from "./supabase.server.ts";

export type IngestTokenValidator = (providedDigest: string) => Promise<boolean>;

const VAULT_TOKEN = /^[0-9a-f]{64}$/;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function validateWithVault(providedDigest: string): Promise<boolean> {
  const { data, error } = await serviceSupabase().rpc(
    "authorize_ingest_request",
    { provided_digest: providedDigest },
  );
  return !error && data === true;
}

/**
 * Validate the Edge scheduler credential without duplicating it into runtime
 * configuration. Vault remains the single source of truth, and malformed
 * requests are rejected before a database client is initialized.
 */
export async function authorizeEdgeIngestRequest(
  request: Request,
  validate: IngestTokenValidator = validateWithVault,
): Promise<boolean> {
  const token = requestBearerToken(request);
  if (!token || !VAULT_TOKEN.test(token)) return false;

  try {
    return await validate(await sha256Hex(token));
  } catch {
    return false;
  }
}

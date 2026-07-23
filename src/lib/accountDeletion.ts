import {
  ACCOUNT_DELETION_EXPECTED_USER_HEADER,
  isSafeSupabasePublicKey,
} from "./continuityProvider";

export { ACCOUNT_DELETION_EXPECTED_USER_HEADER };

const MAX_BEARER_TOKEN_LENGTH = 8_192;
const MAX_SERVER_KEY_LENGTH = 16_384;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccountDeletionEnvironment {
  enabled?: unknown;
  supabaseUrl?: unknown;
  supabasePublishableKey?: unknown;
  supabaseAnonKey?: unknown;
  supabaseServiceRoleKey?: unknown;
}

export type AccountDeletionConfig =
  | {
      kind: "configured";
      url: string;
      publicKey: string;
      serviceRoleKey: string;
    }
  | {
      kind: "unavailable";
      reason: "disabled" | "invalid_configuration";
    };

export interface AccountDeletionOperations {
  getUser(
    token: string,
  ): Promise<{
    data: { user: { id: string } | null };
    error: unknown | null;
  }>;
  signOut(
    token: string,
    scope: "global",
  ): Promise<{ error: unknown | null }>;
  deleteUser(userId: string): Promise<{ error: unknown | null }>;
}

export type AccountDeletionResult =
  | { ok: true }
  | { ok: false; code: "unauthorized" | "unavailable" };

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSupabaseUrl(value: unknown): string | null {
  const raw = trimmedString(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const localHttpHost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && localHttpHost)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function decodeJwtRole(value: string): string | null {
  const payload = value.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded =
      typeof globalThis.atob === "function"
        ? globalThis.atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);
    return typeof parsed === "object" &&
      parsed !== null &&
      "role" in parsed &&
      typeof parsed.role === "string"
      ? parsed.role
      : null;
  } catch {
    return null;
  }
}

function isServerServiceRoleKey(
  value: unknown,
  publicKey: string,
): value is string {
  const key = trimmedString(value);
  if (
    !key ||
    key === publicKey ||
    key.length > MAX_SERVER_KEY_LENGTH ||
    /[\u0000-\u001f\u007f\s]/.test(key) ||
    key.startsWith("sb_publishable_")
  ) {
    return false;
  }
  return key.startsWith("sb_secret_") || decodeJwtRole(key) === "service_role";
}

/**
 * Resolve server configuration without importing the public-job client's
 * hard-coded fallback credentials.
 */
export function resolveAccountDeletionConfig(
  environment: AccountDeletionEnvironment,
): AccountDeletionConfig {
  if (trimmedString(environment.enabled) !== "true") {
    return { kind: "unavailable", reason: "disabled" };
  }

  const url = normalizeSupabaseUrl(environment.supabaseUrl);
  const publicKeyCandidates = [
    environment.supabasePublishableKey,
    environment.supabaseAnonKey,
  ];
  const publicKey = publicKeyCandidates.find(isSafeSupabasePublicKey);
  if (
    !url ||
    !publicKey ||
    !isServerServiceRoleKey(
      environment.supabaseServiceRoleKey,
      publicKey,
    )
  ) {
    return { kind: "unavailable", reason: "invalid_configuration" };
  }

  return {
    kind: "configured",
    url,
    publicKey: trimmedString(publicKey),
    serviceRoleKey: trimmedString(
      environment.supabaseServiceRoleKey,
    ),
  };
}

export function parseBearerToken(
  authorization: string | null,
): string | null {
  if (
    !authorization ||
    authorization.length > MAX_BEARER_TOKEN_LENGTH + 7
  ) {
    return null;
  }
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(authorization);
  const token = match?.[1] ?? "";
  return token && token.length <= MAX_BEARER_TOKEN_LENGTH
    ? token
    : null;
}

function validatedUserId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value
    : null;
}

/**
 * Validate the caller before invoking any privileged operation. Refresh
 * sessions are revoked globally before the validated Auth user is deleted.
 */
export async function deleteValidatedAccount(
  token: string,
  expectedUserId: string,
  operations: AccountDeletionOperations,
): Promise<AccountDeletionResult> {
  try {
    const normalizedExpectedUserId =
      validatedUserId(expectedUserId);
    if (!normalizedExpectedUserId) {
      return { ok: false, code: "unauthorized" };
    }
    const validation = await operations.getUser(token);
    const userId = validatedUserId(validation.data.user?.id);
    if (
      validation.error ||
      !userId ||
      userId !== normalizedExpectedUserId
    ) {
      return { ok: false, code: "unauthorized" };
    }

    const revocation = await operations.signOut(token, "global");
    if (revocation.error) {
      return { ok: false, code: "unavailable" };
    }

    const deletion = await operations.deleteUser(userId);
    return deletion.error
      ? { ok: false, code: "unavailable" }
      : { ok: true };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { SyncSelection } from "./continuitySnapshot";

const CONTINUITY_AUTH_STORAGE_KEY = "timley:continuity:auth:v1";
const READ_CONTINUITY_RPC =
  "read_timley_continuity_snapshot_categories";
const PATCH_CONTINUITY_RPC =
  "patch_timley_continuity_snapshot_categories";
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 4_096;
const MAX_EXPECTED_USER_ID_LENGTH = 256;
const CONTINUITY_CATEGORY_NAMES = [
  "savedJobs",
  "applications",
  "filters",
  "savedSearches",
] as const;

export const MAX_CONTINUITY_SNAPSHOT_LENGTH = 2_000_000;
export const ACCOUNT_DELETION_EXPECTED_USER_HEADER =
  "x-timley-expected-user-id";

export type ContinuityProviderKind = "supabase" | "unavailable";

export type ContinuityAuthEvent =
  | "INITIAL_SESSION"
  | "PASSWORD_RECOVERY"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "MFA_CHALLENGE_VERIFIED";

export type ContinuityErrorCode =
  | "already_registered"
  | "conflict"
  | "email_not_confirmed"
  | "invalid_configuration"
  | "invalid_credentials"
  | "invalid_input"
  | "invalid_snapshot"
  | "network"
  | "not_authenticated"
  | "provider_error"
  | "rate_limited"
  | "server_error"
  | "unavailable"
  | "weak_password";

export interface ContinuityError {
  code: ContinuityErrorCode;
  message: string;
  retryable: boolean;
}

export type ContinuityResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ContinuityError };

export interface ContinuityUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
}

export interface ContinuitySession {
  user: ContinuityUser;
  expiresAt: number | null;
}

export interface ContinuityAuthState {
  event: ContinuityAuthEvent;
  session: ContinuitySession | null;
}

export interface ContinuityAuthOutcome {
  user: ContinuityUser | null;
  session: ContinuitySession | null;
  confirmationRequired: boolean;
}

export interface ContinuityEmailPasswordInput {
  email: string;
  password: string;
  redirectTo?: string;
}

export interface ContinuityEmailInput {
  email: string;
  redirectTo?: string;
}

export interface ContinuityPasswordInput {
  password: string;
}

export interface ContinuitySnapshotInput<T = unknown> {
  version: number;
  data: T;
}

export interface ContinuitySnapshot<T = unknown>
  extends ContinuitySnapshotInput<T> {
  updatedAt: string;
}

export interface ContinuitySnapshotAccessInput {
  expectedUserId: string;
  selection: SyncSelection;
}

export interface ContinuitySnapshotWriteInput<T = unknown>
  extends ContinuitySnapshotInput<T>,
    ContinuitySnapshotAccessInput {}

export interface ContinuityProviderCapabilities {
  accountDeletion: boolean;
  emailPasswordAuth: boolean;
  passwordRecovery: boolean;
  session: boolean;
  snapshotSync: boolean;
}

export interface ContinuityProviderAdapter {
  readonly kind: ContinuityProviderKind;
  readonly available: boolean;
  readonly capabilities: Readonly<ContinuityProviderCapabilities>;

  getSession(): Promise<ContinuityResult<ContinuitySession | null>>;
  onAuthStateChange(
    listener: (state: ContinuityAuthState) => void,
  ): () => void;
  signUp(
    input: ContinuityEmailPasswordInput,
  ): Promise<ContinuityResult<ContinuityAuthOutcome>>;
  signIn(
    input: ContinuityEmailPasswordInput,
  ): Promise<ContinuityResult<ContinuityAuthOutcome>>;
  signOut(): Promise<ContinuityResult<void>>;
  resendSignUpVerification(
    input: ContinuityEmailInput,
  ): Promise<ContinuityResult<void>>;
  sendPasswordReset(
    input: ContinuityEmailInput,
  ): Promise<ContinuityResult<void>>;
  updatePassword(
    input: ContinuityPasswordInput,
  ): Promise<ContinuityResult<ContinuityUser>>;
  readSnapshot<T = unknown>(
    input: ContinuitySnapshotAccessInput,
  ): Promise<
    ContinuityResult<ContinuitySnapshot<T> | null>
  >;
  upsertSnapshot<T = unknown>(
    input: ContinuitySnapshotWriteInput<T>,
  ): Promise<ContinuityResult<ContinuitySnapshot<T>>>;
  deleteAccount(expectedUserId: string): Promise<ContinuityResult<void>>;
}

export interface ContinuityProviderEnvironment {
  accountDeletionAvailable?: string;
  provider?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabasePublishableKey?: string;
}

export type ContinuityProviderUnavailableReason =
  | "disabled"
  | "invalid_url"
  | "missing_public_key"
  | "missing_url"
  | "unsafe_public_key"
  | "unsupported_provider";

export type ContinuityProviderConfig =
  | {
      kind: "supabase";
      url: string;
      publicKey: string;
      keySource: "anon" | "publishable";
      accountDeletionAvailable: boolean;
    }
  | {
      kind: "unavailable";
      reason: ContinuityProviderUnavailableReason;
    };

export interface SupabaseBrowserClientOptions {
  auth: {
    autoRefreshToken: true;
    detectSessionInUrl: true;
    flowType: "pkce";
    persistSession: true;
    storageKey: string;
  };
}

export interface ContinuityProviderDependencies {
  createSupabaseClient?: (
    url: string,
    publicKey: string,
    options: SupabaseBrowserClientOptions,
  ) => SupabaseClient;
  fetcher?: typeof globalThis.fetch;
}

const availableCapabilities = (
  accountDeletion: boolean,
): Readonly<ContinuityProviderCapabilities> =>
  Object.freeze({
    accountDeletion,
    emailPasswordAuth: true,
    passwordRecovery: true,
    session: true,
    snapshotSync: true,
  });

const UNAVAILABLE_CAPABILITIES: Readonly<ContinuityProviderCapabilities> =
  Object.freeze({
    accountDeletion: false,
    emailPasswordAuth: false,
    passwordRecovery: false,
    session: false,
    snapshotSync: false,
  });

function success<T>(data: T): ContinuityResult<T> {
  return { ok: true, data };
}

function failure<T>(error: ContinuityError): ContinuityResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeExpectedUserId(value: unknown): string | null {
  const userId = trimmedString(value);
  return userId &&
    userId.length <= MAX_EXPECTED_USER_ID_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(userId)
    ? userId
    : null;
}

function selectedCategoryNames(
  selection: unknown,
): Array<(typeof CONTINUITY_CATEGORY_NAMES)[number]> | null {
  if (!isRecord(selection)) return null;
  const keys = Object.keys(selection);
  if (
    keys.length !== CONTINUITY_CATEGORY_NAMES.length ||
    !keys.every((key) =>
      CONTINUITY_CATEGORY_NAMES.includes(
        key as (typeof CONTINUITY_CATEGORY_NAMES)[number],
      ),
    )
  ) {
    return null;
  }
  const selected: Array<
    (typeof CONTINUITY_CATEGORY_NAMES)[number]
  > = [];
  for (const category of CONTINUITY_CATEGORY_NAMES) {
    if (typeof selection[category] !== "boolean") return null;
    if (selection[category]) selected.push(category);
  }
  return selected;
}

function snapshotPatchMatchesSelection(
  value: unknown,
  selectedCategories: readonly string[],
): boolean {
  if (!isRecord(value) || !isRecord(value.categories)) return false;
  const allowed = new Set(selectedCategories);
  return Object.keys(value.categories).every((key) => allowed.has(key));
}

function decodeJwtPayload(value: string): Record<string, unknown> | null {
  const parts = value.split(".");
  if (parts.length !== 3 || typeof globalThis.atob !== "function") return null;

  try {
    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const payload = JSON.parse(globalThis.atob(normalized)) as unknown;
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Only credentials intended for a browser may reach createClient. This catches
 * current secret-key prefixes and legacy JWT service-role keys without ever
 * returning or logging the rejected value.
 */
export function isSafeSupabasePublicKey(value: unknown): value is string {
  const key = trimmedString(value);
  if (
    !key ||
    key.length > 4_096 ||
    /[\u0000-\u001f\u007f\s]/.test(key) ||
    key.startsWith("sb_secret_")
  ) {
    return false;
  }

  const role = decodeJwtPayload(key)?.role;
  return role !== "service_role" && role !== "supabase_admin";
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

/**
 * Pure configuration resolution. In particular, this function never imports
 * the public-job client's hard-coded Supabase fallback.
 */
export function resolveContinuityProviderConfig(
  environment: ContinuityProviderEnvironment,
): ContinuityProviderConfig {
  const provider = trimmedString(environment.provider);
  if (!provider) return { kind: "unavailable", reason: "disabled" };
  if (provider !== "supabase") {
    return { kind: "unavailable", reason: "unsupported_provider" };
  }

  const rawUrl = trimmedString(environment.supabaseUrl);
  if (!rawUrl) return { kind: "unavailable", reason: "missing_url" };
  const url = normalizeSupabaseUrl(rawUrl);
  if (!url) return { kind: "unavailable", reason: "invalid_url" };

  const candidates = [
    {
      source: "publishable" as const,
      value: environment.supabasePublishableKey,
    },
    { source: "anon" as const, value: environment.supabaseAnonKey },
  ];
  const configuredKeys = candidates.filter(
    ({ value }) => trimmedString(value).length > 0,
  );
  if (configuredKeys.length === 0) {
    return { kind: "unavailable", reason: "missing_public_key" };
  }

  const selected = configuredKeys.find(({ value }) =>
    isSafeSupabasePublicKey(value),
  );
  if (!selected) {
    return { kind: "unavailable", reason: "unsafe_public_key" };
  }

  return {
    kind: "supabase",
    url,
    publicKey: trimmedString(selected.value),
    keySource: selected.source,
    accountDeletionAvailable:
      trimmedString(environment.accountDeletionAvailable) === "1",
  };
}

export function getContinuityProviderEnvironment(): ContinuityProviderEnvironment {
  return {
    accountDeletionAvailable:
      process.env.NEXT_PUBLIC_TIMLEY_ACCOUNT_DELETION_AVAILABLE,
    provider: process.env.NEXT_PUBLIC_TIMLEY_CONTINUITY_PROVIDER,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getContinuityProviderCapabilities(
  config: ContinuityProviderConfig,
): Readonly<ContinuityProviderCapabilities> {
  return config.kind === "supabase"
    ? availableCapabilities(config.accountDeletionAvailable)
    : UNAVAILABLE_CAPABILITIES;
}

const NORMALIZED_ERRORS: Readonly<
  Record<string, Omit<ContinuityError, "retryable">>
> = Object.freeze({
  email_not_confirmed: {
    code: "email_not_confirmed",
    message: "Verify your email before signing in.",
  },
  invalid_credentials: {
    code: "invalid_credentials",
    message: "The email or password is incorrect.",
  },
  over_email_send_rate_limit: {
    code: "rate_limited",
    message: "Too many emails were requested. Try again later.",
  },
  over_request_rate_limit: {
    code: "rate_limited",
    message: "Too many requests were made. Try again later.",
  },
  refresh_token_not_found: {
    code: "not_authenticated",
    message: "Sign in to continue.",
  },
  request_rate_limit_reached: {
    code: "rate_limited",
    message: "Too many requests were made. Try again later.",
  },
  same_password: {
    code: "invalid_input",
    message: "Choose a password you have not used for this account.",
  },
  session_not_found: {
    code: "not_authenticated",
    message: "Sign in to continue.",
  },
  user_already_exists: {
    code: "already_registered",
    message: "An account already exists for this email.",
  },
  weak_password: {
    code: "weak_password",
    message: "Choose a stronger password.",
  },
});

/**
 * Converts provider, network, and HTTP failures into a small stable vocabulary.
 * Raw provider messages are deliberately not surfaced because they can contain
 * implementation details that should not become UI or telemetry.
 */
export function normalizeContinuityError(
  value: unknown,
  fallbackCode: ContinuityErrorCode = "provider_error",
): ContinuityError {
  const record = isRecord(value) ? value : {};
  const rawCode = trimmedString(record.code).toLowerCase();
  const mapped = NORMALIZED_ERRORS[rawCode];
  if (mapped) {
    return {
      ...mapped,
      retryable: mapped.code === "rate_limited",
    };
  }

  const status =
    typeof record.status === "number" && Number.isFinite(record.status)
      ? record.status
      : null;
  if (status === 401 || status === 403) {
    return {
      code: "not_authenticated",
      message: "Sign in to continue.",
      retryable: false,
    };
  }
  if (status === 409) {
    return {
      code: "conflict",
      message: "This data changed elsewhere. Refresh and try again.",
      retryable: true,
    };
  }
  if (status === 429) {
    return {
      code: "rate_limited",
      message: "Too many requests were made. Try again later.",
      retryable: true,
    };
  }
  if (status !== null && status >= 500) {
    return {
      code: "server_error",
      message: "The service is temporarily unavailable.",
      retryable: true,
    };
  }

  const name = trimmedString(record.name);
  if (
    value instanceof TypeError ||
    name === "AbortError" ||
    name === "AuthRetryableFetchError" ||
    rawCode === "request_timeout"
  ) {
    return {
      code: "network",
      message: "Check your connection and try again.",
      retryable: true,
    };
  }

  const defaults: Record<ContinuityErrorCode, ContinuityError> = {
    already_registered: {
      code: "already_registered",
      message: "An account already exists for this email.",
      retryable: false,
    },
    conflict: {
      code: "conflict",
      message: "This data changed elsewhere. Refresh and try again.",
      retryable: true,
    },
    email_not_confirmed: {
      code: "email_not_confirmed",
      message: "Verify your email before signing in.",
      retryable: false,
    },
    invalid_configuration: {
      code: "invalid_configuration",
      message: "Account continuity is not configured correctly.",
      retryable: false,
    },
    invalid_credentials: {
      code: "invalid_credentials",
      message: "The email or password is incorrect.",
      retryable: false,
    },
    invalid_input: {
      code: "invalid_input",
      message: "Check the information and try again.",
      retryable: false,
    },
    invalid_snapshot: {
      code: "invalid_snapshot",
      message: "The saved continuity data is invalid.",
      retryable: false,
    },
    network: {
      code: "network",
      message: "Check your connection and try again.",
      retryable: true,
    },
    not_authenticated: {
      code: "not_authenticated",
      message: "Sign in to continue.",
      retryable: false,
    },
    provider_error: {
      code: "provider_error",
      message: "The account service could not complete the request.",
      retryable: false,
    },
    rate_limited: {
      code: "rate_limited",
      message: "Too many requests were made. Try again later.",
      retryable: true,
    },
    server_error: {
      code: "server_error",
      message: "The service is temporarily unavailable.",
      retryable: true,
    },
    unavailable: {
      code: "unavailable",
      message: "Account continuity is not available.",
      retryable: false,
    },
    weak_password: {
      code: "weak_password",
      message: "Choose a stronger password.",
      retryable: false,
    },
  };

  return defaults[fallbackCode];
}

function validateEmail(value: unknown): string | null {
  const email = trimmedString(value).toLowerCase();
  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    /\s/.test(email) ||
    !email.includes("@")
  ) {
    return null;
  }
  return email;
}

function validatePassword(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PASSWORD_LENGTH
    ? value
    : null;
}

function validateRedirectUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
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
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function invalidInput<T>(message: string): ContinuityResult<T> {
  return failure({
    code: "invalid_input",
    message,
    retryable: false,
  });
}

function normalizeJsonValue(
  value: unknown,
): { ok: true; data: unknown } | { ok: false } {
  try {
    const serialized = JSON.stringify(value);
    if (
      serialized === undefined ||
      serialized.length > MAX_CONTINUITY_SNAPSHOT_LENGTH
    ) {
      return { ok: false };
    }
    return { ok: true, data: JSON.parse(serialized) as unknown };
  } catch {
    return { ok: false };
  }
}

export function normalizeContinuitySnapshotInput<T>(
  value: ContinuitySnapshotInput<T>,
): ContinuitySnapshotInput<T> | null {
  if (
    !value ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1
  ) {
    return null;
  }
  const normalized = normalizeJsonValue(value.data);
  return normalized.ok
    ? { version: value.version, data: normalized.data as T }
    : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function parseSnapshotRow<T>(value: unknown): ContinuitySnapshot<T> | null {
  if (!isRecord(value)) return null;
  const normalized = normalizeContinuitySnapshotInput({
    version: value.snapshot_version as number,
    data: value.snapshot as T,
  });
  const updatedAt = normalizeTimestamp(value.updated_at);
  return normalized && updatedAt
    ? {
        version: normalized.version,
        data: normalized.data,
        updatedAt,
      }
    : null;
}

function mapUser(user: User | null): ContinuityUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    emailVerified: Boolean(user.email_confirmed_at),
  };
}

function mapSession(session: Session | null): ContinuitySession | null {
  if (!session) return null;
  return {
    user: mapUser(session.user) as ContinuityUser,
    expiresAt: session.expires_at ?? null,
  };
}

function unavailableError(): ContinuityError {
  return normalizeContinuityError(undefined, "unavailable");
}

export function createUnavailableContinuityProvider(): ContinuityProviderAdapter {
  const unavailable = <T>(): Promise<ContinuityResult<T>> =>
    Promise.resolve(failure(unavailableError()));

  return {
    kind: "unavailable",
    available: false,
    capabilities: UNAVAILABLE_CAPABILITIES,
    getSession: async () => success(null),
    onAuthStateChange: () => () => undefined,
    signUp: unavailable,
    signIn: unavailable,
    signOut: unavailable,
    resendSignUpVerification: unavailable,
    sendPasswordReset: unavailable,
    updatePassword: unavailable,
    readSnapshot: unavailable,
    upsertSnapshot: unavailable,
    deleteAccount: unavailable,
  };
}

class SupabaseContinuityProvider implements ContinuityProviderAdapter {
  readonly kind = "supabase" as const;
  readonly available = true;
  readonly capabilities: Readonly<ContinuityProviderCapabilities>;

  private client: SupabaseClient | null = null;

  constructor(
    private readonly config: Extract<
      ContinuityProviderConfig,
      { kind: "supabase" }
    >,
    private readonly dependencies: ContinuityProviderDependencies,
  ) {
    this.capabilities = availableCapabilities(
      config.accountDeletionAvailable,
    );
  }

  private getClient(): SupabaseClient {
    if (this.client) return this.client;

    const options: SupabaseBrowserClientOptions = {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        persistSession: true,
        storageKey: CONTINUITY_AUTH_STORAGE_KEY,
      },
    };
    const factory =
      this.dependencies.createSupabaseClient ??
      ((url, publicKey, clientOptions) =>
        createClient(url, publicKey, clientOptions));
    this.client = factory(
      this.config.url,
      this.config.publicKey,
      options,
    );
    return this.client;
  }

  private async authenticatedSession(
    expectedUserId: string,
  ): Promise<
    ContinuityResult<Session>
  > {
    const normalizedExpectedUserId =
      normalizeExpectedUserId(expectedUserId);
    if (!normalizedExpectedUserId) {
      return invalidInput("A valid expected account is required.");
    }
    try {
      const { data, error } = await this.getClient().auth.getSession();
      if (error) return failure(normalizeContinuityError(error));
      if (
        !data.session ||
        data.session.user.id !== normalizedExpectedUserId
      ) {
        return failure(
          normalizeContinuityError(undefined, "not_authenticated"),
        );
      }
      return success(data.session);
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async getSession(): Promise<
    ContinuityResult<ContinuitySession | null>
  > {
    try {
      const { data, error } = await this.getClient().auth.getSession();
      return error
        ? failure(normalizeContinuityError(error))
        : success(mapSession(data.session));
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  onAuthStateChange(
    listener: (state: ContinuityAuthState) => void,
  ): () => void {
    const {
      data: { subscription },
    } = this.getClient().auth.onAuthStateChange((event, session) => {
      listener({ event, session: mapSession(session) });
    });
    return () => subscription.unsubscribe();
  }

  async signUp(
    input: ContinuityEmailPasswordInput,
  ): Promise<ContinuityResult<ContinuityAuthOutcome>> {
    const email = validateEmail(input.email);
    const password = validatePassword(input.password);
    const redirectTo = validateRedirectUrl(input.redirectTo);
    if (!email) return invalidInput("Enter a valid email address.");
    if (!password) return invalidInput("Enter a valid password.");
    if (redirectTo === null) {
      return invalidInput("Use a valid secure redirect URL.");
    }

    try {
      const { data, error } = await this.getClient().auth.signUp({
        email,
        password,
        options:
          redirectTo === undefined
            ? undefined
            : { emailRedirectTo: redirectTo },
      });
      if (error) return failure(normalizeContinuityError(error));
      return success({
        user: mapUser(data.user),
        session: mapSession(data.session),
        confirmationRequired: Boolean(data.user && !data.session),
      });
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async signIn(
    input: ContinuityEmailPasswordInput,
  ): Promise<ContinuityResult<ContinuityAuthOutcome>> {
    const email = validateEmail(input.email);
    const password = validatePassword(input.password);
    if (!email) return invalidInput("Enter a valid email address.");
    if (!password) return invalidInput("Enter a valid password.");

    try {
      const { data, error } =
        await this.getClient().auth.signInWithPassword({
          email,
          password,
        });
      if (error) return failure(normalizeContinuityError(error));
      return success({
        user: mapUser(data.user),
        session: mapSession(data.session),
        confirmationRequired: false,
      });
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async signOut(): Promise<ContinuityResult<void>> {
    try {
      const { error } = await this.getClient().auth.signOut({
        scope: "local",
      });
      return error
        ? failure(normalizeContinuityError(error))
        : success(undefined);
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async resendSignUpVerification(
    input: ContinuityEmailInput,
  ): Promise<ContinuityResult<void>> {
    const email = validateEmail(input.email);
    const redirectTo = validateRedirectUrl(input.redirectTo);
    if (!email) return invalidInput("Enter a valid email address.");
    if (redirectTo === null) {
      return invalidInput("Use a valid secure redirect URL.");
    }

    try {
      const { error } = await this.getClient().auth.resend({
        type: "signup",
        email,
        options:
          redirectTo === undefined
            ? undefined
            : { emailRedirectTo: redirectTo },
      });
      return error
        ? failure(normalizeContinuityError(error))
        : success(undefined);
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async sendPasswordReset(
    input: ContinuityEmailInput,
  ): Promise<ContinuityResult<void>> {
    const email = validateEmail(input.email);
    const redirectTo = validateRedirectUrl(input.redirectTo);
    if (!email) return invalidInput("Enter a valid email address.");
    if (redirectTo === null) {
      return invalidInput("Use a valid secure redirect URL.");
    }

    try {
      const { error } =
        await this.getClient().auth.resetPasswordForEmail(
          email,
          redirectTo === undefined ? undefined : { redirectTo },
        );
      return error
        ? failure(normalizeContinuityError(error))
        : success(undefined);
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async updatePassword(
    input: ContinuityPasswordInput,
  ): Promise<ContinuityResult<ContinuityUser>> {
    const password = validatePassword(input.password);
    if (!password) return invalidInput("Enter a valid password.");

    try {
      const { data, error } = await this.getClient().auth.updateUser({
        password,
      });
      if (error) return failure(normalizeContinuityError(error));
      const user = mapUser(data.user);
      return user
        ? success(user)
        : failure(
            normalizeContinuityError(undefined, "not_authenticated"),
          );
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async readSnapshot<T = unknown>(
    input: ContinuitySnapshotAccessInput,
  ): Promise<
    ContinuityResult<ContinuitySnapshot<T> | null>
  > {
    const expectedUserId = normalizeExpectedUserId(
      input.expectedUserId,
    );
    const selectedCategories = selectedCategoryNames(input.selection);
    if (!expectedUserId || !selectedCategories) {
      return invalidInput("Choose valid continuity categories.");
    }
    const session = await this.authenticatedSession(expectedUserId);
    if (!session.ok) return session;

    try {
      const { data, error } = await this.getClient()
        .schema("public")
        .rpc(READ_CONTINUITY_RPC, {
          p_expected_user_id: expectedUserId,
          p_selected_categories: selectedCategories,
        })
        .maybeSingle();
      if (error) return failure(normalizeContinuityError(error));
      const currentSession =
        await this.authenticatedSession(expectedUserId);
      if (!currentSession.ok) return currentSession;
      if (!data) return success(null);
      const snapshot = parseSnapshotRow<T>(data);
      return snapshot
        ? success(snapshot)
        : failure(
            normalizeContinuityError(undefined, "invalid_snapshot"),
          );
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async upsertSnapshot<T = unknown>(
    input: ContinuitySnapshotWriteInput<T>,
  ): Promise<ContinuityResult<ContinuitySnapshot<T>>> {
    const normalized = normalizeContinuitySnapshotInput(input);
    const expectedUserId = normalizeExpectedUserId(
      input.expectedUserId,
    );
    const selectedCategories = selectedCategoryNames(input.selection);
    if (
      !normalized ||
      !expectedUserId ||
      !selectedCategories ||
      !snapshotPatchMatchesSelection(
        normalized.data,
        selectedCategories,
      )
    ) {
      return failure(
        normalizeContinuityError(undefined, "invalid_snapshot"),
      );
    }
    const session = await this.authenticatedSession(expectedUserId);
    if (!session.ok) return session;

    try {
      const { data, error } = await this.getClient()
        .schema("public")
        .rpc(PATCH_CONTINUITY_RPC, {
          p_expected_user_id: expectedUserId,
          p_selected_categories: selectedCategories,
          p_snapshot_version: normalized.version,
          p_snapshot_patch: normalized.data,
        })
        .single();
      if (error) return failure(normalizeContinuityError(error));
      const currentSession =
        await this.authenticatedSession(expectedUserId);
      if (!currentSession.ok) return currentSession;
      const snapshot = parseSnapshotRow<T>(data);
      return snapshot
        ? success(snapshot)
        : failure(
            normalizeContinuityError(undefined, "invalid_snapshot"),
          );
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }

  async deleteAccount(
    expectedUserId: string,
  ): Promise<ContinuityResult<void>> {
    if (!this.capabilities.accountDeletion) {
      return failure(unavailableError());
    }
    const normalizedExpectedUserId =
      normalizeExpectedUserId(expectedUserId);
    if (!normalizedExpectedUserId) {
      return invalidInput("A valid expected account is required.");
    }
    const session = await this.authenticatedSession(
      normalizedExpectedUserId,
    );
    if (!session.ok) return session;

    const fetcher = this.dependencies.fetcher ?? globalThis.fetch;
    if (typeof fetcher !== "function") {
      return failure(normalizeContinuityError(new TypeError("fetch")));
    }

    try {
      const response = await fetcher("/api/account", {
        method: "DELETE",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${session.data.access_token}`,
          [ACCOUNT_DELETION_EXPECTED_USER_HEADER]:
            normalizedExpectedUserId,
        },
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "same-origin",
      });
      if (!response.ok) {
        return failure(
          normalizeContinuityError({ status: response.status }),
        );
      }

      const { data: currentData, error: currentError } =
        await this.getClient().auth.getSession();
      if (currentError) {
        return failure(normalizeContinuityError(currentError));
      }
      if (
        currentData.session &&
        currentData.session.user.id !== normalizedExpectedUserId
      ) {
        return failure(
          normalizeContinuityError(undefined, "not_authenticated"),
        );
      }
      // The server has already deleted the account. Best-effort local sign-out
      // removes the persisted browser session without revoking other devices.
      if (currentData.session) {
        await this.getClient().auth.signOut({ scope: "local" });
      }
      return success(undefined);
    } catch (error) {
      return failure(normalizeContinuityError(error));
    }
  }
}

/**
 * Creating the adapter is side-effect free. The Supabase client is initialized
 * only when a configured adapter method is first used.
 */
export function createContinuityProvider(
  environment: ContinuityProviderEnvironment =
    getContinuityProviderEnvironment(),
  dependencies: ContinuityProviderDependencies = {},
): ContinuityProviderAdapter {
  const config = resolveContinuityProviderConfig(environment);
  return config.kind === "supabase"
    ? new SupabaseContinuityProvider(config, dependencies)
    : createUnavailableContinuityProvider();
}

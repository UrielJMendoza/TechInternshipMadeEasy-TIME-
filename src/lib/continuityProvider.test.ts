import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETION_EXPECTED_USER_HEADER,
  MAX_CONTINUITY_SNAPSHOT_LENGTH,
  createContinuityProvider,
  createUnavailableContinuityProvider,
  getContinuityProviderCapabilities,
  isSafeSupabasePublicKey,
  normalizeContinuityError,
  normalizeContinuitySnapshotInput,
  resolveContinuityProviderConfig,
  type ContinuityAuthState,
  type ContinuityProviderDependencies,
} from "./continuityProvider";
import {
  CONTINUITY_SNAPSHOT_FORMAT,
  CONTINUITY_SNAPSHOT_VERSION,
  DEFAULT_SYNC_SELECTION,
  MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH,
} from "./continuitySnapshot";

const URL = "https://project-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_public-browser-key";
const USER = {
  id: "6c9381a0-95ef-48a4-87a7-2655e75f5e08",
  email: "person@example.com",
  email_confirmed_at: "2026-07-22T12:00:00.000Z",
} as Session["user"];
const SESSION = {
  access_token: "browser-access-token",
  refresh_token: "browser-refresh-token",
  expires_in: 3_600,
  expires_at: 1_800_000_000,
  token_type: "bearer",
  user: USER,
} satisfies Session;

test("provider and snapshot validation use one continuity size limit", () => {
  assert.equal(
    MAX_CONTINUITY_SNAPSHOT_LENGTH,
    MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH,
  );
});

function configuredEnvironment() {
  return {
    provider: "supabase",
    supabaseUrl: URL,
    supabasePublishableKey: PUBLISHABLE_KEY,
  };
}

function serviceRoleJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ role: "service_role" }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

function clientDependencies(
  client: unknown,
  onCreate?: () => void,
): ContinuityProviderDependencies {
  return {
    createSupabaseClient: () => {
      onCreate?.();
      return client as SupabaseClient;
    },
  };
}

test("continuity stays unavailable unless the provider and explicit public config are present", () => {
  assert.deepEqual(
    resolveContinuityProviderConfig({
      supabaseUrl: URL,
      supabasePublishableKey: PUBLISHABLE_KEY,
    }),
    { kind: "unavailable", reason: "disabled" },
  );
  assert.deepEqual(
    resolveContinuityProviderConfig({
      provider: "Supabase",
      supabaseUrl: URL,
      supabasePublishableKey: PUBLISHABLE_KEY,
    }),
    { kind: "unavailable", reason: "unsupported_provider" },
  );
  assert.deepEqual(
    resolveContinuityProviderConfig({
      provider: "supabase",
      supabasePublishableKey: PUBLISHABLE_KEY,
    }),
    { kind: "unavailable", reason: "missing_url" },
  );
  assert.deepEqual(
    resolveContinuityProviderConfig({
      provider: "supabase",
      supabaseUrl: URL,
    }),
    { kind: "unavailable", reason: "missing_public_key" },
  );
});

test("configuration accepts publishable or anon browser keys and prefers publishable", () => {
  assert.deepEqual(
    resolveContinuityProviderConfig({
      ...configuredEnvironment(),
      supabaseAnonKey: "legacy-anon-key",
    }),
    {
      kind: "supabase",
      url: URL,
      publicKey: PUBLISHABLE_KEY,
      keySource: "publishable",
      accountDeletionAvailable: false,
    },
  );
  assert.deepEqual(
    resolveContinuityProviderConfig({
      provider: "supabase",
      supabaseUrl: `${URL}/`,
      supabaseAnonKey: "legacy-anon-key",
    }),
    {
      kind: "supabase",
      url: URL,
      publicKey: "legacy-anon-key",
      keySource: "anon",
      accountDeletionAvailable: false,
    },
  );
});

test("configuration rejects insecure URLs and service credentials", () => {
  assert.equal(isSafeSupabasePublicKey(PUBLISHABLE_KEY), true);
  assert.equal(isSafeSupabasePublicKey("sb_secret_server-only"), false);
  assert.equal(isSafeSupabasePublicKey(serviceRoleJwt()), false);
  assert.deepEqual(
    resolveContinuityProviderConfig({
      provider: "supabase",
      supabaseUrl: "http://project-ref.supabase.co",
      supabasePublishableKey: PUBLISHABLE_KEY,
    }),
    { kind: "unavailable", reason: "invalid_url" },
  );
  assert.deepEqual(
    resolveContinuityProviderConfig({
      provider: "supabase",
      supabaseUrl: URL,
      supabaseAnonKey: serviceRoleJwt(),
    }),
    { kind: "unavailable", reason: "unsafe_public_key" },
  );
});

test("capability checks are pure and unavailable mode is an anonymous no-op", async () => {
  assert.deepEqual(
    getContinuityProviderCapabilities({
      kind: "unavailable",
      reason: "disabled",
    }),
    {
      accountDeletion: false,
      emailPasswordAuth: false,
      passwordRecovery: false,
      session: false,
      snapshotSync: false,
    },
  );
  const provider = createUnavailableContinuityProvider();
  assert.deepEqual(await provider.getSession(), {
    ok: true,
    data: null,
  });
  const signIn = await provider.signIn({
    email: "person@example.com",
    password: "not-used",
  });
  assert.equal(signIn.ok, false);
  if (!signIn.ok) assert.equal(signIn.error.code, "unavailable");
  assert.doesNotThrow(provider.onAuthStateChange(() => undefined));

  const configured = createContinuityProvider({
    ...configuredEnvironment(),
    accountDeletionAvailable: "1",
  });
  assert.equal(configured.capabilities.accountDeletion, true);
  assert.equal(
    createContinuityProvider({
      ...configuredEnvironment(),
      accountDeletionAvailable: "true",
    }).capabilities.accountDeletion,
    false,
  );
});

test("the configured Supabase browser client is created lazily with persistent PKCE auth", async () => {
  let creations = 0;
  let receivedOptions: unknown;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };
  const provider = createContinuityProvider({
    ...configuredEnvironment(),
    accountDeletionAvailable: "1",
  }, {
    createSupabaseClient: (_url, _key, options) => {
      creations += 1;
      receivedOptions = options;
      return client as unknown as SupabaseClient;
    },
  });

  assert.equal(provider.available, true);
  assert.equal(creations, 0);
  assert.deepEqual(await provider.getSession(), {
    ok: true,
    data: null,
  });
  assert.equal(creations, 1);
  assert.deepEqual(receivedOptions, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      persistSession: true,
      storageKey: "timley:continuity:auth:v1",
    },
  });
  await provider.getSession();
  assert.equal(creations, 1);
});

test("auth subscriptions preserve PASSWORD_RECOVERY and local sign-out scope", async () => {
  let authListener:
    | ((event: "PASSWORD_RECOVERY", session: Session | null) => void)
    | undefined;
  let signOutOptions: unknown;
  let unsubscribed = false;
  const client = {
    auth: {
      onAuthStateChange: (listener: typeof authListener) => {
        authListener = listener;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true;
              },
            },
          },
        };
      },
      signOut: async (options: unknown) => {
        signOutOptions = options;
        return { error: null };
      },
    },
  };
  const provider = createContinuityProvider(
    configuredEnvironment(),
    clientDependencies(client),
  );
  let state: ContinuityAuthState | undefined;
  const unsubscribe = provider.onAuthStateChange((next) => {
    state = next;
  });
  authListener?.("PASSWORD_RECOVERY", SESSION);

  assert.equal(state?.event, "PASSWORD_RECOVERY");
  assert.deepEqual(state?.session, {
    user: {
      id: USER.id,
      email: USER.email,
      emailVerified: true,
    },
    expiresAt: SESSION.expires_at,
  });
  assert.deepEqual(await provider.signOut(), {
    ok: true,
    data: undefined,
  });
  assert.deepEqual(signOutOptions, { scope: "local" });
  unsubscribe();
  assert.equal(unsubscribed, true);
});

test("snapshot helpers require a positive version and JSON-safe bounded data", () => {
  assert.deepEqual(
    normalizeContinuitySnapshotInput({
      version: 3,
      data: { tracker: ["saved", "applied"] },
    }),
    {
      version: 3,
      data: { tracker: ["saved", "applied"] },
    },
  );
  assert.equal(
    normalizeContinuitySnapshotInput({ version: 0, data: {} }),
    null,
  );
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.equal(
    normalizeContinuitySnapshotInput({ version: 1, data: circular }),
    null,
  );
});

test("snapshots use account-bound selected-category RPCs", async () => {
  const calls: Array<{ name: string; value: unknown }> = [];
  const selection = {
    ...DEFAULT_SYNC_SELECTION,
    filters: false,
    savedSearches: false,
  };
  const snapshot = {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt: "2026-07-22T13:00:00.000Z",
    categories: {
      savedJobs: {
        urls: ["https://jobs.test/1"],
        updatedAt: {
          "https://jobs.test/1": "2026-07-22T13:00:00.000Z",
        },
        tombstones: {},
      },
    },
  };
  const row = {
    snapshot_version: CONTINUITY_SNAPSHOT_VERSION,
    snapshot,
    updated_at: "2026-07-22T13:00:00.000Z",
  };
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: SESSION },
        error: null,
      }),
    },
    schema: (schema: string) => {
      calls.push({ name: "schema", value: schema });
      return {
        rpc: (name: string, value: unknown) => {
          calls.push({ name: `rpc:${name}`, value });
          return {
            maybeSingle: async () => ({ data: row, error: null }),
            single: async () => ({ data: row, error: null }),
          };
        },
      };
    },
  };
  const provider = createContinuityProvider(
    configuredEnvironment(),
    clientDependencies(client),
  );

  assert.deepEqual(
    await provider.readSnapshot({
      expectedUserId: USER.id,
      selection,
    }),
    {
    ok: true,
    data: {
      version: CONTINUITY_SNAPSHOT_VERSION,
      data: snapshot,
      updatedAt: "2026-07-22T13:00:00.000Z",
    },
    },
  );
  assert.deepEqual(
    await provider.upsertSnapshot({
      expectedUserId: USER.id,
      selection,
      version: CONTINUITY_SNAPSHOT_VERSION,
      data: snapshot,
    }),
    {
      ok: true,
      data: {
        version: CONTINUITY_SNAPSHOT_VERSION,
        data: snapshot,
        updatedAt: "2026-07-22T13:00:00.000Z",
      },
    },
  );
  assert.deepEqual(
    calls.filter(({ name }) => name === "schema").map(({ value }) => value),
    ["public", "public"],
  );
  assert.deepEqual(
    calls.find(
      ({ name }) =>
        name ===
        "rpc:read_timley_continuity_snapshot_categories",
    )?.value,
    {
      p_expected_user_id: USER.id,
      p_selected_categories: ["savedJobs"],
    },
  );
  assert.deepEqual(
    calls.find(
      ({ name }) =>
        name ===
        "rpc:patch_timley_continuity_snapshot_categories",
    )?.value,
    {
      p_expected_user_id: USER.id,
      p_selected_categories: ["savedJobs"],
      p_snapshot_version: CONTINUITY_SNAPSHOT_VERSION,
      p_snapshot_patch: snapshot,
    },
  );
});

test("snapshot patches cannot carry an unselected category", async () => {
  let sessionReads = 0;
  let rpcCalls = 0;
  const client = {
    auth: {
      getSession: async () => {
        sessionReads += 1;
        return { data: { session: SESSION }, error: null };
      },
    },
    schema: () => ({
      rpc: () => {
        rpcCalls += 1;
        throw new Error("must not run");
      },
    }),
  };
  const provider = createContinuityProvider(
    configuredEnvironment(),
    clientDependencies(client),
  );
  const result = await provider.upsertSnapshot({
    expectedUserId: USER.id,
    selection: {
      savedJobs: true,
      applications: false,
      filters: false,
      savedSearches: false,
    },
    version: CONTINUITY_SNAPSHOT_VERSION,
    data: {
      format: CONTINUITY_SNAPSHOT_FORMAT,
      version: CONTINUITY_SNAPSHOT_VERSION,
      capturedAt: "2026-07-22T13:00:00.000Z",
      categories: {
        applications: {
          records: {},
          tombstones: {},
        },
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "invalid_snapshot");
  }
  assert.equal(sessionReads, 0);
  assert.equal(rpcCalls, 0);
});

test("continuity migration exposes invoker RPCs that project and atomically patch selected categories", () => {
  const migration = readFileSync(
    new globalThis.URL(
      "../../supabase/migrations/20260723000000_add_optional_continuity.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /read_timley_continuity_snapshot_categories/,
  );
  assert.match(
    migration,
    /patch_timley_continuity_snapshot_categories/,
  );
  assert.doesNotMatch(migration, /security\s+definer/i);
  assert.match(
    migration,
    /security\s+invoker[\s\S]*security\s+invoker/i,
  );
  assert.match(
    migration,
    /auth\.uid\(\)\)\s*<>\s*p_expected_user_id/i,
  );
  assert.match(
    migration,
    /where\s+category\.key\s*=\s*any\(p_selected_categories\)/i,
  );
  assert.match(
    migration,
    /on\s+conflict\s*\(user_id\)\s+do\s+update/i,
  );
  assert.match(
    migration,
    /revoke\s+all[\s\S]*from\s+public,\s*anon,\s*authenticated,\s*service_role/i,
  );
  assert.match(
    migration,
    /grant\s+execute[\s\S]*to\s+authenticated,\s*service_role/i,
  );
});

test("snapshot and deletion operations reject a different active account before transport", async () => {
  let rpcCalls = 0;
  let fetchCalls = 0;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: SESSION },
        error: null,
      }),
    },
    schema: () => ({
      rpc: () => {
        rpcCalls += 1;
        throw new Error("must not run");
      },
    }),
  };
  const provider = createContinuityProvider({
    ...configuredEnvironment(),
    accountDeletionAvailable: "1",
  }, {
    ...clientDependencies(client),
    fetcher: async () => {
      fetchCalls += 1;
      throw new Error("must not run");
    },
  });
  const expectedUserId =
    "f28a5a4e-7ff2-49a8-a160-c77bd455d544";
  const selection = {
    savedJobs: true,
    applications: false,
    filters: false,
    savedSearches: false,
  };
  const snapshot = {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt: "2026-07-22T13:00:00.000Z",
    categories: {},
  };

  for (const result of [
    await provider.readSnapshot({ expectedUserId, selection }),
    await provider.upsertSnapshot({
      expectedUserId,
      selection,
      version: CONTINUITY_SNAPSHOT_VERSION,
      data: snapshot,
    }),
    await provider.deleteAccount(expectedUserId),
  ]) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "not_authenticated");
    }
  }
  assert.equal(rpcCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("an account switch after deletion transport never signs out the new account", async () => {
  const otherSession = {
    ...SESSION,
    user: {
      ...USER,
      id: "f28a5a4e-7ff2-49a8-a160-c77bd455d544",
    },
  } satisfies Session;
  let sessionReads = 0;
  let signOutCalls = 0;
  const client = {
    auth: {
      getSession: async () => {
        sessionReads += 1;
        return {
          data: {
            session: sessionReads === 1 ? SESSION : otherSession,
          },
          error: null,
        };
      },
      signOut: async () => {
        signOutCalls += 1;
        return { error: null };
      },
    },
  };
  const provider = createContinuityProvider({
    ...configuredEnvironment(),
    accountDeletionAvailable: "1",
  }, {
    ...clientDependencies(client),
    fetcher: async () => new Response(null, { status: 204 }),
  });

  const result = await provider.deleteAccount(USER.id);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "not_authenticated");
  }
  assert.equal(signOutCalls, 0);
});

test("account deletion uses only the same-origin endpoint and clears the local session", async () => {
  const fetchCalls: Array<{ input: unknown; init: unknown }> = [];
  const signOutCalls: unknown[] = [];
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: SESSION },
        error: null,
      }),
      signOut: async (options: unknown) => {
        signOutCalls.push(options);
        return { error: null };
      },
    },
  };
  const provider = createContinuityProvider(
    {
      ...configuredEnvironment(),
      accountDeletionAvailable: "1",
    },
    {
      ...clientDependencies(client),
      fetcher: async (input, init) => {
        fetchCalls.push({ input, init });
        return new Response(null, { status: 204 });
      },
    },
  );

  assert.deepEqual(await provider.deleteAccount(USER.id), {
    ok: true,
    data: undefined,
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "/api/account");
  assert.equal((fetchCalls[0].init as RequestInit).method, "DELETE");
  assert.equal(
    (fetchCalls[0].init as RequestInit).credentials,
    "same-origin",
  );
  assert.equal(
    new Headers(
      (fetchCalls[0].init as RequestInit).headers,
    ).get(ACCOUNT_DELETION_EXPECTED_USER_HEADER),
    USER.id,
  );
  assert.deepEqual(signOutCalls, [{ scope: "local" }]);
});

test("provider and transport errors are normalized without raw messages", () => {
  assert.deepEqual(
    normalizeContinuityError({
      code: "weak_password",
      message: "raw provider implementation detail",
    }),
    {
      code: "weak_password",
      message: "Choose a stronger password.",
      retryable: false,
    },
  );
  assert.deepEqual(normalizeContinuityError({ status: 429 }), {
    code: "rate_limited",
    message: "Too many requests were made. Try again later.",
    retryable: true,
  });
  assert.deepEqual(normalizeContinuityError(new TypeError("secret URL")), {
    code: "network",
    message: "Check your connection and try again.",
    retryable: true,
  });
});

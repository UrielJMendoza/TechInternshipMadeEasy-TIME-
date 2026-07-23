import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deleteValidatedAccount,
  parseBearerToken,
  resolveAccountDeletionConfig,
  type AccountDeletionOperations,
} from "./accountDeletion";

const URL = "https://project-ref.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_public-browser-key";
const SERVICE_ROLE_KEY = "sb_secret_server-only";
const USER_ID = "6c9381a0-95ef-48a4-87a7-2655e75f5e08";

function serviceRoleJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ role: "service_role" }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

function configuredEnvironment() {
  return {
    enabled: "true",
    supabaseUrl: URL,
    supabasePublishableKey: PUBLISHABLE_KEY,
    supabaseServiceRoleKey: SERVICE_ROLE_KEY,
  };
}

function successfulOperations(
  calls: string[],
): AccountDeletionOperations {
  return {
    getUser: async (token) => {
      calls.push(`getUser:${token}`);
      return {
        data: { user: { id: USER_ID } },
        error: null,
      };
    },
    signOut: async (token, scope) => {
      calls.push(`signOut:${token}:${scope}`);
      return { error: null };
    },
    deleteUser: async (userId) => {
      calls.push(`deleteUser:${userId}`);
      return { error: null };
    },
  };
}

test("account deletion stays unavailable unless explicitly enabled and fully configured", () => {
  assert.deepEqual(
    resolveAccountDeletionConfig({
      supabaseUrl: URL,
      supabasePublishableKey: PUBLISHABLE_KEY,
      supabaseServiceRoleKey: SERVICE_ROLE_KEY,
    }),
    { kind: "unavailable", reason: "disabled" },
  );
  assert.deepEqual(
    resolveAccountDeletionConfig({
      ...configuredEnvironment(),
      enabled: "TRUE",
    }),
    { kind: "unavailable", reason: "disabled" },
  );
  assert.deepEqual(
    resolveAccountDeletionConfig({
      ...configuredEnvironment(),
      supabaseUrl: undefined,
    }),
    { kind: "unavailable", reason: "invalid_configuration" },
  );
  assert.deepEqual(
    resolveAccountDeletionConfig({
      ...configuredEnvironment(),
      supabasePublishableKey: undefined,
    }),
    { kind: "unavailable", reason: "invalid_configuration" },
  );
  assert.deepEqual(
    resolveAccountDeletionConfig({
      ...configuredEnvironment(),
      supabaseServiceRoleKey: undefined,
    }),
    { kind: "unavailable", reason: "invalid_configuration" },
  );
});

test("configuration accepts explicit modern and legacy credentials", () => {
  assert.deepEqual(
    resolveAccountDeletionConfig(configuredEnvironment()),
    {
      kind: "configured",
      url: URL,
      publicKey: PUBLISHABLE_KEY,
      serviceRoleKey: SERVICE_ROLE_KEY,
    },
  );
  const legacyAnonKey = "legacy-anon-public-key";
  assert.deepEqual(
    resolveAccountDeletionConfig({
      enabled: "true",
      supabaseUrl: `${URL}/`,
      supabaseAnonKey: legacyAnonKey,
      supabaseServiceRoleKey: serviceRoleJwt(),
    }),
    {
      kind: "configured",
      url: URL,
      publicKey: legacyAnonKey,
      serviceRoleKey: serviceRoleJwt(),
    },
  );
  assert.deepEqual(
    resolveAccountDeletionConfig({
      ...configuredEnvironment(),
      supabaseAnonKey: "legacy-anon-public-key",
    }),
    {
      kind: "configured",
      url: URL,
      publicKey: PUBLISHABLE_KEY,
      serviceRoleKey: SERVICE_ROLE_KEY,
    },
  );
});

test("configuration rejects unsafe URLs and misplaced credentials", () => {
  for (const environment of [
    {
      ...configuredEnvironment(),
      supabaseUrl: "http://project-ref.supabase.co",
    },
    {
      ...configuredEnvironment(),
      supabaseUrl: "https://user:password@project-ref.supabase.co",
    },
    {
      ...configuredEnvironment(),
      supabasePublishableKey: SERVICE_ROLE_KEY,
    },
    {
      ...configuredEnvironment(),
      supabaseServiceRoleKey: PUBLISHABLE_KEY,
    },
    {
      ...configuredEnvironment(),
      supabaseServiceRoleKey: "ordinary-public-looking-key",
    },
  ]) {
    assert.deepEqual(resolveAccountDeletionConfig(environment), {
      kind: "unavailable",
      reason: "invalid_configuration",
    });
  }
});

test("bearer parsing accepts one bounded token and rejects ambiguous headers", () => {
  assert.equal(
    parseBearerToken("Bearer header.payload.signature"),
    "header.payload.signature",
  );
  assert.equal(
    parseBearerToken("bearer access-token_1~value"),
    "access-token_1~value",
  );

  for (const header of [
    null,
    "",
    "Basic token",
    "Bearer",
    "Bearer  token",
    "Bearer token other",
    "Bearer token,other",
    "Bearer token\nother",
    `Bearer ${"a".repeat(8_193)}`,
  ]) {
    assert.equal(parseBearerToken(header), null);
  }
});

test("validated deletion revokes global sessions before deleting the validated user", async () => {
  const calls: string[] = [];
  const result = await deleteValidatedAccount(
    "access-token",
    USER_ID,
    successfulOperations(calls),
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    "getUser:access-token",
    "signOut:access-token:global",
    `deleteUser:${USER_ID}`,
  ]);
});

test("invalid authentication never invokes an administrative operation", async () => {
  for (const validation of [
    {
      data: { user: null },
      error: null,
    },
    {
      data: { user: { id: USER_ID } },
      error: new Error("provider detail"),
    },
    {
      data: { user: { id: "not-a-uuid" } },
      error: null,
    },
  ]) {
    const calls: string[] = [];
    const operations = successfulOperations(calls);
    operations.getUser = async () => validation;

    assert.deepEqual(
      await deleteValidatedAccount(
        "access-token",
        USER_ID,
        operations,
      ),
      { ok: false, code: "unauthorized" },
    );
    assert.deepEqual(calls, []);
  }
});

test("expected-user mismatch is rejected before revocation or deletion", async () => {
  const calls: string[] = [];
  assert.deepEqual(
    await deleteValidatedAccount(
      "access-token",
      "f28a5a4e-7ff2-49a8-a160-c77bd455d544",
      successfulOperations(calls),
    ),
    { ok: false, code: "unauthorized" },
  );
  assert.deepEqual(calls, ["getUser:access-token"]);

  const invalidExpectedCalls: string[] = [];
  assert.deepEqual(
    await deleteValidatedAccount(
      "access-token",
      "not-a-user-id",
      successfulOperations(invalidExpectedCalls),
    ),
    { ok: false, code: "unauthorized" },
  );
  assert.deepEqual(invalidExpectedCalls, []);
});

test("the account route requires and forwards the expected-user header", () => {
  const route = readFileSync(
    new globalThis.URL("../app/api/account/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /ACCOUNT_DELETION_EXPECTED_USER_HEADER/);
  assert.match(
    route,
    /request\.headers\.get\(\s*ACCOUNT_DELETION_EXPECTED_USER_HEADER/,
  );
  assert.match(
    route,
    /deleteValidatedAccount\(\s*token,\s*expectedUserId,/,
  );
});

test("revocation or deletion failures return only the generic unavailable result", async () => {
  const revocationCalls: string[] = [];
  const revocationOperations = successfulOperations(revocationCalls);
  revocationOperations.signOut = async () => {
    revocationCalls.push("signOut");
    return { error: new Error("provider detail") };
  };
  assert.deepEqual(
    await deleteValidatedAccount(
      "access-token",
      USER_ID,
      revocationOperations,
    ),
    { ok: false, code: "unavailable" },
  );
  assert.deepEqual(revocationCalls, [
    "getUser:access-token",
    "signOut",
  ]);

  const deletionCalls: string[] = [];
  const deletionOperations = successfulOperations(deletionCalls);
  deletionOperations.deleteUser = async () => ({
    error: new Error("provider detail"),
  });
  assert.deepEqual(
    await deleteValidatedAccount(
      "access-token",
      USER_ID,
      deletionOperations,
    ),
    { ok: false, code: "unavailable" },
  );

  assert.deepEqual(
    await deleteValidatedAccount(
      "access-token",
      USER_ID,
      {
        ...successfulOperations([]),
        getUser: async () => {
          throw new Error("provider detail");
        },
      },
    ),
    { ok: false, code: "unavailable" },
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { requestSecret, secretsMatch } from "./auth";

test("cron trigger secrets accept one bounded bearer token only", () => {
  assert.equal(
    requestSecret(
      new Request("https://timley.dev/api/ingest", {
        headers: { authorization: "Bearer expected-secret" },
      }),
    ),
    "expected-secret",
  );
  assert.equal(
    requestSecret(
      new Request("https://timley.dev/api/ingest?key=query-secret"),
    ),
    null,
  );
  assert.equal(
    requestSecret(
      new Request("https://timley.dev/api/ingest", {
        headers: { authorization: "Bearer two tokens" },
      }),
    ),
    null,
  );
  assert.equal(
    requestSecret(
      new Request("https://timley.dev/api/ingest", {
        headers: { authorization: `Bearer ${"x".repeat(513)}` },
      }),
    ),
    null,
  );
});

test("cron secrets require an exact configured match", () => {
  assert.equal(secretsMatch("expected-secret", "expected-secret"), true);
  assert.equal(secretsMatch("wrong-secret", "expected-secret"), false);
  assert.equal(secretsMatch("", "expected-secret"), false);
  assert.equal(secretsMatch("expected-secret", undefined), false);
});

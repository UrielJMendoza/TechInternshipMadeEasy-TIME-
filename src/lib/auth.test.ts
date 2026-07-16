import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeCronRequest,
  requestBearerToken,
  timingSafeEqualText,
} from "./auth";

function request(url = "https://timley.dev/api/ingest", authorization?: string) {
  return new Request(url, {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

test("cron auth accepts only an exact Authorization bearer token", async () => {
  assert.equal(
    await authorizeCronRequest(request(undefined, "Bearer expected-token"), "expected-token"),
    true,
  );
  assert.equal(
    await authorizeCronRequest(request(undefined, "Bearer wrong-token"), "expected-token"),
    false,
  );
  assert.equal(
    await authorizeCronRequest(request(undefined, "Basic expected-token"), "expected-token"),
    false,
  );
});

test("query-string credentials and missing configuration fail closed", async () => {
  const queryCredential = request("https://timley.dev/api/ingest?key=expected-token");
  assert.equal(requestBearerToken(queryCredential), null);
  assert.equal(await authorizeCronRequest(queryCredential, "expected-token"), false);
  assert.equal(
    await authorizeCronRequest(request(undefined, "Bearer expected-token"), ""),
    false,
  );
});

test("malformed bearer values are rejected and digest comparison is exact", async () => {
  assert.equal(requestBearerToken(request(undefined, "Bearer has whitespace")), null);
  assert.equal(requestBearerToken(request(undefined, "Bearer ")), null);
  assert.equal(await timingSafeEqualText("same", "same"), true);
  assert.equal(await timingSafeEqualText("short", "a-different-length"), false);
});

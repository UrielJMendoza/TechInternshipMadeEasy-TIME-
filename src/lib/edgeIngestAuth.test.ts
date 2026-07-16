import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { authorizeEdgeIngestRequest } from "./edgeIngestAuth";

function request(authorization?: string) {
  return new Request("https://example.supabase.co/functions/v1/ingest", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

test("Edge ingest auth delegates only a well-formed Bearer token", async () => {
  const received: string[] = [];
  const expectedToken = "a".repeat(64);
  const wrongToken = "b".repeat(64);
  const expectedDigest = createHash("sha256").update(expectedToken).digest("hex");
  const validate = async (digest: string) => {
    received.push(digest);
    return digest === expectedDigest;
  };

  assert.equal(
    await authorizeEdgeIngestRequest(request(`Bearer ${expectedToken}`), validate),
    true,
  );
  assert.equal(
    await authorizeEdgeIngestRequest(request(`Bearer ${wrongToken}`), validate),
    false,
  );
  assert.equal(received[0], expectedDigest);
  assert.match(received[1], /^[0-9a-f]{64}$/);
  assert.notEqual(received[1], wrongToken);
});

test("Edge ingest auth rejects malformed requests before validation", async () => {
  let calls = 0;
  const validate = async () => {
    calls += 1;
    return true;
  };

  assert.equal(await authorizeEdgeIngestRequest(request(), validate), false);
  assert.equal(
    await authorizeEdgeIngestRequest(request("Basic expected-token"), validate),
    false,
  );
  assert.equal(
    await authorizeEdgeIngestRequest(request("Bearer has whitespace"), validate),
    false,
  );
  assert.equal(
    await authorizeEdgeIngestRequest(request("Bearer not-64-hex"), validate),
    false,
  );
  assert.equal(calls, 0);
});

test("Edge ingest auth fails closed when database validation fails", async () => {
  assert.equal(
    await authorizeEdgeIngestRequest(
      request(`Bearer ${"a".repeat(64)}`),
      async () => {
        throw new Error("database unavailable");
      },
    ),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { handleTrackingAliasRequest } from "./route";

test("invalid alias input performs no privileged resolution", async () => {
  let calls = 0;
  const response = await handleTrackingAliasRequest(
    new Request("http://local/api/tracking/resolve", {
      method: "POST",
      body: JSON.stringify({ urls: ["http://unsafe.example/job"] }),
    }),
    { resolve: async () => { calls += 1; return []; } },
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("returns only aliases matched by their URL hashes", async () => {
  const url = "https://example.com/jobs/legacy";
  const expectedHash = "6669992954a4abe828bc88ad0bad45ddc85410ac64ebf5c325aece4afab0fd22";
  const response = await handleTrackingAliasRequest(
    new Request("http://local/api/tracking/resolve", {
      method: "POST",
      body: JSON.stringify({ urls: [url] }),
    }),
    {
      resolve: async (hashes) => {
        assert.deepEqual(hashes, [expectedHash]);
        return [{
          url_hash: expectedHash,
          tracking_key: "00000000-0000-4000-8000-000000000001",
        }];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    aliases: { [url]: "00000000-0000-4000-8000-000000000001" },
  });
});

test("rejects oversized alias batches and bodies before resolution", async () => {
  let calls = 0;
  const dependencies = { resolve: async () => { calls += 1; return []; } };
  const tooManyUrls = Array.from(
    { length: 101 },
    (_, index) => `https://example.com/jobs/${index}`,
  );

  const batchResponse = await handleTrackingAliasRequest(
    new Request("http://local/api/tracking/resolve", {
      method: "POST",
      body: JSON.stringify({ urls: tooManyUrls }),
    }),
    dependencies,
  );
  const bodyResponse = await handleTrackingAliasRequest(
    new Request("http://local/api/tracking/resolve", {
      method: "POST",
      body: JSON.stringify({ urls: [`https://example.com/${"a".repeat(65_536)}`] }),
    }),
    dependencies,
  );

  assert.equal(batchResponse.status, 400);
  assert.equal(bodyResponse.status, 413);
  assert.equal(calls, 0);
});

test("deduplicates URLs and fails closed when public resolution is unavailable", async () => {
  const url = "https://example.com/jobs/legacy";
  let receivedHashes: string[] = [];
  const successResponse = await handleTrackingAliasRequest(
    new Request("http://local/api/tracking/resolve", {
      method: "POST",
      body: JSON.stringify({ urls: [url, url] }),
    }),
    { resolve: async (hashes) => { receivedHashes = hashes; return []; } },
  );
  const errorResponse = await handleTrackingAliasRequest(
    new Request("http://local/api/tracking/resolve", {
      method: "POST",
      body: JSON.stringify({ urls: [url] }),
    }),
    { resolve: async () => { throw new Error("unavailable"); } },
  );

  assert.equal(successResponse.status, 200);
  assert.equal(receivedHashes.length, 1);
  assert.equal(errorResponse.status, 503);
});

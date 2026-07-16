import assert from "node:assert/strict";
import test from "node:test";
import { createJobsHandler } from "./route";

const emptyPage = {
  items: [],
  total: 0,
  facets: { locations: [], categories: [], sources: [], terms: [] },
  nextCursor: null,
  hasMore: false,
  updatedAt: null,
  roleTotals: { internship: 0, new_grad: 0 },
};

test("jobs API validates method and body before querying", async () => {
  let calls = 0;
  const handler = createJobsHandler(async () => {
    calls += 1;
    return emptyPage;
  });

  const methodResponse = await handler(new Request("http://local/api/jobs"));
  const invalidResponse = await handler(new Request("http://local/api/jobs", {
    method: "POST",
    body: "not json",
  }));
  const largeResponse = await handler(new Request("http://local/api/jobs", {
    method: "POST",
    body: "x".repeat(32_769),
  }));

  assert.equal(methodResponse.status, 405);
  assert.equal(invalidResponse.status, 400);
  assert.equal(largeResponse.status, 413);
  assert.equal(calls, 0);
});

test("jobs API returns a private no-store typed page", async () => {
  const handler = createJobsHandler(async (input) => {
    assert.deepEqual(input, { roleType: "internship" });
    return emptyPage;
  });
  const response = await handler(new Request("http://local/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleType: "internship" }),
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), emptyPage);
});

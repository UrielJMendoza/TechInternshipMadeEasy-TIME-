import assert from "node:assert/strict";
import test from "node:test";
import { createIngestHandler } from "./route";

test("invalid cron authentication invokes zero ingestion work", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "configured-secret";
  let calls = 0;
  const handler = createIngestHandler(async () => {
    calls += 1;
    return {};
  });

  try {
    const response = await handler(
      new Request("https://timley.dev/api/ingest?key=configured-secret", {
        method: "POST",
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("valid bearer authentication invokes the runner once", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "configured-secret";
  let calls = 0;
  const handler = createIngestHandler(async () => {
    calls += 1;
    return { inserted: 1 };
  });

  try {
    const response = await handler(
      new Request("https://timley.dev/api/ingest", {
        method: "POST",
        headers: { authorization: "Bearer configured-secret" },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

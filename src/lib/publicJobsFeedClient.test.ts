import assert from "node:assert/strict";
import test from "node:test";
import { createPublicJobsFeed } from "./publicJobsFeed";
import {
  PUBLIC_JOBS_FEED_MEMORY_CACHE_MS,
  beginPublicJobsFeedActivation,
  isCurrentPublicJobsFeedActivation,
  loadPublicJobsFeed,
  resetPublicJobsFeedClientForTests,
} from "./publicJobsFeedClient";
import type { Internship } from "./types";

const activeJob: Internship = {
  id: "job-1",
  title: "Software Intern",
  company: "Example",
  location: "Remote",
  category: "software",
  role_type: "internship",
  season: null,
  salary: null,
  link: "https://example.test/jobs/1",
  source: "fixture",
  sponsorship: null,
  posted_date: "2026-08-16",
  first_seen_at: "2026-08-16T12:00:00.000Z",
  last_seen_at: "2026-08-17T12:00:00.000Z",
  is_active: true,
};

const wire = createPublicJobsFeed({
  jobs: [activeJob],
  generatedAt: "2026-08-17T12:05:00.000Z",
  updatedAt: activeJob.last_seen_at,
});

test("disable then re-enable starts empty instead of exposing stale feed data", () => {
  const disabled = beginPublicJobsFeedActivation(false, 1);
  const reenabled = beginPublicJobsFeedActivation(true, 2);

  assert.deepEqual(disabled, {
    activation: 1,
    data: null,
    error: null,
    isValidating: false,
  });
  assert.deepEqual(reenabled, {
    activation: 2,
    data: null,
    error: null,
    isValidating: true,
  });
});

test("a late refresh result is rejected after disable and re-enable", () => {
  const refreshGeneration = 1;

  assert.equal(
    isCurrentPublicJobsFeedActivation(
      { enabled: true, generation: 1 },
      refreshGeneration,
    ),
    true,
  );
  assert.equal(
    isCurrentPublicJobsFeedActivation(
      { enabled: false, generation: 2 },
      refreshGeneration,
    ),
    false,
  );
  assert.equal(
    isCurrentPublicJobsFeedActivation(
      { enabled: true, generation: 3 },
      refreshGeneration,
    ),
    false,
  );
});

test("public GET deduplicates requests, expires memory, and keeps HTTP caching default", async () => {
  resetPublicJobsFeedClientForTests();
  let now = 1_000;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify(wire), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const [first, duplicate] = await Promise.all([
      loadPublicJobsFeed({ fetcher, now: () => now }),
      loadPublicJobsFeed({ fetcher, now: () => now }),
    ]);
    assert.equal(calls.length, 1);
    assert.deepEqual(duplicate, first);

    await loadPublicJobsFeed({ fetcher, now: () => now });
    assert.equal(calls.length, 1);

    now += PUBLIC_JOBS_FEED_MEMORY_CACHE_MS + 1;
    await loadPublicJobsFeed({ fetcher, now: () => now });
    assert.equal(calls.length, 2);

    await loadPublicJobsFeed({
      bypassMemoryCache: true,
      fetcher,
      now: () => now,
    });
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.input, "/api/public-jobs");
      assert.equal(call.init?.method, "GET");
      assert.equal(call.init?.credentials, "same-origin");
      assert.equal(call.init?.cache, "default");
      assert.equal(call.init?.body, undefined);
    }
  } finally {
    resetPublicJobsFeedClientForTests();
  }
});

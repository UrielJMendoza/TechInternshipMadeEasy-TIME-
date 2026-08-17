import assert from "node:assert/strict";
import test from "node:test";
import { fetchText } from "./ingest/fetch";
import { assessSourceSnapshot, snapshotSafetyLimits } from "./ingest/run";

test("snapshot guard removes deactivation authority from drastic source drops", () => {
  const assessment = assessSourceSnapshot({
    source: "speedyapply",
    fetched: 42,
    accepted: 42,
    activeBaseline: 200,
    configuredComplete: true,
  });

  assert.equal(assessment.completeSnapshot, false);
  assert.match(assessment.warning ?? "", /active baseline of 200/);
});

test("snapshot guard allows a stable complete source snapshot", () => {
  assert.deepEqual(
    assessSourceSnapshot({
      source: "speedyapply",
      fetched: 120,
      accepted: 110,
      activeBaseline: 200,
      configuredComplete: true,
    }),
    { completeSnapshot: true },
  );
});

test("snapshot guard fails closed with per-source floors when no baseline is readable", () => {
  const configuredMinimum =
    snapshotSafetyLimits.minimumAcceptedBySource.northwesternfintech;
  const assessment = assessSourceSnapshot({
    source: "northwesternfintech",
    fetched: configuredMinimum - 1,
    accepted: configuredMinimum - 1,
    activeBaseline: null,
    configuredComplete: true,
  });

  assert.equal(assessment.completeSnapshot, false);
  assert.match(assessment.warning ?? "", /northwesternfintech minimum/);
});

test("snapshot guard never marks an empty or intentionally partial source complete", () => {
  assert.equal(
    assessSourceSnapshot({
      source: "simplify",
      fetched: 300,
      accepted: 0,
      activeBaseline: 250,
      configuredComplete: true,
    }).completeSnapshot,
    false,
  );
  assert.equal(
    assessSourceSnapshot({
      source: "simplify",
      fetched: 300,
      accepted: 250,
      activeBaseline: 250,
      configuredComplete: false,
    }).completeSnapshot,
    false,
  );
});

test("feed transport accepts bounded text and JSON responses", async () => {
  const text = await fetchText("https://example.com/jobs.json", {
    fetchImpl: (async () =>
      new Response('{"jobs":[]}', {
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    maxBytes: 100,
  });

  assert.equal(text, '{"jobs":[]}');
});

test("feed transport rejects oversized, empty, HTML, and binary responses", async () => {
  await assert.rejects(
    fetchText("https://example.com/large", {
      fetchImpl: (async () =>
        new Response("x".repeat(11), {
          headers: { "content-type": "text/plain" },
        })) as typeof fetch,
      maxBytes: 10,
    }),
    /response limit/,
  );
  await assert.rejects(
    fetchText("https://example.com/empty", {
      fetchImpl: (async () => new Response("")) as typeof fetch,
    }),
    /empty response/,
  );
  await assert.rejects(
    fetchText("https://example.com/error-page", {
      fetchImpl: (async () =>
        new Response("<!doctype html><title>Not a feed</title>", {
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
    }),
    /HTML instead of a feed/,
  );
  await assert.rejects(
    fetchText("https://example.com/image", {
      fetchImpl: (async () =>
        new Response("not really an image", {
          headers: { "content-type": "image/png" },
        })) as typeof fetch,
    }),
    /unsupported content type/,
  );
});

test("feed transport aborts a source that exceeds its deadline", async () => {
  const neverFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as typeof fetch;

  await assert.rejects(
    fetchText("https://example.com/slow", {
      fetchImpl: neverFetch,
      timeoutMs: 5,
    }),
    /timed out after 5ms/,
  );
});

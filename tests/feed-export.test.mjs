import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  exportPageUrl,
  fetchPublicRows,
  PUBLIC_JOB_FIELDS,
  RETENTION_DAYS,
  runExport,
  shardRows,
  shouldExport,
  supabaseTarget,
  validateRows,
} from "../scripts/export-feed-snapshot.mjs";

const NOW = Date.parse("2026-09-28T07:05:00.000Z");

function row(index, overrides = {}) {
  return {
    id: `row-${String(index).padStart(5, "0")}`,
    title: "Software Engineer Intern",
    company: "Acme",
    primary_apply_url: `https://jobs.lever.co/acme/${index}`,
    first_seen_at: "2026-09-20T06:15:00.000Z",
    is_active: true,
    ...overrides,
  };
}

/** A PostgREST stand-in that pages a fixed table and reports its size. */
function repository(rows, { status = 200 } = {}) {
  const requests = [];
  return {
    requests,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      if (status !== 200) return new Response("restricted", { status });
      const offset = Number(url.searchParams.get("offset"));
      const page = rows.slice(offset, offset + Number(url.searchParams.get("limit")));
      return Response.json(page, { headers: { "content-range": `${offset}-${offset + page.length - 1}/${rows.length}` } });
    },
  };
}

async function committedCopy(rowCount) {
  const directory = await mkdtemp(join(tmpdir(), "timley-feed-"));
  const rows = Array.from({ length: rowCount }, (_, index) => row(index));
  const shards = shardRows(rows);
  await Promise.all(shards.map((shard, index) =>
    writeFile(join(directory, `jobs-${String(index).padStart(2, "0")}.json`), JSON.stringify(shard)),
  ));
  await writeFile(join(directory, "captured-at.json"), JSON.stringify({ capturedAt: "2026-08-31T22:15:17.000Z" }));
  return pathToFileURL(`${directory}/`);
}

async function readSnapshot(dataDir) {
  const shards = await Promise.all(Array.from({ length: 11 }, (_, index) =>
    readFile(new URL(`jobs-${String(index).padStart(2, "0")}.json`, dataDir), "utf8").then(JSON.parse),
  ));
  const { capturedAt } = JSON.parse(await readFile(new URL("captured-at.json", dataDir), "utf8"));
  return { rows: shards.flat(), capturedAt };
}

test("only production builds export unless explicitly configured", () => {
  assert.equal(shouldExport({ VERCEL_ENV: "production" }), true);
  assert.equal(shouldExport({ VERCEL_ENV: "preview" }), false);
  assert.equal(shouldExport({}), false);
  assert.equal(shouldExport({ TIMLEY_EXPORT_FEED: "true" }), true);
  assert.equal(shouldExport({ VERCEL_ENV: "production", TIMLEY_EXPORT_FEED: "false" }), false);
  assert.equal(shouldExport({ VERCEL_ENV: "production", TIMLEY_USE_DEMO_JOBS: "true" }), false);
});

test("the export only ever uses a publishable key over HTTPS", () => {
  const defaults = supabaseTarget({});
  assert.match(defaults.key, /^sb_publishable_/);
  assert.equal(supabaseTarget({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_nope" }).key, defaults.key);
  assert.equal(supabaseTarget({ NEXT_PUBLIC_SUPABASE_URL: "http://insecure.example" }).url, defaults.url);
  assert.equal(supabaseTarget({ NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co/rest" }).url, "https://other.supabase.co");
});

test("exports request active listings inside the retention window", () => {
  const cutoff = new Date(NOW - RETENTION_DAYS * 86_400_000);
  const url = exportPageUrl("https://project.supabase.co", cutoff, 2000);
  assert.equal(url.searchParams.get("is_active"), "eq.true");
  assert.equal(url.searchParams.get("first_seen_at"), "gte.2026-06-30T07:05:00.000Z");
  assert.equal(url.searchParams.get("or"), "(posted_date.is.null,posted_date.gte.2026-06-30)");
  assert.equal(url.searchParams.get("order"), "id.asc");
  assert.equal(url.searchParams.get("offset"), "2000");
  assert.equal(url.searchParams.get("select"), PUBLIC_JOB_FIELDS.join(","));
});

test("the export field list and retention match the live reader", async () => {
  const live = await readFile(new URL("../lib/jobs/live.ts", import.meta.url), "utf8");
  const selectBlock = live.match(/const SELECT_FIELDS = \[([\s\S]*?)\]\.join/)?.[1] ?? "";
  assert.deepEqual([...selectBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]), PUBLIC_JOB_FIELDS);
  assert.equal(Number(live.match(/export const RETENTION_DAYS = (\d+);/)?.[1]), RETENTION_DAYS);
});

test("pages are read completely and captured before the export began", async () => {
  const rows = Array.from({ length: 2345 }, (_, index) => row(index));
  const { fetchImpl, requests } = repository(rows);
  const exported = await fetchPublicRows({ url: "https://project.supabase.co", key: "sb_publishable_x", now: NOW, fetchImpl });
  assert.equal(exported.rows.length, 2345);
  assert.equal(requests.length, 3);
  assert.equal(exported.capturedAt, "2026-09-28T06:50:00.000Z");
});

test("implausible exports are refused", () => {
  const rows = Array.from({ length: 10 }, (_, index) => row(index));
  assert.doesNotThrow(() => validateRows(rows, { minimumRows: 10 }));
  assert.throws(() => validateRows(rows, { minimumRows: 11 }), /export_too_small/);
  assert.throws(() => validateRows([...rows, rows[0]], { minimumRows: 1 }), /export_duplicate_ids/);
  assert.throws(() => validateRows([...rows, row(99, { is_active: false })], { minimumRows: 1 }), /export_inactive_row/);
  const incomplete = rows.map((item, index) => index < 5 ? { ...item, title: "" } : item);
  assert.throws(() => validateRows(incomplete, { minimumRows: 1 }), /export_incomplete_rows/);
});

test("shards keep every row in order", () => {
  const rows = Array.from({ length: 23 }, (_, index) => row(index));
  const shards = shardRows(rows);
  assert.equal(shards.length, 11);
  assert.deepEqual(shards.flat(), rows);
});

test("a successful export replaces the snapshot and its capture time", async () => {
  const dataDir = await committedCopy(1000);
  const fresh = Array.from({ length: 1200 }, (_, index) => row(index, { title: "Fresh Intern" }));
  const result = await runExport({ env: { VERCEL_ENV: "production" }, dataDir, fetchImpl: repository(fresh).fetchImpl, now: NOW });
  assert.equal(result.status, "written");
  const snapshot = await readSnapshot(dataDir);
  assert.equal(snapshot.rows.length, 1200);
  assert.equal(snapshot.rows[0].title, "Fresh Intern");
  assert.equal(snapshot.capturedAt, "2026-09-28T06:50:00.000Z");
});

test("a failed or implausible export leaves the committed snapshot untouched", async () => {
  for (const [label, fetchImpl] of [
    ["quota restriction", repository([], { status: 402 }).fetchImpl],
    ["collapsed feed", repository(Array.from({ length: 100 }, (_, index) => row(index))).fetchImpl],
  ]) {
    const dataDir = await committedCopy(5000);
    const before = await readSnapshot(dataDir);
    const result = await runExport({ env: { VERCEL_ENV: "production" }, dataDir, fetchImpl, now: NOW });
    assert.equal(result.status, "kept-committed", label);
    assert.deepEqual(await readSnapshot(dataDir), before, label);
  }
  const skipped = await runExport({ env: { VERCEL_ENV: "preview" }, fetchImpl: () => assert.fail("previews must not export") });
  assert.equal(skipped.status, "skipped");
});

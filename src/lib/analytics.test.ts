import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countBucket, queryLengthBucket } from "./analytics";

test("analytics reduces counts and search text to coarse buckets", () => {
  assert.deepEqual(
    [0, 1, 2, 6, 21, 51].map(countBucket),
    ["0", "1", "2-5", "6-20", "21-50", "51+"],
  );
  assert.deepEqual(
    [0, 1, 4, 11, 31].map(queryLengthBucket),
    ["0", "1-3", "4-10", "11-30", "31+"],
  );
});

test("the analytics API is event-specific and contains no private payload fields", () => {
  const source = readFileSync(new URL("./analytics.ts", import.meta.url), "utf8");
  for (const event of [
    "search",
    "filter",
    "job_opened",
    "apply_clicked",
    "job_saved",
    "stage_changed",
    "search_saved",
    "alert_enabled",
    "collection_shared",
    "tracker_revisited",
  ]) {
    assert.match(source, new RegExp(`"${event}"`));
  }
  assert.doesNotMatch(
    source,
    /\b(raw_query|query_text|job_title|company_name|job_id|contact|notes?|email|url)\s*:/,
  );
  assert.doesNotMatch(source, /export function (track|emit)\s*\(/);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedJob } from "./types";
import { applyPostFilters, dedupeKey } from "./ingest/normalize";
import { normalizeNorthwesternLocation } from "./ingest/sources/northwestern-quant";

function fixtureJob(location: string): NormalizedJob {
  return {
    title: "Software Engineering Intern",
    company: "Example Company",
    location,
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    salary: null,
    link: "https://example.com/apply",
    source: "fixture",
    sponsorship: null,
    posted_date: null,
    dedupe_key: "old-key",
  };
}

test("post filters sanitize mixed locations and recompute keys without mutating input", () => {
  const input = fixtureJob("London, UK; Chicago, IL");
  const [result] = applyPostFilters([input]);

  assert.notEqual(result, input);
  assert.equal(input.location, "London, UK; Chicago, IL");
  assert.equal(input.dedupe_key, "old-key");
  assert.equal(result.location, "Chicago, IL");
  assert.match(result.dedupe_key, /^job_/);
  assert.equal(result.canonical_record_key, result.dedupe_key);
  assert.equal(
    `${result.canonical_company}|${result.normalized_title}|${result.normalized_location}`,
    dedupeKey(result.company, result.title, "Chicago, IL"),
  );
});

test("post filters reject foreign-only locations but retain US remote and blanks", () => {
  const results = applyPostFilters([
    fixtureJob("Amsterdam, NH"),
    fixtureJob("Remote in Canada"),
    fixtureJob("Remote in USA"),
    fixtureJob(""),
  ]);

  assert.deepEqual(results.map((job) => job.location), ["Remote in USA", ""]);
});

test("Northwestern comma lists preserve city-state pairs and split office markets", () => {
  assert.equal(
    normalizeNorthwesternLocation("Chicago, Puerto Rico"),
    "Chicago, IL; Puerto Rico",
  );
  assert.equal(normalizeNorthwesternLocation("Greenwich, CT"), "Greenwich, CT");
  assert.equal(normalizeNorthwesternLocation("Jupiter, Florida"), "Jupiter, Florida");
  assert.equal(
    normalizeNorthwesternLocation("NYC, Oakland, Singapore"),
    "NYC; Oakland; Singapore",
  );
  assert.equal(
    normalizeNorthwesternLocation("Chicago, NYC"),
    "Chicago, IL; New York, NY",
  );
  assert.equal(
    normalizeNorthwesternLocation("Chicago, Austin"),
    "Chicago, IL; Austin, TX",
  );
  assert.equal(
    normalizeNorthwesternLocation("New York, NY; Boston, MA; Miami, FL"),
    "New York, NY; Boston, MA; Miami, FL",
  );
});

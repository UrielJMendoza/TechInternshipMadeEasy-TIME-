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
  assert.deepEqual(result.term_keys, ["summer-2027"]);
  assert.deepEqual(result.observations?.[0].term_keys, ["summer-2027"]);
  assert.equal(
    result.dedupe_key,
    dedupeKey(result.company, result.title, "Chicago, IL"),
  );
});

test("post filters infer only explicit title terms and preserve multiple terms", () => {
  const [explicit] = applyPostFilters([
    fixtureJob("Denver, CO"),
  ].map((job) => ({
    ...job,
    season: null,
    title: "Software Engineer Intern Fall 2026/Winter 2027",
  })));
  const [ambiguous] = applyPostFilters([
    {
      ...fixtureJob("Denver, CO"),
      season: null,
      title: "2027 Software Engineer Intern",
      link: "https://example.com/apply/ambiguous",
    },
  ]);

  assert.deepEqual(explicit.term_keys, ["fall-2026", "winter-2027"]);
  assert.deepEqual(explicit.observations?.[0].term_keys, [
    "fall-2026",
    "winter-2027",
  ]);
  assert.deepEqual(ambiguous.term_keys, []);
});

test("post filters reject foreign-only and blank locations but retain US remote", () => {
  const results = applyPostFilters([
    fixtureJob("Amsterdam, NH"),
    fixtureJob("Remote in Canada"),
    fixtureJob("Remote in USA"),
    fixtureJob(""),
  ]);

  assert.deepEqual(results.map((job) => job.location), ["Remote in USA"]);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_PUBLIC_JOBS,
  PUBLIC_JOBS_FEED_VERSION,
  createPublicJobsFeed,
  parsePublicJobsFeed,
} from "./publicJobsFeed";
import type { Internship } from "./types";

const job: Internship = {
  id: "job-1",
  title: "Cloud Platform Intern",
  company: "Example Labs",
  location: "Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  salary: "$55/hr",
  link: "https://example.test/jobs/1",
  source: "fixture",
  sponsorship: "Offers visa sponsorship",
  posted_date: "2026-08-15",
  first_seen_at: "2026-08-15T12:00:00.000Z",
  last_seen_at: "2026-08-17T12:00:00.000Z",
  is_active: true,
  canonical_url: "https://example.test/careers/1",
  canonical_record_key: "example:1",
  content_fingerprint: "private-pipeline-field",
  verification_status: "destination-reachable",
  sponsorship_confidence: 0.95,
};

test("public jobs feed sends only tracker and alert fields", () => {
  const wire = createPublicJobsFeed({
    jobs: [job],
    generatedAt: "2026-08-17T12:05:00.000Z",
    updatedAt: job.last_seen_at,
  });

  assert.equal(wire.version, PUBLIC_JOBS_FEED_VERSION);
  assert.deepEqual(Object.keys(wire.jobs[0]).sort(), [
    "canonical_record_key",
    "canonical_url",
    "category",
    "company",
    "first_seen_at",
    "id",
    "link",
    "location",
    "posted_date",
    "role_type",
    "salary",
    "sponsorship",
    "title",
  ]);
  const serialized = JSON.stringify(wire);
  for (const excluded of [
    "content_fingerprint",
    "verification_status",
    "sponsorship_confidence",
    "normalized_title",
    "external_job_id",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(excluded));
  }
});

test("client parser validates the feed and restores safe local defaults", () => {
  const parsed = parsePublicJobsFeed(
    createPublicJobsFeed({
      jobs: [job],
      generatedAt: "2026-08-17T12:05:00.000Z",
      updatedAt: job.last_seen_at,
    }),
  );

  assert.equal(parsed.jobs[0].source, "public-feed");
  assert.equal(parsed.jobs[0].season, null);
  assert.equal(parsed.jobs[0].is_active, true);
  assert.equal(parsed.jobs[0].last_seen_at, job.last_seen_at);
  assert.equal(parsed.jobs[0].canonical_record_key, "example:1");
  assert.throws(
    () =>
      parsePublicJobsFeed({
        version: PUBLIC_JOBS_FEED_VERSION,
        generatedAt: "not-a-date",
        updatedAt: null,
        jobs: [],
      }),
    /Invalid public jobs feed/,
  );
  assert.throws(
    () =>
      parsePublicJobsFeed({
        version: PUBLIC_JOBS_FEED_VERSION,
        generatedAt: "2026-08-17T12:05:00.000Z",
        updatedAt: null,
        jobs: [],
      }),
    /Invalid public jobs feed/,
  );
});

test("producer and consumer reject unsafe, inactive, or unbounded feeds", () => {
  const snapshot = {
    jobs: [job],
    generatedAt: "2026-08-17T12:05:00.000Z",
    updatedAt: job.last_seen_at,
  };
  const wire = createPublicJobsFeed(snapshot);

  assert.throws(
    () => createPublicJobsFeed({ ...snapshot, jobs: [{ ...job, is_active: false }] }),
    /bounded active snapshot/,
  );
  assert.throws(
    () =>
      createPublicJobsFeed({
        ...snapshot,
        jobs: Array.from({ length: MAX_PUBLIC_JOBS + 1 }, () => job),
      }),
    /bounded active snapshot/,
  );
  assert.throws(
    () =>
      createPublicJobsFeed({
        ...snapshot,
        jobs: [{ ...job, link: "javascript:alert(1)" }],
      }),
    /unsafe external URL/,
  );
  assert.throws(
    () =>
      createPublicJobsFeed({
        ...snapshot,
        jobs: [{ ...job, title: "", first_seen_at: "not-a-date" }],
      }),
    /Invalid public jobs feed item/,
  );
  assert.throws(
    () =>
      parsePublicJobsFeed({
        ...wire,
        jobs: [{ ...wire.jobs[0], canonical_url: "data:text/html,unsafe" }],
      }),
    /Invalid public jobs feed item/,
  );
});

test("public feed endpoint is cacheable and never accepts private identifiers", () => {
  const source = readFileSync(
    new URL("../app/api/public-jobs/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /export const dynamic = "force-static"/);
  assert.match(source, /export const revalidate = 21600/);
  assert.match(source, /export async function GET\(\)/);
  assert.match(source, /s-maxage=21600/);
  assert.match(source, /snapshot\.loadError \|\|/);
  assert.match(source, /snapshot\.partialData \|\|/);
  assert.match(source, /snapshot\.jobs\.length === 0/);
  assert.doesNotMatch(source, /POST|request\.json|searchParams|cookies\(|headers\(/);
});

test("the public feed uses the shared bounded jobs cache", () => {
  const jobsSource = readFileSync(new URL("./jobs.ts", import.meta.url), "utf8");

  assert.match(jobsSource, /export const JOBS_CACHE_TAG = "timley-public-jobs"/);
  assert.match(jobsSource, /tags: \[JOBS_CACHE_TAG\]/);
});

test("public job reads use the canonical nine-source compatibility view", () => {
  const jobsSource = readFileSync(new URL("./jobs.ts", import.meta.url), "utf8");

  assert.match(
    jobsSource,
    /PUBLIC_JOBS_RELATION = "timley_public_jobs"/,
  );
  assert.doesNotMatch(jobsSource, /\.from\("internships"\)/);
});

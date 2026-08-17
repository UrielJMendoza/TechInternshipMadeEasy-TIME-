import assert from "node:assert/strict";
import test from "node:test";
import type { Internship } from "./types";
import {
  daysAgo,
  plausiblePostedTime,
  postedTime,
  relativeJobAge,
} from "./jobTime";

const NOW = Date.parse("2026-08-17T12:00:00Z");

function fixtureJob(overrides: Partial<Internship> = {}): Internship {
  return {
    id: "fixture",
    title: "Software Engineering Intern",
    company: "Example Labs",
    location: "Denver, CO",
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    salary: null,
    link: "https://example.com/jobs/fixture",
    source: "fixture",
    sponsorship: null,
    posted_date: "2026-08-10",
    first_seen_at: "2026-08-10T00:00:00Z",
    last_seen_at: "2026-08-17T00:00:00Z",
    is_active: true,
    ...overrides,
  };
}

test("posting dates require a real calendar date within the clock-skew allowance", () => {
  assert.equal(
    plausiblePostedTime("2026-08-18", NOW),
    Date.parse("2026-08-18T00:00:00Z"),
  );
  assert.equal(plausiblePostedTime("2026-08-19", NOW), null);
  assert.equal(plausiblePostedTime("2026-02-30", NOW), null);
  assert.equal(plausiblePostedTime("08/17/2026", NOW), null);
});

test("implausibly future source dates fall back to first seen age", () => {
  const job = fixtureJob({
    posted_date: "2030-01-01",
    first_seen_at: "2026-08-07T00:00:00Z",
  });

  assert.equal(postedTime(job, NOW), Date.parse(job.first_seen_at));
  assert.equal(daysAgo(job, NOW), 10);
  assert.equal(relativeJobAge(job, NOW), "10d ago");
});

test("valid source posting dates still take precedence over first seen", () => {
  const job = fixtureJob({
    posted_date: "2026-08-16",
    first_seen_at: "2026-08-01T00:00:00Z",
  });

  assert.equal(daysAgo(job, NOW), 1);
  assert.equal(relativeJobAge(job, NOW), "1d ago");
});

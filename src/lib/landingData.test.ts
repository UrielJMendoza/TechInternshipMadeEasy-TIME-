import assert from "node:assert/strict";
import test from "node:test";
import {
  selectListingCompanies,
  selectShowcaseJob,
} from "./landingData";
import type { Internship } from "./types";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");

function job(
  id: string,
  overrides: Partial<Internship> = {},
): Internship {
  return {
    id,
    title: `Role ${id}`,
    company: `Company ${id}`,
    location: "Denver, CO",
    category: "software",
    role_type: "internship",
    season: null,
    salary: null,
    link: `https://example.com/${id}`,
    source: "source-a",
    sponsorship: null,
    posted_date: null,
    first_seen_at: "2026-07-20T12:00:00.000Z",
    last_seen_at: "2026-07-22T10:00:00.000Z",
    is_active: true,
    ...overrides,
  };
}

test("company selection is unique, active, deterministic, and bounded", () => {
  const jobs = [
    job("a", { company: "NVIDIA" }),
    job("b", { company: " nvidia " }),
    job("c", { company: "Inactive", is_active: false }),
    job("d", { company: "Amazon" }),
    job("e", { company: "Apple" }),
    job("f", { company: "Unknown Startup" }),
  ];

  assert.deepEqual(selectListingCompanies(jobs, 2), ["Amazon", "NVIDIA"]);
  assert.deepEqual(selectListingCompanies([], 12), []);
  assert.deepEqual(selectListingCompanies(jobs, 0), []);
});

test("showcase selection prefers a fresh information-rich real listing", () => {
  const sparse = job("sparse", {
    first_seen_at: "2026-07-21T12:00:00.000Z",
  });
  const richer = job("richer", {
    first_seen_at: "2026-07-20T12:00:00.000Z",
    salary: "$45/hr",
    sponsorship: "offers-sponsorship",
  });

  assert.equal(selectShowcaseJob([sparse, richer], NOW)?.id, "richer");
  assert.equal(selectShowcaseJob([], NOW), null);
});

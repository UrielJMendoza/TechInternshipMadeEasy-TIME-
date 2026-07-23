import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveLandingStats,
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

test("landing statistics are derived only from the active snapshot", () => {
  const jobs = [
    job("a", { salary: "$42/hr", sponsorship: "offers-sponsorship" }),
    job("b", {
      source: "source-b",
      first_seen_at: "2026-06-01T12:00:00.000Z",
    }),
    job("c", { source: "source-a", first_seen_at: "invalid" }),
  ];

  assert.deepEqual(
    deriveLandingStats(
      jobs,
      "2026-07-22T10:00:00.000Z",
      NOW,
      false,
    ),
    {
      openRoles: 3,
      recentlyAdded: 1,
      sourcesRepresented: 2,
      sourceListedPay: 1,
      sponsorshipKnown: 1,
      updatedAt: "2026-07-22T10:00:00.000Z",
    },
  );
});

test("a failed snapshot never renders invented zero totals", () => {
  const stats = deriveLandingStats([], null, NOW, true);
  assert.equal(stats.openRoles, null);
  assert.equal(stats.recentlyAdded, null);
  assert.equal(stats.sourcesRepresented, null);
  assert.equal(stats.sourceListedPay, null);
  assert.equal(stats.sponsorshipKnown, null);
  assert.equal(stats.updatedAt, null);
});

test("company selection is unique, active, deterministic, and bounded", () => {
  const jobs = [
    job("a", { company: "Acme" }),
    job("b", { company: " acme " }),
    job("c", { company: "Inactive", is_active: false }),
    job("d", { company: "Beta" }),
    job("e", { company: "Gamma" }),
  ];

  assert.deepEqual(selectListingCompanies(jobs, 2), ["Acme", "Beta"]);
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

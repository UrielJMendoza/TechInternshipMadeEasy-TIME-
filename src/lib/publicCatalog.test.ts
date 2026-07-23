import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_INDEXABLE_COLLECTION_JOBS,
  buildCompanyProfiles,
  buildPublicCollections,
  companySlugForJob,
  isLegitimateActiveJob,
  jobPublicPath,
} from "./publicCatalog";
import type { Internship } from "./types";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");

function job(
  index: number,
  overrides: Partial<Internship> = {},
): Internship {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Software Engineering Intern ${index}`,
    company: `Example ${index % 3}`,
    canonical_company: `example-${index % 3}`,
    location: "Remote — United States",
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    salary: "$45/hr",
    link: `https://example.com/jobs/${index}`,
    source: "fixture",
    sponsorship: "Offers visa sponsorship",
    posted_date: "2026-07-20",
    first_seen_at: "2026-07-20T12:00:00.000Z",
    last_seen_at: "2026-07-23T11:00:00.000Z",
    is_active: true,
    expiration_status: "active",
    pay_evidence: "employer-listed",
    ...overrides,
  };
}

test("collections require real volume, company diversity, and recent evidence", () => {
  const enough = Array.from(
    { length: MIN_INDEXABLE_COLLECTION_JOBS },
    (_, index) => job(index),
  );
  const collections = buildPublicCollections(enough, NOW);

  assert.equal(
    collections.find((item) => item.slug === "internships")?.indexable,
    true,
  );
  assert.equal(
    collections.find((item) => item.slug === "remote")?.jobs.length,
    enough.length,
  );
  assert.equal(
    collections.find((item) => item.slug === "season-summer-2027")
      ?.indexable,
    true,
  );

  const oneCompany = enough.map((item) => ({
    ...item,
    company: "One Company",
    canonical_company: "one-company",
  }));
  assert.equal(
    buildPublicCollections(oneCompany, NOW).find(
      (item) => item.slug === "internships",
    )?.indexable,
    false,
  );

  const stale = enough.map((item) => ({
    ...item,
    last_seen_at: "2026-06-01T12:00:00.000Z",
  }));
  assert.equal(
    buildPublicCollections(stale, NOW).find(
      (item) => item.slug === "internships",
    )?.indexable,
    false,
  );
});

test("new-this-week uses first observation and seasons use an allowlist", () => {
  const jobs = [
    job(1, { first_seen_at: "2026-07-17T12:00:00.000Z" }),
    job(2, { first_seen_at: "2026-07-15T11:59:59.000Z" }),
    job(3, { season: "Whenever" }),
  ];
  const collections = buildPublicCollections(jobs, NOW);

  assert.deepEqual(
    collections
      .find((item) => item.slug === "new-this-week")
      ?.jobs.map((item) => item.id),
    [jobs[2].id, jobs[0].id],
  );
  assert.equal(
    collections.some((item) => item.slug === "season-whenever"),
    false,
  );
});

test("company observations stay role-level and use adequate history", () => {
  const active = Array.from({ length: 10 }, (_, index) =>
    job(index, {
      company: "Example Labs",
      canonical_company: "Example Labs, Inc.",
      first_seen_at:
        index < 3
          ? "2026-01-10T12:00:00.000Z"
          : index < 6
            ? "2026-03-10T12:00:00.000Z"
            : "2026-06-10T12:00:00.000Z",
      salary: index < 2 ? "$45/hr" : null,
      pay_evidence:
        index === 0
          ? "employer-listed"
          : index === 1
            ? "timley-estimate"
            : "unknown",
      sponsorship:
        index === 0 ? "Offers visa sponsorship" : null,
    }),
  );
  const profile = buildCompanyProfiles(active, [])[0];

  assert.equal(profile.slug, "example-labs");
  assert.equal(profile.indexable, true);
  assert.equal(profile.employerPayCount, 1);
  assert.equal(profile.sponsorshipCounts["offers-sponsorship"], 1);
  assert.equal(profile.sponsorshipCounts.unknown, 9);
  assert.deepEqual(
    profile.history.map((item) => item.month),
    ["2026-01", "2026-03", "2026-06"],
  );
});

test("stable job paths use the database id and expired records are ineligible", () => {
  const active = job(7);
  assert.equal(companySlugForJob(active), "example-1");
  assert.equal(jobPublicPath(active), `/jobs/${active.id}`);
  assert.equal(isLegitimateActiveJob(active), true);
  assert.equal(
    isLegitimateActiveJob({
      ...active,
      expiration_status: "possibly-closed",
    }),
    false,
  );
});

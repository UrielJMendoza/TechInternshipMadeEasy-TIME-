import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationStageRank,
  classifySponsorship,
  compareApplicationStages,
  filterAndSortJobs,
  hasExplicitVisaSponsorship,
  matchesJobSearch,
  matchesVisaSponsorshipFilter,
} from "./jobFilters";
import type { ApplicationStage } from "./applicationTracking";
import type { Internship } from "./types";

test("sponsorship classifier distinguishes positive, negative, restricted, and unknown", () => {
  assert.equal(classifySponsorship("offers-sponsorship"), "offers-sponsorship");
  assert.equal(classifySponsorship("Sponsors visa"), "offers-sponsorship");
  assert.equal(classifySponsorship("no-sponsorship"), "no-sponsorship");
  assert.equal(classifySponsorship("Does not sponsor visas"), "no-sponsorship");
  assert.equal(classifySponsorship("us-citizenship"), "citizens-only");
  assert.equal(classifySponsorship(null), "unknown");
  assert.equal(classifySponsorship("Other"), "unknown");
});

test("visa-only predicate accepts only explicit positive sponsorship", () => {
  assert.equal(hasExplicitVisaSponsorship("offers-sponsorship"), true);
  assert.equal(hasExplicitVisaSponsorship("unknown"), false);
  assert.equal(matchesVisaSponsorshipFilter(null, true), false);
  assert.equal(matchesVisaSponsorshipFilter(null, false), true);
});

test("application stages sort in the required pipeline order", () => {
  const stages: ApplicationStage[] = [
    "not_applied",
    "rejected",
    "applied",
    "offer",
    "oa",
    "interview",
  ];
  assert.deepEqual(stages.sort(compareApplicationStages), [
    "offer",
    "interview",
    "oa",
    "applied",
    "rejected",
    "not_applied",
  ]);
  assert.equal(applicationStageRank("offer"), 0);
});

test("job search includes normalized canonical locations and categories", () => {
  const job = {
    title: "Platform Engineering Intern",
    company: "Example",
    location: "Aurora, CO",
    category: "cloud" as const,
  };
  assert.equal(matchesJobSearch(job, "Denver"), true);
  assert.equal(matchesJobSearch(job, "Cloud / Infra"), true);
  assert.equal(matchesJobSearch(job, "New York"), false);

  const mixedLocation = {
    ...job,
    location: "London, UK; Chicago, IL",
  };
  assert.equal(matchesJobSearch(mixedLocation, "Chicago"), true);
  assert.equal(matchesJobSearch(mixedLocation, "London"), false);
});

const FILTER_NOW = new Date("2026-07-10T12:00:00Z").getTime();

function fixtureJob(
  id: string,
  overrides: Partial<Internship>,
): Internship {
  return {
    id,
    tracking_key: `00000000-0000-4000-8000-${id.padEnd(12, "0").slice(0, 12)}`,
    title: "Software Engineering Intern",
    company: `Company ${id}`,
    location: "Denver, CO",
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    term_keys: ["summer-2027"],
    salary: null,
    link: `https://example.com/${id}`,
    source: "fixture",
    sponsorship: null,
    posted_date: "2026-07-10",
    first_seen_at: "2026-07-10T00:00:00Z",
    last_seen_at: "2026-07-10T00:00:00Z",
    last_checked_at: "2026-07-10T00:00:00Z",
    is_active: true,
    company_domain: null,
    country_code: "US",
    region_code: "CO",
    city: "Denver",
    metro_id: "denver",
    location_type: "onsite",
    normalization_confidence: 1,
    contributing_sources: ["fixture"],
    salary_currency: null,
    salary_minimum: null,
    salary_maximum: null,
    salary_cadence: null,
    annualized_salary_minimum: null,
    annualized_salary_maximum: null,
    salary_parse_confidence: null,
    salary_provenance: null,
    listing_changes: [],
    ...overrides,
  };
}

test("compound remote, visa, and multi-stage filters use AND across groups", () => {
  const remoteVisa = fixtureJob("remote-visa", {
    location: "Remote; Denver, CO",
    sponsorship: "offers-sponsorship",
  });
  const remoteUnknown = fixtureJob("remote-unknown", { location: "Remote" });
  const denverVisa = fixtureJob("denver-visa", {
    sponsorship: "offers-sponsorship",
  });
  const jobs = [remoteVisa, remoteUnknown, denverVisa];

  const result = filterAndSortJobs(jobs, {
    query: "Denver",
    locationIds: [],
    remoteOnly: true,
    visaSponsorship: true,
    stages: ["interview", "offer"],
    freshness: "all",
    collection: "all",
    sort: "application-stage",
    saved: new Set(),
    applications: {
      [remoteVisa.tracking_key]: {
        stage: "interview",
        updatedAt: "2026-07-10T00:00:00Z",
        appliedAt: "2026-07-09T00:00:00Z",
      },
      [denverVisa.tracking_key]: {
        stage: "offer",
        updatedAt: "2026-07-10T00:00:00Z",
        appliedAt: "2026-07-09T00:00:00Z",
      },
    },
    now: FILTER_NOW,
    matchesMajor: () => true,
    matchesNiche: () => true,
  });

  assert.deepEqual(result.map((job) => job.id), ["remote-visa"]);
});

test("physical locations use OR semantics and application-stage sorting is stable", () => {
  const denver = fixtureJob("denver", { company: "Zulu" });
  const newYork = fixtureJob("new-york", {
    company: "Alpha",
    location: "New York, NY",
  });
  const result = filterAndSortJobs([denver, newYork], {
    query: "",
    locationIds: ["denver-co", "new-york-ny"],
    remoteOnly: false,
    visaSponsorship: false,
    stages: [],
    freshness: "all",
    collection: "all",
    sort: "application-stage",
    saved: new Set(),
    applications: {
      [denver.tracking_key]: {
        stage: "applied",
        updatedAt: "2026-07-10T00:00:00Z",
      },
      [newYork.tracking_key]: {
        stage: "offer",
        updatedAt: "2026-07-10T00:00:00Z",
      },
    },
    now: FILTER_NOW,
    matchesMajor: () => true,
    matchesNiche: () => true,
  });

  assert.deepEqual(result.map((job) => job.id), ["new-york", "denver"]);
});

test("salary sorting uses source-listed pay and never category estimates", () => {
  const listed = fixtureJob("listed", {
    salary: "$20/hr",
    posted_date: "2026-07-01",
  });
  const estimated = fixtureJob("estimated", {
    category: "quant",
    salary: null,
    posted_date: "2026-07-10",
  });

  const result = filterAndSortJobs([estimated, listed], {
    query: "",
    locationIds: [],
    remoteOnly: false,
    visaSponsorship: false,
    stages: [],
    freshness: "all",
    collection: "all",
    sort: "salary",
    saved: new Set(),
    applications: {},
    now: FILTER_NOW,
    matchesMajor: () => true,
    matchesNiche: () => true,
  });

  assert.deepEqual(result.map((job) => job.id), ["listed", "estimated"]);
});

test("term filters use OR semantics and keep not-listed explicit", () => {
  const fall = fixtureJob("fall", { term_keys: ["fall-2026"] });
  const summer = fixtureJob("summer", { term_keys: ["summer-2027"] });
  const unclassified = fixtureJob("unclassified", {
    season: null,
    term_keys: [],
  });
  const result = filterAndSortJobs([summer, unclassified, fall], {
    query: "",
    locationIds: [],
    termKeys: ["fall-2026", "not-listed"],
    remoteOnly: false,
    visaSponsorship: false,
    stages: [],
    freshness: "all",
    collection: "all",
    sort: "newest",
    saved: new Set(),
    applications: {},
    now: FILTER_NOW,
    matchesMajor: () => true,
    matchesNiche: () => true,
  });

  assert.deepEqual(result.map((job) => job.id), ["fall", "unclassified"]);
});

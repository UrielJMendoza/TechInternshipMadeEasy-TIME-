import assert from "node:assert/strict";
import test from "node:test";
import type { ApplicationRecords } from "./applicationTracking";
import {
  filterTrackerRows,
  joinTrackedApplications,
  listingHostname,
  safeListingHref,
  summarizeTrackerRows,
} from "./tracker";
import type { Internship } from "./types";

const EARLIER = "2026-07-10T12:00:00.000Z";
const LATER = "2026-07-12T12:00:00.000Z";

function job(overrides: Partial<Internship> = {}): Internship {
  return {
    id: "job-1",
    title: "Software Engineering Intern",
    company: "Example Labs",
    location: "Denver, CO · Hybrid",
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    salary: null,
    link: "https://example.com/jobs/1",
    source: "fixture",
    sponsorship: null,
    posted_date: "2026-07-09",
    first_seen_at: "2026-07-09T12:00:00.000Z",
    last_seen_at: "2026-07-12T12:00:00.000Z",
    is_active: true,
    ...overrides,
  };
}

test("joins records by URL and retains stored details for unmatched records", () => {
  const records: ApplicationRecords = {
    "https://example.com/jobs/1": {
      stage: "interview",
      updatedAt: EARLIER,
      appliedAt: "2026-07-01",
    },
    "https://old.example/jobs/removed": {
      stage: "applied",
      updatedAt: LATER,
      jobTitle: "Platform Intern",
      company: "Old Example",
      locationArrangement: "Remote",
      applicationUrl: "https://old.example/jobs/removed",
    },
  };

  const rows = joinTrackedApplications([job()], records);

  assert.equal(rows.length, 2);
  const removed = rows.find((row) => row.job === null);
  assert.equal(removed?.company, "Old Example");
  assert.equal(removed?.jobTitle, "Platform Intern");
  assert.equal(removed?.listingStatus, "not-in-active-feed");
  assert.equal(
    rows.find((row) => row.job !== null)?.listingStatus,
    "active",
  );
});

test("matches a stored application URL against a canonical feed URL", () => {
  const records: ApplicationRecords = {
    manual: {
      stage: "preparing",
      updatedAt: LATER,
      applicationUrl: "https://example.com/jobs/canonical",
    },
  };
  const rows = joinTrackedApplications(
    [job({ canonical_url: "https://example.com/jobs/canonical" })],
    records,
  );

  assert.equal(rows[0].job?.company, "Example Labs");
});

test("filters by stage, action timing, and rich local search fields", () => {
  const records: ApplicationRecords = {
    first: {
      stage: "interview",
      updatedAt: LATER,
      company: "Example Labs",
      jobTitle: "Software Intern",
      nextAction: "Email recruiting coordinator",
      nextActionAt: "2026-07-09",
      notes: "Met at campus fair",
    },
    second: {
      stage: "saved",
      updatedAt: EARLIER,
      company: "Second Co",
      jobTitle: "Analyst",
    },
  };
  const rows = joinTrackedApplications([], records);

  assert.deepEqual(
    filterTrackerRows(rows, {
      query: "campus",
      stage: "interview",
      action: "overdue",
      sort: "updated-desc",
      today: "2026-07-10",
    }).map((row) => row.jobKey),
    ["first"],
  );
  assert.deepEqual(
    filterTrackerRows(rows, {
      query: "",
      stage: "all",
      action: "no-date",
      sort: "company",
      today: "2026-07-10",
    }).map((row) => row.jobKey),
    ["second"],
  );
});

test("sorts next actions before records without action dates", () => {
  const rows = joinTrackedApplications([], {
    later: {
      stage: "applied",
      updatedAt: LATER,
      nextActionAt: "2026-07-18",
    },
    none: { stage: "saved", updatedAt: LATER },
    sooner: {
      stage: "assessment",
      updatedAt: EARLIER,
      nextActionAt: "2026-07-14",
    },
  });

  assert.deepEqual(
    filterTrackerRows(rows, {
      query: "",
      stage: "all",
      action: "all",
      sort: "next-action",
      today: "2026-07-10",
    }).map((row) => row.jobKey),
    ["sooner", "later", "none"],
  );
});

test("summarizes every pipeline stage and upcoming actions", () => {
  const rows = joinTrackedApplications(
    [job()],
    {
      "https://example.com/jobs/1": {
        stage: "offer",
        updatedAt: LATER,
        nextActionAt: "2026-07-12",
      },
      removed: {
        stage: "archived",
        updatedAt: EARLIER,
        nextActionAt: "2026-07-09",
      },
    },
  );

  assert.deepEqual(summarizeTrackerRows(rows, "2026-07-10"), {
    total: 2,
    activeListings: 1,
    notInActiveFeed: 1,
    overdue: 1,
    nextSevenDays: 1,
    byStage: {
      saved: 0,
      preparing: 0,
      applied: 0,
      assessment: 0,
      interview: 0,
      offer: 1,
      rejected: 0,
      withdrawn: 0,
      archived: 1,
    },
  });
});

test("only exposes http and https application links", () => {
  assert.equal(
    safeListingHref("https://www.example.com/jobs/1"),
    "https://www.example.com/jobs/1",
  );
  assert.equal(safeListingHref("javascript:alert(1)"), null);
  assert.equal(safeListingHref("not a url"), null);
  assert.equal(listingHostname("https://www.example.com/jobs/1"), "example.com");
  assert.equal(listingHostname("not a url"), "Saved application");
});

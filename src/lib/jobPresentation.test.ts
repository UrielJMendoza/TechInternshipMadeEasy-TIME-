import assert from "node:assert/strict";
import test from "node:test";
import {
  formatEvidenceDate,
  listingEvidenceFor,
  missingJobEvidence,
  similarJobsFor,
  sourceDetailsFor,
} from "./jobPresentation";
import type { Internship } from "./types";

const baseJob: Internship = {
  id: "job-1",
  title: "Platform Engineering Intern",
  company: "Northstar",
  location: "Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  salary: "$35/hr",
  link: "https://example.com/jobs/1",
  source: "simplify",
  sponsorship: "Offers sponsorship",
  posted_date: "2026-07-10",
  first_seen_at: "2026-07-10T00:00:00Z",
  last_seen_at: "2026-07-20T00:00:00Z",
  is_active: true,
};

test("listing evidence distinguishes verified, possibly closed, and expired roles", () => {
  const now = Date.parse("2026-07-22T00:00:00Z");
  assert.equal(listingEvidenceFor(baseJob, now).state, "active");
  assert.equal(
    listingEvidenceFor(
      {
        ...baseJob,
        last_verified_at: "2026-07-21T00:00:00Z",
        verification_status: "source-observed",
      },
      now,
    ).state,
    "verified",
  );
  assert.equal(
    listingEvidenceFor(
      { ...baseJob, last_seen_at: "2026-06-22T00:00:00Z" },
      now,
    ).state,
    "active",
  );
  assert.equal(
    listingEvidenceFor(
      { ...baseJob, last_seen_at: "2026-06-21T00:00:00Z" },
      now,
    ).state,
    "possibly-closed",
  );
  assert.equal(
    listingEvidenceFor(
      { ...baseJob, last_seen_at: "2026-05-01T00:00:00Z" },
      now,
    ).state,
    "possibly-closed",
  );
  assert.equal(
    listingEvidenceFor({ ...baseJob, is_active: false }, now).state,
    "possibly-closed",
  );
  assert.equal(
    listingEvidenceFor(
      { ...baseJob, is_active: false, expiration_status: "expired" },
      now,
    ).state,
    "expired",
  );
});

test("missing evidence is reported without treating estimates as source data", () => {
  assert.deepEqual(
    missingJobEvidence({
      ...baseJob,
      location: "",
      season: null,
      salary: null,
      sponsorship: null,
      posted_date: null,
    }),
    [
      "location",
      "start period",
      "employer-listed compensation",
      "sponsorship evidence",
      "original posting date",
      "source verification time",
    ],
  );
});

test("source labels and evidence dates remain factual", () => {
  assert.equal(sourceDetailsFor("simplify").label, "SimplifyJobs");
  assert.match(
    sourceDetailsFor("simplify").repositoryUrl ?? "",
    /github\.com\/SimplifyJobs/,
  );
  assert.equal(sourceDetailsFor("custom-feed").label, "custom-feed");
  assert.equal(formatEvidenceDate("2026-07-10T12:00:00Z"), "Jul 10, 2026");
  assert.equal(formatEvidenceDate(null), "Unavailable");
});

test("similar roles are selected only from real related listings", () => {
  const sameCompany = {
    ...baseJob,
    id: "job-2",
    link: "https://example.com/jobs/2",
    title: "Security Intern",
    category: "security" as const,
  };
  const sameCategory = {
    ...baseJob,
    id: "job-3",
    link: "https://example.com/jobs/3",
    company: "Another Co",
  };
  const sameRoleType = {
    ...baseJob,
    id: "job-4",
    link: "https://example.com/jobs/4",
    company: "Third Co",
    category: "finance" as const,
  };
  const unrelated = {
    ...baseJob,
    id: "job-5",
    link: "https://example.com/jobs/5",
    company: "Fourth Co",
    category: "finance" as const,
    role_type: "new_grad" as const,
  };
  const inactiveMatch = {
    ...sameCategory,
    id: "job-6",
    link: "https://example.com/jobs/6",
    is_active: false,
  };

  assert.deepEqual(
    similarJobsFor(baseJob, [
      baseJob,
      inactiveMatch,
      sameRoleType,
      unrelated,
      sameCategory,
      sameCompany,
    ]).map((job) => job.id),
    ["job-2", "job-3"],
  );
});

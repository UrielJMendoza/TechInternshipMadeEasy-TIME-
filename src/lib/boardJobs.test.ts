import assert from "node:assert/strict";
import test from "node:test";
import { createBoardJob } from "./boardJobs";
import type { Internship } from "./types";

const fixture: Internship = {
  id: "job-1",
  title: "Platform Engineering Intern",
  company: "Example Labs",
  location: "Denver, CO",
  category: "cloud",
  role_type: "internship",
  season: "Summer 2027",
  salary: "$35/hr",
  link: "https://example.com/jobs/1",
  source: "simplify",
  sponsorship: "Offers sponsorship",
  posted_date: "2026-08-17",
  first_seen_at: "2026-08-17T00:00:00Z",
  last_seen_at: "2026-08-17T12:00:00Z",
  last_verified_at: "2026-08-17T12:00:00Z",
  is_active: true,
  canonical_url: "https://example.com/jobs/1",
  external_job_id: "external-1",
  requisition_id: "req-1",
  verification_status: "source-observed",
  duplicate_group: "duplicate-1",
  original_source: "server-only",
  canonical_company: "example labs",
  normalized_title: "platform engineering intern",
  normalized_location: "denver, co",
  content_fingerprint: "server-only-fingerprint",
  closed_at: null,
  pay_evidence: "employer-listed",
  sponsorship_status: "confirmed",
  sponsorship_source: "server-only",
  sponsorship_confidence: 1,
  canonical_record_key: "server-only-key",
};

test("board serialization keeps UI evidence and removes ingestion bookkeeping", () => {
  const result = createBoardJob(fixture);

  assert.equal(result.title, fixture.title);
  assert.equal(result.last_verified_at, fixture.last_verified_at);
  assert.equal(result.canonical_url, fixture.canonical_url);
  assert.equal(result.requisition_id, fixture.requisition_id);
  assert.equal(result.verification_status, fixture.verification_status);

  const serialized = JSON.stringify(result);
  for (const field of [
    "original_source",
    "canonical_company",
    "normalized_title",
    "normalized_location",
    "content_fingerprint",
    "closed_at",
    "pay_evidence",
    "sponsorship_status",
    "sponsorship_source",
    "sponsorship_confidence",
    "canonical_record_key",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${field}"`));
  }
});

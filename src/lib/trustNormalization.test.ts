import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedJob } from "./types";
import {
  applicationUrlKey,
  canonicalCompanyIdentity,
  canonicalizeApplicationUrl,
  dedupeJobs,
  extractJobIdentifiers,
} from "./ingest/normalize";

function job(
  overrides: Partial<NormalizedJob> = {},
): NormalizedJob {
  return {
    title: "Software Engineering Intern",
    company: "Acme, Inc.",
    location: "New York, NY",
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    salary: null,
    link: "https://careers.example.com/jobs/software-intern-a",
    source: "source-a",
    sponsorship: null,
    posted_date: null,
    dedupe_key: "adapter-placeholder",
    ...overrides,
  };
}

test("canonical company identity uses explicit aliases and preserves meaningful suffixes", () => {
  assert.equal(canonicalCompanyIdentity("Meta Platforms, Inc."), "meta");
  assert.equal(canonicalCompanyIdentity("Facebook"), "meta");
  assert.equal(canonicalCompanyIdentity("Acme Labs"), "acme-labs");
  assert.equal(canonicalCompanyIdentity("Acme"), "acme");
  assert.equal(canonicalCompanyIdentity("Northstar Trading LLC"), "northstar-trading");
});

test("canonical URLs remove tracking, normalize ATS variants, and preserve job parameters", () => {
  assert.equal(
    canonicalizeApplicationUrl(
      "https://Boards.Greenhouse.io/Acme/jobs/12345/apply?utm_source=list&gh_jid=12345",
    ),
    "https://job-boards.greenhouse.io/acme/jobs/12345?gh_jid=12345",
  );
  assert.equal(
    canonicalizeApplicationUrl(
      "https://jobs.lever.co/ACME/ABC-123/apply?lever-source=community",
    ),
    "https://jobs.lever.co/acme/ABC-123",
  );
  assert.equal(
    canonicalizeApplicationUrl(
      "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Denver/Engineer_R12345?source=board",
    ),
    "https://acme.wd5.myworkdayjobs.com/Careers/job/Denver/Engineer_R12345",
  );
  assert.equal(
    applicationUrlKey("https://jobs.lever.co/Acme/ABC-123"),
    applicationUrlKey("https://jobs.lever.co/acme/abc-123/apply?utm_medium=referral"),
  );
});

test("application URLs allow only absolute credential-free HTTP destinations", () => {
  assert.equal(
    canonicalizeApplicationUrl("http://Careers.Example.com/jobs/123#apply"),
    "http://careers.example.com/jobs/123",
  );

  for (const unsafe of [
    "javascript:alert(document.domain)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://careers.example.com/jobs/123",
    "https://candidate:secret@careers.example.com/jobs/123",
    "//careers.example.com/jobs/123",
    "https://",
    "not a URL",
    "https://careers.example.com/jobs/12\n3",
  ]) {
    assert.equal(canonicalizeApplicationUrl(unsafe), "", unsafe);
  }
});

test("unsafe application destinations are dropped before deduplication", () => {
  const result = dedupeJobs([
    job({ link: "javascript:alert(1)" }),
    job({ link: "https://careers.example.com/jobs/safe" }),
  ]);

  assert.deepEqual(result.map((entry) => entry.link), [
    "https://careers.example.com/jobs/safe",
  ]);
});

test("ATS and requisition identifiers are extracted without inventing IDs", () => {
  assert.deepEqual(
    extractJobIdentifiers(
      "https://job-boards.greenhouse.io/acme/jobs/12345",
    ),
    { externalJobId: "12345", requisitionId: null },
  );
  assert.equal(
    extractJobIdentifiers(
      "https://acme.example/careers",
      "Software Intern — Req R98765",
    ).requisitionId,
    "r98765",
  );
  assert.deepEqual(
    extractJobIdentifiers("https://acme.example/careers"),
    { externalJobId: null, requisitionId: null },
  );
});

test("tracking and ATS route variants collapse to one stable canonical record", () => {
  const result = dedupeJobs([
    job({
      link: "https://boards.greenhouse.io/acme/jobs/12345/apply?utm_source=a",
      source: "source-a",
    }),
    job({
      company: "Acme Inc",
      link: "https://job-boards.greenhouse.io/acme/jobs/12345?gh_src=b",
      source: "source-b",
      salary: "$35/hr",
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].salary, "$35/hr");
  assert.equal(result[0].external_job_id, "12345");
  assert.match(result[0].dedupe_key, /^job_/);
  assert.equal(result[0].canonical_record_key, result[0].dedupe_key);
  assert.equal(result[0].verification_status, "source-observed");
});

test("the same requisition merges across redirect variants and employer aliases", () => {
  const result = dedupeJobs([
    job({
      company: "Meta Platforms, Inc.",
      title: "Software Engineer Intern — Req R445566",
      link: "https://careers.meta.com/jobs/R445566?utm_campaign=jobs",
      source: "source-a",
    }),
    job({
      company: "Facebook",
      title: "Software Engineer Intern (Job ID R445566)",
      link: "https://redirect.example/jobs/meta-r445566",
      source: "source-b",
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].requisition_id, "r445566");
  assert.equal(result[0].canonical_company, "meta");
});

test("distinct requisitions are never merged only because title and location match", () => {
  const result = dedupeJobs([
    job({
      title: "Software Engineering Intern — Req R10001",
      link: "https://careers.example.com/openings",
      posted_date: "2026-07-20",
    }),
    job({
      title: "Software Engineering Intern — Req R10002",
      link: "https://careers.example.com/openings",
      posted_date: "2026-07-20",
    }),
  ]);

  assert.equal(result.length, 2);
  assert.notEqual(result[0].dedupe_key, result[1].dedupe_key);
});

test("undated title and location matches remain separate without stronger evidence", () => {
  const result = dedupeJobs([
    job({ link: "https://careers.example.com/jobs/role-one", source: "source-a" }),
    job({ link: "https://careers.example.com/jobs/role-two", source: "source-b" }),
  ]);
  assert.equal(result.length, 2);
});

test("matching posting identity or content fingerprint can merge otherwise separate observations", () => {
  const byPosting = dedupeJobs([
    job({
      link: "https://source-a.example/apply/acme",
      source: "source-a",
      posted_date: "2026-07-20",
    }),
    job({
      company: "Acme Inc",
      link: "https://source-b.example/acme-job",
      source: "source-b",
      posted_date: "2026-07-20",
    }),
  ]);
  assert.equal(byPosting.length, 1);

  const byContent = dedupeJobs([
    job({
      title: "Backend Engineering Intern",
      link: "https://source-a.example/apply/backend",
      content_fingerprint: "sha256:abc",
    }),
    job({
      title: "Backend Engineer Intern",
      link: "https://source-b.example/backend",
      content_fingerprint: "sha256:abc",
    }),
  ]);
  assert.equal(byContent.length, 1);
});

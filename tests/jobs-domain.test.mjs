import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

// The repository intentionally has no TS test-loader dependency. Node's built-in
// type stripper lets this test exercise the exact TypeScript production module
// instead of maintaining a JavaScript copy that could drift.
const domainSource = await readFile(new URL("../lib/jobs/index.ts", import.meta.url), "utf8");
const domainModule = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(domainSource)).toString("base64")}`
);
const companyDomainSource = await readFile(
  new URL("../app/data/company-domains.ts", import.meta.url),
  "utf8",
);
const companyDomainModule = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(companyDomainSource)).toString("base64")}`
);

const {
  DEMO_CANONICAL_JOB_COUNT,
  DEMO_SOURCE_CATALOG_NOTICE,
  InvalidCursorError,
  SOURCE_CATALOG,
  buildAtsDedupeKey,
  buildJobsUrl,
  createDemoSnapshot,
  decodeJobCursor,
  deduplicateJobs,
  getFeedStats,
  getFreshness,
  getJobById,
  getNewestPostedJobs,
  isNewThisWeek,
  normalizeAtsHostname,
  normalizeEmployer,
  normalizeRequisitionId,
  parseFilters,
  queryJobs,
  serializeFilters,
  sortJobsNewestFirst,
} = domainModule;
const { companyDomain, hasKnownCompanyDomain, knownCompanyDomain } = companyDomainModule;

const NOW = "2026-08-19T18:00:00.000Z";
const AS_OF = "2026-08-19T16:00:00.000Z";

function rawRecord(overrides = {}) {
  return {
    sourceRecordId: "greenhouse:record-1",
    sourceId: "greenhouse",
    companyName: "Acme, Inc.",
    canonicalEmployerId: "acme",
    title: "Product Analyst Intern",
    location: "Denver, CO",
    roleLevel: "Internship",
    workplace: "Hybrid",
    category: "Product",
    team: "Product",
    summary: "A representative test role.",
    logoText: "A",
    logoTone: "lilac",
    applicationUrl: "https://example.com/jobs/req-100",
    atsHostname: "boards.greenhouse.io",
    requisitionId: "REQ-100",
    employerPostedAt: "2026-08-19T14:00:00.000Z",
    firstSeenAt: "2026-08-19T14:30:00.000Z",
    lastSeenAt: "2026-08-19T16:00:00.000Z",
    active: true,
    ...overrides,
  };
}

test("the one shared catalog contains nine clearly labelled demo sources", () => {
  assert.equal(SOURCE_CATALOG.length, 9);
  assert.equal(new Set(SOURCE_CATALOG.map((source) => source.id)).size, 9);
  assert.equal(SOURCE_CATALOG.filter((source) => source.type === "official-ats").length, 7);
  assert.equal(SOURCE_CATALOG.filter((source) => source.type === "community-feed").length, 2);
  assert.ok(SOURCE_CATALOG.every((source) => source.isDemo));
  assert.match(DEMO_SOURCE_CATALOG_NOTICE, /demo sources/i);
});

test("the mock snapshot is deterministic and deduplicates to exactly 4,416 active jobs", () => {
  const first = createDemoSnapshot(AS_OF);
  const second = createDemoSnapshot(AS_OF);

  assert.equal(first, second, "the same snapshot should be reused within the server isolate");
  assert.equal(first.jobs.length, DEMO_CANONICAL_JOB_COUNT);
  assert.ok(first.rawRecords.length > first.jobs.length, "mirror records exercise deduplication");
  assert.ok(first.jobs.every((job) => job.active));
  assert.deepEqual(
    new Set(first.rawRecords.map((record) => record.sourceId)),
    new Set(SOURCE_CATALOG.map((source) => source.id)),
  );

  const rebuiltIds = createDemoSnapshot(new Date(AS_OF)).jobs.slice(0, 100).map((job) => job.id);
  assert.deepEqual(rebuiltIds, first.jobs.slice(0, 100).map((job) => job.id));
});

test("every snapshot company has one explicit, unique logo domain mapping", () => {
  const snapshot = createDemoSnapshot(AS_OF);
  const snapshotCompanies = [...new Set(
    snapshot.jobs.map((job) => job.companyName),
  )].sort();
  const snapshotDomains = snapshotCompanies.map((company) => knownCompanyDomain(company));

  assert.ok(snapshotCompanies.every((company) => hasKnownCompanyDomain(company)));
  assert.ok(snapshotDomains.every((domain) => typeof domain === "string" && domain.length > 0));
  assert.ok(snapshotCompanies.length > 24);
  assert.equal(new Set(snapshotDomains).size, 48);
  assert.equal(knownCompanyDomain("Stripe, Inc."), "stripe.com");
  assert.equal(companyDomain("Unmapped Company"), "unmapped.com");
});

test("newest-first is global across categories and known backfills retain their old date", () => {
  const records = [
    rawRecord({
      sourceRecordId: "greenhouse:software",
      requisitionId: "SOFTWARE",
      title: "Software Engineer, New Grad",
      category: "Engineering",
      roleLevel: "New grad",
      employerPostedAt: "2026-08-19T12:00:00.000Z",
      firstSeenAt: "2026-08-19T12:30:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:marketing",
      requisitionId: "MARKETING",
      title: "Marketing Intern",
      category: "Marketing",
      employerPostedAt: "2026-08-19T17:00:00.000Z",
      firstSeenAt: "2026-08-19T17:10:00.000Z",
      lastSeenAt: "2026-08-19T17:30:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:finance",
      requisitionId: "FINANCE",
      title: "Financial Analyst, New Grad",
      category: "Finance",
      roleLevel: "New grad",
      employerPostedAt: "2026-08-19T15:00:00.000Z",
      firstSeenAt: "2026-08-19T15:10:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:missing",
      requisitionId: "MISSING-DATE",
      title: "Operations Intern",
      category: "Operations",
      employerPostedAt: null,
      firstSeenAt: "2026-08-19T17:30:00.000Z",
      lastSeenAt: "2026-08-19T17:40:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:backfill",
      requisitionId: "BACKFILL",
      title: "Cloud Engineer, New Grad",
      category: "Engineering",
      roleLevel: "New grad",
      employerPostedAt: "2026-05-31T18:00:00.000Z",
      firstSeenAt: "2026-08-19T17:50:00.000Z",
      lastSeenAt: "2026-08-19T17:55:00.000Z",
    }),
  ];

  const ordered = sortJobsNewestFirst(deduplicateJobs(records, { now: NOW }));
  assert.deepEqual(
    ordered.map((job) => job.title),
    [
      "Operations Intern",
      "Marketing Intern",
      "Financial Analyst, New Grad",
      "Software Engineer, New Grad",
      "Cloud Engineer, New Grad",
    ],
  );

  const found = ordered[0];
  const backfill = ordered.at(-1);
  assert.equal(getFreshness(found, NOW).kind, "found");
  assert.equal(getFreshness(found, NOW).label, "Found today");
  assert.equal(getFreshness(backfill, NOW).kind, "posted");
  assert.doesNotMatch(getFreshness(backfill, NOW).label, /today|just now/i);
  assert.equal(isNewThisWeek(backfill, NOW), false);
  assert.equal(isNewThisWeek(found, NOW), false, "missing dates never qualify as newly posted");
});

test("community feed dates stay discovery evidence instead of employer posting dates", () => {
  const [job] = deduplicateJobs([
    rawRecord({
      sourceRecordId: "simplify:community-only",
      sourceId: "simplify",
      employerPostedAt: "2026-08-19T17:59:00.000Z",
      firstSeenAt: "2026-08-19T17:30:00.000Z",
      lastSeenAt: "2026-08-19T17:45:00.000Z",
    }),
  ], { now: NOW });

  assert.equal(job.employerPostedAt, null);
  assert.equal(getFreshness(job, NOW).kind, "found");
  assert.equal(isNewThisWeek(job, NOW), false);
});

test("ATS normalization recognizes aliases without broad requisition fuzzy matching", () => {
  assert.equal(normalizeAtsHostname("https://Boards.Greenhouse.io/acme/jobs/1"), "greenhouse.io");
  assert.equal(normalizeAtsHostname("job-boards.greenhouse.io"), "greenhouse.io");
  assert.equal(
    normalizeAtsHostname("acme.wd7.myworkdayjobs.com"),
    "acme.myworkdayjobs.com",
  );
  assert.equal(normalizeEmployer("Acme & Sons, Inc."), "acme and sons");
  assert.equal(normalizeRequisitionId(" # req-10 "), "REQ-10");
  assert.notEqual(normalizeRequisitionId("REQ-10"), normalizeRequisitionId("REQ10"));

  const key = buildAtsDedupeKey(rawRecord());
  assert.ok(key);
  assert.equal(buildAtsDedupeKey(rawRecord({ requisitionId: null })), null);
});

test("exact ATS/employer/requisition matches merge and prefer the official record", () => {
  const official = rawRecord({
    sourceRecordId: "greenhouse:official",
    companyName: "Acme, Inc.",
    applicationUrl: "https://example.com/jobs/official",
    atsHostname: "boards.greenhouse.io",
    requisitionId: "req-100",
    employerPostedAt: "2026-08-18T10:00:00.000Z",
  });
  const communityMirror = rawRecord({
    sourceRecordId: "simplify:mirror",
    sourceId: "simplify",
    companyName: "ACME",
    applicationUrl: "https://example.com/jobs/community-copy",
    atsHostname: "job-boards.greenhouse.io",
    requisitionId: "REQ-100",
    employerPostedAt: "2026-08-19T17:00:00.000Z",
    firstSeenAt: "2026-08-19T15:00:00.000Z",
  });

  const jobs = deduplicateJobs([communityMirror, official], { now: NOW });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].primarySourceId, "greenhouse");
  assert.equal(jobs[0].applicationUrl, official.applicationUrl);
  assert.equal(jobs[0].employerPostedAt, official.employerPostedAt);
  assert.deepEqual(jobs[0].contributingSourceIds, ["greenhouse", "simplify"]);
});

test("uncertain matches, different employers, and different requisitions remain separate", () => {
  const similarWithoutIds = [
    rawRecord({ sourceRecordId: "simplify:a", sourceId: "simplify", requisitionId: null }),
    rawRecord({ sourceRecordId: "github:b", sourceId: "github-new-grad", requisitionId: null }),
  ];
  assert.equal(deduplicateJobs(similarWithoutIds, { now: NOW }).length, 2);

  const sameRequisitionDifferentEmployer = [
    rawRecord({ sourceRecordId: "greenhouse:acme", canonicalEmployerId: "acme" }),
    rawRecord({
      sourceRecordId: "greenhouse:other",
      companyName: "Other Company",
      canonicalEmployerId: "other-company",
    }),
  ];
  assert.equal(deduplicateJobs(sameRequisitionDifferentEmployer, { now: NOW }).length, 2);

  const sameEmployerDifferentRequisition = [
    rawRecord({ sourceRecordId: "greenhouse:req-100", requisitionId: "REQ-100" }),
    rawRecord({ sourceRecordId: "greenhouse:req-101", requisitionId: "REQ-101" }),
  ];
  assert.equal(deduplicateJobs(sameEmployerDifferentRequisition, { now: NOW }).length, 2);
});

test("filters parse defensively and serialize to one canonical copied URL", () => {
  const params = new URLSearchParams();
  params.set("q", "  Data   science  ");
  params.set("level", "new-grad");
  params.set("location", "  New   York ");
  params.set("remote", "true");
  params.set("sponsorship", "1");
  params.set("source", "lever");
  params.set("cursor", "must-not-be-copied");

  const filters = parseFilters(params);
  assert.deepEqual(filters, {
    q: "Data science",
    level: "new-grad",
    location: "New York",
    remote: true,
    sponsorship: true,
    source: "lever",
  });
  assert.equal(
    serializeFilters(filters),
    "level=new-grad&q=Data+science&location=New+York&remote=true&sponsorship=true&source=lever",
  );
  assert.equal(
    buildJobsUrl(filters),
    "/jobs?level=new-grad&q=Data+science&location=New+York&remote=true&sponsorship=true&source=lever",
  );

  assert.deepEqual(
    parseFilters({ level: "not-a-level", source: "unknown", remote: "false" }),
    { q: "", level: "all", location: "", remote: false, sponsorship: false, source: "" },
  );
});

test("cursor pagination walks every job once, including equal-boundary-safe tuple ordering", () => {
  const filters = parseFilters();
  const seen = [];
  let cursor;
  let expectedTotal;
  let pageCount = 0;

  do {
    const page = queryJobs(filters, { cursor, limit: 60, asOf: AS_OF, now: NOW });
    expectedTotal ??= page.total;
    assert.equal(page.total, expectedTotal);
    assert.ok(page.items.length <= 60);
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
    pageCount += 1;
    assert.ok(pageCount < 100, "pagination should terminate");
  } while (cursor);

  assert.equal(expectedTotal, DEMO_CANONICAL_JOB_COUNT);
  assert.equal(seen.length, expectedTotal);
  assert.equal(new Set(seen).size, expectedTotal);
});

test("cursors preserve their snapshot and cannot be reused with different filters", () => {
  const filters = parseFilters({ level: "internship", remote: "true" });
  const first = queryJobs(filters, { limit: 30, asOf: AS_OF, now: NOW });
  assert.ok(first.nextCursor);
  const decoded = decodeJobCursor(first.nextCursor);
  assert.equal(decoded.asOf, AS_OF);
  assert.equal(decoded.evaluatedAt, NOW);

  const second = queryJobs(filters, {
    cursor: first.nextCursor,
    limit: 30,
    // A later request clock must not shift freshness/filter semantics mid-walk.
    now: "2026-08-20T18:00:00.000Z",
  });
  assert.equal(second.asOf, first.asOf);
  assert.equal(second.evaluatedAt, first.evaluatedAt);
  assert.equal(
    first.items.some((item) => second.items.some((candidate) => candidate.id === item.id)),
    false,
  );

  assert.throws(
    () => queryJobs(parseFilters({ level: "new-grad", remote: "true" }), {
      cursor: first.nextCursor,
      limit: 30,
    }),
    InvalidCursorError,
  );
  assert.throws(
    () => queryJobs(filters, { cursor: "not_a_valid_cursor", limit: 30 }),
    InvalidCursorError,
  );
});

test("filters run before pagination and source filters include contributing mirrors", () => {
  const page = queryJobs(parseFilters({ source: "simplify" }), {
    limit: 36,
    asOf: AS_OF,
    now: NOW,
  });
  assert.ok(page.total > 0);
  assert.ok(page.items.every((item) => item.sourceNames.includes("Simplify community feed")));

  const remoteInternships = queryJobs(
    parseFilters({ level: "internship", remote: "true", sponsorship: "true" }),
    { limit: 60, asOf: AS_OF, now: NOW },
  );
  assert.ok(remoteInternships.total > 0);
  assert.ok(remoteInternships.items.every((item) => item.roleLevel === "Internship"));
  assert.ok(remoteInternships.items.every((item) => item.workplace === "Remote"));
  assert.ok(remoteInternships.items.every((item) => item.sponsorship === "Confirmed"));
});

test("stats, details, and homepage newest jobs share the same snapshot semantics", () => {
  const stats = getFeedStats({ asOf: AS_OF, now: NOW });
  assert.equal(stats.activeJobs, DEMO_CANONICAL_JOB_COUNT);
  assert.equal(stats.currentSources, 9);
  assert.equal(stats.healthySources, 9);
  assert.equal(stats.lastCompleteUpdateAt, AS_OF);
  assert.ok(stats.addedToday >= 0);
  assert.ok(stats.addedThisWeek >= stats.addedToday);

  const firstPage = queryJobs(parseFilters(), { limit: 1, asOf: AS_OF, now: NOW });
  const detail = getJobById(firstPage.items[0].id, { asOf: AS_OF, now: NOW });
  assert.deepEqual(detail, firstPage.items[0]);
  assert.equal(getJobById("missing-job", { asOf: AS_OF, now: NOW }), null);

  const newestPosted = getNewestPostedJobs({ limit: 6, asOf: AS_OF, now: NOW });
  assert.equal(newestPosted.length, 6);
  assert.ok(newestPosted.every((job) => job.freshnessKind === "posted"));
  assert.ok(newestPosted.every((job) => job.postedAt));
});

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
  JOB_MAJOR_OPTIONS,
  SOURCE_CATALOG,
  buildAtsDedupeKey,
  buildJobsUrl,
  companySlug,
  createDemoSnapshot,
  decodeJobCursor,
  deduplicateJobs,
  findCompanyPage,
  getFeedStats,
  getFreshness,
  getCompanyPages,
  getJobById,
  getNewestPostedJobs,
  getPopularCompanies,
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
  const visibleJobKeys = first.jobs.map((job) => [
    job.companyName,
    job.title,
    job.location,
    job.roleLevel,
    job.workplace,
  ].join("|"));
  assert.equal(
    new Set(visibleJobKeys).size,
    DEMO_CANONICAL_JOB_COUNT,
    "every demo listing should be visibly distinct, not merely separated by requisition ID",
  );
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
  assert.equal(getFreshness(found, NOW).label, "30 minutes ago");
  assert.equal(getFreshness(backfill, NOW).kind, "posted");
  assert.equal(getFreshness(backfill, NOW).label, "2 months ago");
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

test("recency labels use readable singular time units without provenance prefixes", () => {
  const [oneHour] = deduplicateJobs([
    rawRecord({
      sourceRecordId: "greenhouse:one-hour",
      requisitionId: "ONE-HOUR",
      employerPostedAt: "2026-08-19T17:00:00.000Z",
    }),
  ], { now: NOW });
  const [oneDay] = deduplicateJobs([
    rawRecord({
      sourceRecordId: "greenhouse:one-day",
      requisitionId: "ONE-DAY",
      employerPostedAt: "2026-08-18T18:00:00.000Z",
    }),
  ], { now: NOW });

  assert.equal(getFreshness(oneHour, NOW).label, "1 hour ago");
  assert.equal(getFreshness(oneDay, NOW).label, "1 day ago");
  assert.doesNotMatch(getFreshness(oneHour, NOW).label, /posted|found/i);
});

test("ATS normalization recognizes aliases without broad requisition fuzzy matching", () => {
  assert.equal(normalizeAtsHostname("https://Boards.Greenhouse.io/acme/jobs/1"), "greenhouse.io");
  assert.equal(normalizeAtsHostname("job-boards.greenhouse.io"), "greenhouse.io");
  assert.equal(
    normalizeAtsHostname("acme.wd7.myworkdayjobs.com"),
    "acme.myworkdayjobs.com",
  );
  assert.equal(normalizeEmployer("Acme & Sons, Inc."), "acme and sons");
  assert.equal(normalizeEmployer("Base Power Company"), "base power");
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
  params.set("company", "  Acme,   Inc.  ");
  params.set("level", "new-grad");
  params.set("major", "computer-science");
  params.set("niche", "data-ml");
  params.set("location", "  New   York ");
  params.set("remote", "true");
  params.set("sponsorship", "1");
  params.set("fresh", "true");
  params.set("source", "lever");
  params.set("cursor", "must-not-be-copied");

  const filters = parseFilters(params);
  assert.deepEqual(filters, {
    q: "Data science",
    company: "Acme, Inc.",
    level: "new-grad",
    major: "computer-science",
    niche: "data-ml",
    location: "New York",
    remote: true,
    sponsorship: true,
    fresh: true,
    source: "lever",
  });
  assert.equal(
    serializeFilters(filters),
    "level=new-grad&q=Data+science&company=Acme%2C+Inc.&major=computer-science&niche=data-ml&location=New+York&remote=true&sponsorship=true&fresh=true&source=lever",
  );
  assert.equal(
    buildJobsUrl(filters),
    "/jobs?level=new-grad&q=Data+science&company=Acme%2C+Inc.&major=computer-science&niche=data-ml&location=New+York&remote=true&sponsorship=true&fresh=true&source=lever",
  );

  assert.deepEqual(
    parseFilters({ level: "not-a-level", major: "invalid", niche: "finance", source: "unknown", remote: "false" }),
    { q: "", company: "", level: "all", major: "all", niche: "all", location: "", remote: false, sponsorship: false, fresh: false, source: "" },
  );
  assert.equal(parseFilters({ major: "business", niche: "security" }).niche, "all");
});

test("the 24-hour filter and New badge use Timley's first-seen time at the page's clock", () => {
  const hoursBefore = (hours) => new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
  const jobs = deduplicateJobs([
    rawRecord({ sourceRecordId: "greenhouse:new-1", requisitionId: "REQ-201", applicationUrl: "https://example.com/jobs/req-201", firstSeenAt: hoursBefore(3), lastSeenAt: hoursBefore(1) }),
    rawRecord({ sourceRecordId: "greenhouse:new-2", requisitionId: "REQ-202", applicationUrl: "https://example.com/jobs/req-202", firstSeenAt: hoursBefore(23.5), lastSeenAt: hoursBefore(1) }),
    rawRecord({ sourceRecordId: "greenhouse:old-1", requisitionId: "REQ-203", applicationUrl: "https://example.com/jobs/req-203", firstSeenAt: hoursBefore(25), lastSeenAt: hoursBefore(1) }),
    rawRecord({ sourceRecordId: "greenhouse:old-2", requisitionId: "REQ-204", applicationUrl: "https://example.com/jobs/req-204", firstSeenAt: hoursBefore(24 * 5), lastSeenAt: hoursBefore(1) }),
  ], { now: NOW });
  const snapshot = { asOf: NOW, rawRecords: [], jobs };

  const all = queryJobs(parseFilters(), { snapshot, now: NOW });
  assert.equal(all.total, 4);
  assert.equal(all.items.filter((job) => job.isNew).length, 2);

  const fresh = queryJobs(parseFilters({ fresh: "true" }), { snapshot, now: NOW });
  assert.equal(fresh.total, 2);
  assert.ok(fresh.items.every((job) => job.isNew));
  assert.equal(buildJobsUrl(fresh.filters), "/jobs?fresh=true");

  // The cursor's clock keeps the window fixed while paging, even a day later.
  const first = queryJobs(parseFilters({ fresh: "true" }), { snapshot, now: NOW, limit: 1 });
  assert.ok(first.nextCursor);
  const second = queryJobs(parseFilters({ fresh: "true" }), {
    snapshot, now: hoursBefore(-30), limit: 1, cursor: first.nextCursor,
  });
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].isNew, true);
  assert.notEqual(second.items[0].id, first.items[0].id);
});

test("the company filter is exact, normalized, and shareable", () => {
  const jobs = deduplicateJobs([
    rawRecord({ sourceRecordId: "greenhouse:acme-1", requisitionId: "REQ-101" }),
    rawRecord({
      sourceRecordId: "greenhouse:acme-2",
      companyName: "ACME",
      requisitionId: "REQ-102",
      applicationUrl: "https://example.com/jobs/req-102",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:acme-labs",
      companyName: "Acme Labs",
      canonicalEmployerId: "acme-labs",
      requisitionId: "REQ-103",
      applicationUrl: "https://example.com/jobs/req-103",
    }),
  ], { now: NOW });
  const snapshot = { asOf: AS_OF, rawRecords: [], jobs };
  const filters = parseFilters({ company: "  Acme, Inc. " });
  const page = queryJobs(filters, { snapshot, now: NOW });

  assert.equal(serializeFilters(filters), "company=Acme%2C+Inc.");
  assert.equal(buildJobsUrl(filters), "/jobs?company=Acme%2C+Inc.");
  assert.equal(page.total, 2);
  assert.ok(page.items.every((job) => normalizeEmployer(job.company) === "acme"));
  assert.ok(page.items.every((job) => normalizeEmployer(job.company) !== "acme labs"));
});

test("company pages use stable slugs and list only employers with active public roles", () => {
  assert.equal(companySlug("Acme, Inc."), "acme");
  assert.equal(companySlug("Jane Street & Co."), "jane-street-and");
  assert.equal(companySlug("D. E. Shaw"), "d-e-shaw");
  assert.equal(companySlug("  "), null);

  const jobs = deduplicateJobs([
    rawRecord({ sourceRecordId: "greenhouse:acme-1", requisitionId: "ACME-1", applicationUrl: "https://example.com/jobs/acme-1" }),
    rawRecord({ sourceRecordId: "greenhouse:acme-2", companyName: "ACME", requisitionId: "ACME-2", applicationUrl: "https://example.com/jobs/acme-2" }),
    rawRecord({ sourceRecordId: "greenhouse:beta", companyName: "Beta Labs", canonicalEmployerId: "beta-labs", requisitionId: "BETA-1", applicationUrl: "https://example.com/jobs/beta-1" }),
  ], { now: NOW });
  const snapshot = { asOf: AS_OF, rawRecords: [], jobs };
  const pages = getCompanyPages({ snapshot, now: NOW });

  assert.deepEqual(pages.map(({ slug, activeJobs }) => [slug, activeJobs]), [["acme", 2], ["beta-labs", 1]]);
  assert.equal(findCompanyPage("beta-labs", { snapshot, now: NOW })?.name, "Beta Labs");
  for (const slug of ["missing", "Beta-Labs", "beta--labs", "../acme", ""]) {
    assert.equal(findCompanyPage(slug, { snapshot, now: NOW }), null, slug);
  }

  const inactive = { asOf: AS_OF, rawRecords: [], jobs: jobs.map((job) => ({ ...job, active: false })) };
  assert.deepEqual(getCompanyPages({ snapshot: inactive, now: NOW }), []);
});

test("the homepage company rail is ranked from recent public discoveries", () => {
  const jobs = deduplicateJobs([
    rawRecord({
      sourceRecordId: "greenhouse:alpha-1",
      companyName: "Alpha",
      canonicalEmployerId: "alpha",
      requisitionId: "ALPHA-1",
      applicationUrl: "https://example.com/jobs/alpha-1",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:alpha-2",
      companyName: "Alpha",
      canonicalEmployerId: "alpha",
      requisitionId: "ALPHA-2",
      applicationUrl: "https://example.com/jobs/alpha-2",
      firstSeenAt: "2026-08-18T14:30:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:beta",
      companyName: "Beta",
      canonicalEmployerId: "beta",
      requisitionId: "BETA-1",
      applicationUrl: "https://example.com/jobs/beta-1",
      employerPostedAt: "2026-08-19T17:30:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:old",
      companyName: "Old Company",
      canonicalEmployerId: "old-company",
      requisitionId: "OLD-1",
      applicationUrl: "https://example.com/jobs/old-1",
      firstSeenAt: "2026-06-01T14:30:00.000Z",
    }),
    rawRecord({
      sourceRecordId: "greenhouse:senior",
      companyName: "Senior Company",
      canonicalEmployerId: "senior-company",
      requisitionId: "SENIOR-1",
      applicationUrl: "https://example.com/jobs/senior-1",
      title: "Senior Product Analyst",
      roleLevel: "New grad",
    }),
  ], { now: NOW });
  const snapshot = { asOf: AS_OF, rawRecords: [], jobs };
  const companies = getPopularCompanies({ snapshot, now: NOW, recentDays: 30 });

  assert.deepEqual(companies, [
    { name: "Alpha", domain: undefined, recentPostings: 2 },
    { name: "Beta", domain: undefined, recentPostings: 1 },
    { name: "Senior Company", domain: undefined, recentPostings: 1 },
  ]);
  assert.throws(
    () => getPopularCompanies({ snapshot, now: NOW, recentDays: 0 }),
    /recentDays must be an integer between 1 and 365/,
  );
});

test("major search restores the original Timley taxonomy", () => {
  assert.deepEqual(
    JOB_MAJOR_OPTIONS.map(({ label, niches }) => [label, niches.map((niche) => niche.label)]),
    [
      ["All majors", ["All roles"]],
      ["Computer Science", ["All CS roles", "Software Engineering", "Cloud / Infra", "Site Reliability", "Security", "Data / ML", "Quant"]],
      ["Engineering", ["All engineering", "Hardware / Firmware", "Electrical", "Mechanical", "Civil", "Aerospace", "Manufacturing", "Industrial", "Materials"]],
      ["Business", ["All business", "Finance", "Consulting", "Accounting", "Operations", "Product", "Marketing", "Supply Chain"]],
    ],
  );

  for (const major of JOB_MAJOR_OPTIONS.filter((option) => option.id !== "all")) {
    for (const niche of major.niches.filter((option) => option.id !== "all")) {
      const page = queryJobs(parseFilters({ major: major.id, niche: niche.id }), {
        limit: 1,
        asOf: AS_OF,
        now: NOW,
      });
      assert.ok(page.total > 0, `${major.label} / ${niche.label} should have matching jobs`);
    }
  }
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
    () => queryJobs(parseFilters({ level: "internship", remote: "true", major: "business" }), {
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

  const softwareRoles = queryJobs(
    parseFilters({ major: "computer-science", niche: "software-engineering" }),
    { limit: 60, asOf: AS_OF, now: NOW },
  );
  assert.ok(softwareRoles.total > 0);
  assert.ok(softwareRoles.items.every((item) => /software/i.test(item.title)));

  const supplyChainRoles = queryJobs(
    parseFilters({ major: "business", niche: "supply-chain" }),
    { limit: 60, asOf: AS_OF, now: NOW },
  );
  assert.ok(supplyChainRoles.total > 0);
  assert.ok(supplyChainRoles.items.every((item) => /supply chain/i.test(item.title)));
});

test("homepage newest listings break same-day ties by discovery time, not company name", () => {
  const sameDay = "2026-08-18T00:00:00.000Z";
  const records = [
    ["Alpha Robotics", "REQ-201", "2026-08-19T09:00:00.000Z"],
    ["Mid Systems", "REQ-202", "2026-08-19T13:00:00.000Z"],
    ["Zeta Labs", "REQ-203", "2026-08-19T17:00:00.000Z"],
  ].map(([companyName, requisitionId, firstSeenAt], index) =>
    rawRecord({
      sourceRecordId: `greenhouse:tie-${index}`,
      companyName,
      canonicalEmployerId: companyName.toLowerCase().replace(/\s+/g, "-"),
      logoText: companyName[0],
      applicationUrl: `https://example.com/jobs/${requisitionId.toLowerCase()}`,
      requisitionId,
      employerPostedAt: sameDay,
      firstSeenAt,
      lastSeenAt: firstSeenAt,
    }),
  );
  const older = rawRecord({
    sourceRecordId: "greenhouse:older",
    companyName: "Aardvark Co",
    canonicalEmployerId: "aardvark-co",
    logoText: "A",
    applicationUrl: "https://example.com/jobs/req-200",
    requisitionId: "REQ-200",
    employerPostedAt: "2026-08-17T00:00:00.000Z",
    firstSeenAt: "2026-08-19T17:30:00.000Z",
    lastSeenAt: "2026-08-19T17:30:00.000Z",
  });
  const snapshot = Object.freeze({
    ...createDemoSnapshot(AS_OF),
    jobs: deduplicateJobs([...records, older], { now: AS_OF }),
  });
  const newest = getNewestPostedJobs({ limit: 6, snapshot, now: NOW });
  assert.deepEqual(
    newest.map((job) => job.company),
    ["Zeta Labs", "Mid Systems", "Alpha Robotics", "Aardvark Co"],
  );
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

  const fallbackCapturedAt = "2026-08-19T15:55:00.000Z";
  const fallbackSnapshot = Object.freeze({
    ...createDemoSnapshot(AS_OF),
    fallbackCapturedAt,
  });
  const fallbackStats = getFeedStats({ snapshot: fallbackSnapshot, now: NOW });
  assert.equal(fallbackStats.lastCompleteUpdateAt, fallbackCapturedAt);
  assert.ok(
    fallbackStats.sourceHealth.every(
      (source) => source.lastSuccessfulUpdateAt === fallbackCapturedAt,
    ),
  );
});

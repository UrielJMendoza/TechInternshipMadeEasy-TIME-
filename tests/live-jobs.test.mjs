import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const domainSource = await readFile(new URL("../lib/jobs/index.ts", import.meta.url), "utf8");
const domainUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(domainSource)).toString("base64")}`;
const liveSource = await readFile(new URL("../lib/jobs/live.ts", import.meta.url), "utf8");
const runnableLiveSource = stripTypeScriptTypes(liveSource).replace(
  /from "\.\/index";/,
  `from "${domainUrl}";`,
);
const liveModule = await import(
  `data:text/javascript;base64,${Buffer.from(runnableLiveSource).toString("base64")}`
);
const domainModule = await import(domainUrl);

const { createLiveSnapshotFromRows } = liveModule;
const { InvalidCursorError, parseFilters, queryJobs } = domainModule;

function liveRow(overrides = {}) {
  return {
    id: "35141583-4060-48ad-ae33-db8969def0fd",
    title: "Software Engineer Intern",
    company: "Notion",
    category: "software",
    role_type: "internship",
    primary_apply_url: "https://jobs.ashbyhq.com/notion/e66c6658-9e65-4c58-8db2-844628b6e8f8",
    display_location: "San Francisco, CA",
    location_type: "onsite",
    major_ids: ["all", "computer-science"],
    niche_ids: ["all", "software-engineering"],
    posted_date: "2026-08-21",
    first_seen_at: "2026-08-21T06:15:08.837062+00:00",
    last_seen_at: "2026-08-21T12:45:04.739218+00:00",
    is_active: true,
    salary_raw: "$57/hr",
    sponsorship: "offers-sponsorship",
    company_domain: "notion.so",
    company_domain_confidence: 1,
    primary_source: "ashby:notion",
    ...overrides,
  };
}

test("live mapping keeps real employer links and rejects placeholder destinations", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow(),
    liveRow({
      id: "bad-placeholder",
      title: "Placeholder role",
      primary_apply_url: "https://example.com/jobs/not-real",
    }),
    liveRow({
      id: "bad-script",
      title: "Unsafe role",
      primary_apply_url: "javascript:alert(1)",
    }),
    liveRow({
      id: "bad-http",
      title: "Unencrypted role",
      primary_apply_url: "http://jobs.example-employer.com/role",
    }),
    liveRow({
      id: "bad-private",
      title: "Private host role",
      primary_apply_url: "https://192.168.1.2/role",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(snapshot.jobs.length, 1);
  assert.equal(snapshot.jobs[0].applicationUrl, liveRow().primary_apply_url);
  assert.equal(snapshot.jobs[0].companyDomain, "notion.so");
  assert.equal(snapshot.jobs[0].sponsorship, "Confirmed");
});

test("live mapping understands current sponsorship values and exact empty taxonomy", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({ sponsorship: "offers", major_ids: [], niche_ids: [] }),
    liveRow({
      id: "citizens-only-role",
      title: "Hardware Engineering Intern",
      primary_apply_url: "https://jobs.lever.co/notion/hardware-role",
      sponsorship: "citizens-only",
      major_ids: ["all", "engineering"],
      niche_ids: ["all", "hardware-firmware"],
    }),
  ], "2026-08-21T22:00:00.000Z");

  const noMajor = snapshot.jobs.find((job) => job.title === "Software Engineer Intern");
  const restricted = snapshot.jobs.find((job) => job.title === "Hardware Engineering Intern");
  assert.deepEqual(noMajor?.majorIds, []);
  assert.deepEqual(noMajor?.nicheIds, []);
  assert.equal(noMajor?.sponsorship, "Confirmed");
  assert.equal(restricted?.sponsorship, "Not offered");
  assert.equal(queryJobs({ major: "computer-science" }, { snapshot }).total, 0);
});

test("live mapping removes duplicate URLs and visibly repeated cards", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow(),
    liveRow({
      id: "duplicate-url",
      primary_apply_url: `${liveRow().primary_apply_url}?utm_source=community`,
    }),
    liveRow({
      id: "duplicate-card",
      primary_apply_url: "https://jobs.lever.co/notion/a-different-record",
    }),
    liveRow({
      id: "distinct-role",
      title: "Security Engineer Intern",
      category: "security",
      niche_ids: ["all", "security"],
      primary_apply_url: "https://jobs.lever.co/notion/security-record",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(snapshot.jobs.length, 2);
  assert.deepEqual(
    new Set(snapshot.jobs.map((job) => job.title)),
    new Set(["Software Engineer Intern", "Security Engineer Intern"]),
  );
});

test("live public IDs stay stable when a fresher duplicate source wins", () => {
  const older = createLiveSnapshotFromRows([
    liveRow({ id: "old-source" }),
  ], "2026-08-21T22:00:00.000Z");
  const refreshed = createLiveSnapshotFromRows([
    liveRow({ id: "old-source" }),
    liveRow({
      id: "new-source",
      primary_apply_url: "https://jobs.lever.co/notion/a-newer-source",
      posted_date: "2026-08-22",
      first_seen_at: "2026-08-22T01:00:00.000Z",
      last_seen_at: "2026-08-22T01:00:00.000Z",
    }),
  ], "2026-08-22T02:00:00.000Z");

  assert.equal(older.jobs[0].id, refreshed.jobs[0].id);
  assert.deepEqual(refreshed.jobs[0].sourceRecordIds, ["new-source"]);
});

test("a cursor cannot silently cross live repository snapshots", () => {
  const firstSnapshot = createLiveSnapshotFromRows([
    liveRow(),
    liveRow({
      id: "second-role",
      title: "Security Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/notion/security-role",
    }),
  ], "2026-08-21T22:00:00.000Z");
  const firstPage = queryJobs({}, { snapshot: firstSnapshot, limit: 1 });
  assert.ok(firstPage.nextCursor);

  const nextSnapshot = createLiveSnapshotFromRows(
    firstSnapshot.jobs.map((job) => ({
      ...liveRow(),
      id: job.sourceRecordIds[0],
      title: job.title,
      primary_apply_url: job.applicationUrl,
    })),
    "2026-08-21T22:05:00.000Z",
  );

  assert.throws(
    () => queryJobs({}, { snapshot: nextSnapshot, cursor: firstPage.nextCursor, limit: 1 }),
    InvalidCursorError,
  );
});

test("stable live IDs remain correctly ordered across equal-time pages", () => {
  const snapshot = createLiveSnapshotFromRows(
    Array.from({ length: 6 }, (_, index) => liveRow({
      id: `source-${index}`,
      title: `Software Engineer Intern ${index}`,
      primary_apply_url: `https://jobs.lever.co/notion/software-${index}`,
    })),
    "2026-08-21T22:00:00.000Z",
  );
  const first = queryJobs({}, { snapshot, limit: 3 });
  const second = queryJobs({}, { snapshot, limit: 3, cursor: first.nextCursor });

  assert.equal(first.items.length, 3);
  assert.equal(second.items.length, 3);
  assert.equal(new Set([...first.items, ...second.items].map((job) => job.id)).size, 6);
});

test("production taxonomy drives the existing major and specialization filters", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow(),
    liveRow({
      id: "business-role",
      title: "Accounting Intern",
      category: "accounting",
      major_ids: ["all", "business"],
      niche_ids: ["all", "accounting"],
      primary_apply_url: "https://jobs.lever.co/example-company/accounting-role",
    }),
  ], "2026-08-21T22:00:00.000Z");

  const page = queryJobs(
    parseFilters({ major: "computer-science", niche: "software-engineering" }),
    { snapshot, limit: 36, now: "2026-08-21T22:00:00.000Z" },
  );

  assert.equal(page.total, 1);
  assert.equal(page.items[0].company, "Notion");
  assert.equal(page.items[0].applyUrl, liveRow().primary_apply_url);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const domainSource = await readFile(new URL("../lib/jobs/index.ts", import.meta.url), "utf8");
const domainUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(domainSource)).toString("base64")}`;
const fallbackFixture = {
  id: "fallback-source-record",
  title: "Software Engineer Intern",
  company: "Notion",
  category: "software",
  role_type: "internship",
  primary_apply_url: "https://jobs.ashbyhq.com/notion/fallback-role",
  display_location: "San Francisco, CA",
  location_type: "onsite",
  major_ids: ["all", "computer-science"],
  niche_ids: ["all", "software-engineering"],
  posted_date: "2026-08-21",
  first_seen_at: "2026-08-21T06:15:08.837Z",
  last_seen_at: "2026-08-21T12:45:04.739Z",
  is_active: true,
  primary_source: "ashby:notion",
};
const fallbackDataUrl = `data:text/javascript;base64,${Buffer.from(
  `export const BUNDLED_FALLBACK_CAPTURED_AT = "2026-08-31T22:15:17.000Z"; export const BUNDLED_FALLBACK_ROWS = ${JSON.stringify([fallbackFixture])};`,
).toString("base64")}`;
const liveSource = await readFile(new URL("../lib/jobs/live.ts", import.meta.url), "utf8");
const runnableLiveSource = stripTypeScriptTypes(liveSource)
  .replace(/from "\.\/index";/, `from "${domainUrl}";`)
  .replace(/from "\.\/fallback-data";/, `from "${fallbackDataUrl}";`);
const liveModule = await import(
  `data:text/javascript;base64,${Buffer.from(runnableLiveSource).toString("base64")}`
);
const domainModule = await import(domainUrl);

const { createLiveSnapshotFromRows, providerIdentityFromUrl } = liveModule;
const { getJobById, InvalidCursorError, parseFilters, queryJobs } = domainModule;

test("bundled fallback preserves the complete last verified public feed", async () => {
  const chunks = await Promise.all(
    Array.from({ length: 11 }, async (_, index) => {
      const suffix = String(index).padStart(2, "0");
      const contents = await readFile(
        new URL(`../data/fallback/jobs-${suffix}.json`, import.meta.url),
        "utf8",
      );
      return JSON.parse(contents);
    }),
  );
  const rows = chunks.flat();
  const snapshot = createLiveSnapshotFromRows(rows, "2026-08-31T22:15:17.000Z");

  assert.equal(rows.length, 5_190);
  assert.equal(new Set(rows.map((row) => row.id)).size, 5_190);
  assert.ok(rows.every((row) => row.is_active === true));
  assert.equal(snapshot.jobs.length, 4_913);
  assert.equal(new Set(snapshot.jobs.map((job) => job.id)).size, 4_913);
  const providerKeys = snapshot.jobs
    .map((job) => providerIdentityFromUrl(job.applicationUrl, job.companyName)?.key)
    .filter(Boolean);
  assert.equal(new Set(providerKeys).size, providerKeys.length);
});

test("a live repository failure serves a labelled, cursor-stable verified copy", async () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.TIMLEY_USE_DEMO_JOBS;
  process.env.TIMLEY_USE_DEMO_JOBS = "false";
  globalThis.fetch = async () => new Response("quota unavailable", { status: 402 });

  try {
    const snapshot = await liveModule.getPublicJobsSnapshot();
    const historical = await liveModule.getPublicJobsSnapshot(snapshot.asOf);

    assert.equal(snapshot.fallbackCapturedAt, "2026-08-31T22:15:17.000Z");
    assert.equal(snapshot.jobs.length, 1);
    assert.equal(snapshot.jobs[0].sourceRecordIds[0], "fallback-source-record");
    assert.equal(historical, snapshot);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.TIMLEY_USE_DEMO_JOBS;
    else process.env.TIMLEY_USE_DEMO_JOBS = originalMode;
  }
});

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

test("live mapping removes canonical URL duplicates without hiding distinct requisitions", () => {
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
      id: "duplicate-formatting",
      company: "Notion, Inc.",
      title: "Software Engineer - Intern",
      display_location: "San Francisco, California",
      primary_apply_url: "https://jobs.lever.co/notion/yet-another-record",
    }),
    liveRow({
      id: "distinct-role",
      title: "Security Engineer Intern",
      category: "security",
      niche_ids: ["all", "security"],
      primary_apply_url: "https://jobs.lever.co/notion/security-record",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(snapshot.jobs.length, 4);
  assert.equal(
    snapshot.jobs.filter((job) => job.title === "Software Engineer Intern").length,
    2,
  );
  assert.equal(
    snapshot.jobs.filter((job) => job.title === "Software Engineer - Intern").length,
    1,
  );
  const merged = snapshot.jobs.find((job) =>
    job.sourceRecordIds.includes("duplicate-url")
  );
  assert.deepEqual(
    merged?.sourceRecordIds,
    ["35141583-4060-48ad-ae33-db8969def0fd", "duplicate-url"],
  );
});

test("live mapping merges mirrored Workday links only when the employer requisition matches", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({
      id: "public-workday",
      company: "BP",
      title: "Finance & Risk Intern",
      display_location: "Chicago, IL",
      primary_apply_url: "https://bpinternational.wd3.myworkdayjobs.com/bpEarlyCareers/job/Chicago/Finance-Risk-Intern_RQ114738",
      posted_date: "2026-08-15",
    }),
    liveRow({
      id: "private-workday",
      company: "BP",
      title: "Finance & Risk Intern",
      display_location: "Chicago, IL",
      primary_apply_url: "https://bpinternational.wd3.myworkdayjobs.com/bpPrivateExternalCareersSite/job/Chicago/Finance-Risk-Intern_RQ114738-1",
      posted_date: "2026-08-21",
    }),
    liveRow({
      id: "distinct-workday",
      company: "BP",
      title: "Finance & Risk Intern",
      display_location: "Chicago, IL",
      primary_apply_url: "https://bpinternational.wd3.myworkdayjobs.com/bpEarlyCareers/job/Chicago/Finance-Risk-Intern_RQ114739",
      posted_date: "2026-08-21",
    }),
    liveRow({
      id: "brunswick-search",
      company: "Brunswick",
      title: "Software Engineering Intern",
      display_location: "Champaign, IL",
      primary_apply_url: "https://brunswick.wd1.myworkdayjobs.com/search/job/Champaign-IL/Software-Engineering-Intern_JR-051316",
    }),
    liveRow({
      id: "brunswick-locale",
      company: "Brunswick",
      title: "Software Engineering Intern",
      display_location: "Champaign, IL",
      primary_apply_url: "https://brunswick.wd1.myworkdayjobs.com/en-US/search/job/Champaign-IL/Software-Engineering-Intern_JR-051316",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(snapshot.jobs.length, 3);
  const merged = snapshot.jobs.find((job) => job.sourceRecordIds.includes("public-workday"));
  assert.deepEqual(merged?.sourceRecordIds, ["private-workday", "public-workday"]);
  assert.equal(merged?.employerPostedAt, "2026-08-15T00:00:00.000Z");
  const brunswick = snapshot.jobs.find((job) => job.sourceRecordIds.includes("brunswick-search"));
  assert.deepEqual(brunswick?.sourceRecordIds, ["brunswick-locale", "brunswick-search"]);
});

test("provider identities merge URL variants without merging different native jobs", () => {
  const cases = [
    {
      provider: "ashby",
      company: "Notion",
      first: "https://jobs.ashbyhq.com/notion/e66c6658-9e65-4c58-8db2-844628b6e8f8",
      mirror: "https://jobs.ashbyhq.com/notion/e66c6658-9e65-4c58-8db2-844628b6e8f8/application?embed=true",
      other: "https://jobs.ashbyhq.com/notion/11111111-1111-4111-8111-111111111111",
    },
    {
      provider: "greenhouse",
      company: "Acme",
      first: "https://job-boards.greenhouse.io/acme/jobs/1234567",
      mirror: "https://boards.greenhouse.io/acme/jobs/1234567?gh_src=feed",
      other: "https://job-boards.greenhouse.io/acme/jobs/7654321",
    },
    {
      provider: "icims",
      company: "SIG",
      first: "https://careers-sig.icims.com/jobs/13737/software-engineer/job",
      mirror: "https://jobs-sig.icims.com/jobs/13737/another-slug/job?mobile=false",
      other: "https://careers-sig.icims.com/jobs/13738/software-engineer/job",
    },
    {
      provider: "bytedance",
      company: "TikTok",
      first: "https://jobs.bytedance.com/en/position/7535652251402352903/detail",
      mirror: "https://lifeattiktok.com/search/7535652251402352903?spread=5MWH5CQ",
      other: "https://jobs.bytedance.com/en/position/7535652251402352904/detail",
    },
    {
      provider: "workable",
      company: "Acme",
      first: "https://apply.workable.com/acme/j/ABCDEF1234/",
      mirror: "https://apply.workable.com/acme/j/ABCDEF1234/?utm_source=feed",
      other: "https://apply.workable.com/acme/j/ZZZZZZ9999/",
    },
    {
      provider: "apple",
      company: "Apple",
      first: "https://jobs.apple.com/en-us/details/200607100/software-engineer-intern",
      mirror: "https://jobs.apple.com/en-us/details/200607100-3810",
      other: "https://jobs.apple.com/en-us/details/200607101/software-engineer-intern",
    },
    {
      provider: "oracle",
      company: "Oracle",
      first: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/123456",
      mirror: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/OracleCareers/job/123456?utm_source=feed",
      other: "https://eeho.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/123457",
    },
  ];

  for (const fixture of cases) {
    const first = providerIdentityFromUrl(fixture.first, fixture.company);
    const mirror = providerIdentityFromUrl(fixture.mirror, fixture.company);
    const other = providerIdentityFromUrl(fixture.other, fixture.company);
    assert.equal(first?.provider, fixture.provider);
    assert.equal(first?.key, mirror?.key, `${fixture.provider} mirrors should match`);
    assert.notEqual(first?.key, other?.key, `${fixture.provider} requisitions must stay distinct`);

    const snapshot = createLiveSnapshotFromRows([
      liveRow({ id: `${fixture.provider}-one`, company: fixture.company, primary_apply_url: fixture.first }),
      liveRow({ id: `${fixture.provider}-mirror`, company: fixture.company, primary_apply_url: fixture.mirror }),
      liveRow({ id: `${fixture.provider}-other`, company: fixture.company, primary_apply_url: fixture.other }),
    ], "2026-08-21T22:00:00.000Z");
    assert.equal(snapshot.jobs.length, 2, fixture.provider);
  }
});

test("provider identities stay scoped to tenant, board, and employer", () => {
  assert.notEqual(
    providerIdentityFromUrl("https://jobs.ashbyhq.com/alpha/e66c6658-9e65-4c58-8db2-844628b6e8f8", "Alpha")?.key,
    providerIdentityFromUrl("https://jobs.ashbyhq.com/beta/e66c6658-9e65-4c58-8db2-844628b6e8f8", "Beta")?.key,
  );
  assert.notEqual(
    providerIdentityFromUrl("https://careers-alpha.icims.com/jobs/12345/role/job", "Alpha")?.key,
    providerIdentityFromUrl("https://careers-beta.icims.com/jobs/12345/role/job", "Beta")?.key,
  );
  assert.notEqual(
    providerIdentityFromUrl("https://apply.workable.com/alpha/j/ABCDEF1234/", "Alpha")?.key,
    providerIdentityFromUrl("https://apply.workable.com/beta/j/ABCDEF1234/", "Beta")?.key,
  );
});

test("a Workday mirror suffix requires the same tenant, base ID, and job slug", () => {
  const base = "https://acme.wd1.myworkdayjobs.com/careers/job/Austin/Engineer_R123456";
  const mirror = "https://acme.wd1.myworkdayjobs.com/private/job/Austin/Engineer_R123456-1";
  const differentStems = createLiveSnapshotFromRows([
    liveRow({ id: "suffix-one", company: "Acme", primary_apply_url: mirror }),
    liveRow({ id: "suffix-two", company: "Acme", primary_apply_url: "https://acme.wd1.myworkdayjobs.com/private/job/Austin/Different-Engineer_R123456-2" }),
  ], "2026-08-21T22:00:00.000Z");
  assert.equal(differentStems.jobs.length, 2);

  const withBase = createLiveSnapshotFromRows([
    liveRow({ id: "base", company: "Acme", primary_apply_url: base }),
    liveRow({ id: "mirror", company: "Acme", primary_apply_url: mirror }),
  ], "2026-08-21T22:00:00.000Z");
  assert.equal(withBase.jobs.length, 1);
});

test("distinct same-title requisitions keep stable IDs and ambiguous legacy IDs fail closed", () => {
  const newest = liveRow({
    id: "newest-requisition",
    primary_apply_url: "https://jobs.lever.co/notion/newest-requisition",
    posted_date: "2026-08-21",
  });
  const single = createLiveSnapshotFromRows([newest], "2026-08-21T22:00:00.000Z");
  const combined = createLiveSnapshotFromRows([
    newest,
    liveRow({
      id: "older-requisition",
      primary_apply_url: "https://jobs.lever.co/notion/older-requisition",
      posted_date: "2026-08-20",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(combined.jobs.length, 2);
  assert.equal(new Set(combined.jobs.map((job) => job.id)).size, 2);
  assert.equal(
    combined.jobs.find((job) => job.applicationUrl === newest.primary_apply_url)?.id,
    single.jobs[0].id,
  );
  const withNewArrival = createLiveSnapshotFromRows([
    newest,
    liveRow({
      id: "new-arrival",
      primary_apply_url: "https://jobs.lever.co/notion/new-arrival",
      posted_date: "2026-08-22",
      first_seen_at: "2026-08-22T01:00:00.000Z",
      last_seen_at: "2026-08-22T01:00:00.000Z",
    }),
  ], "2026-08-22T02:00:00.000Z");
  assert.equal(
    withNewArrival.jobs.find((job) => job.applicationUrl === newest.primary_apply_url)?.id,
    single.jobs[0].id,
  );
  assert.equal(getJobById(single.jobs[0].legacyId, { snapshot: single })?.id, single.jobs[0].id);
  assert.equal(getJobById(single.jobs[0].legacyId, { snapshot: combined }), null);
});

test("live public IDs stay stable when a fresher duplicate source wins", () => {
  const older = createLiveSnapshotFromRows([
    liveRow({ id: "old-source" }),
  ], "2026-08-21T22:00:00.000Z");
  const refreshed = createLiveSnapshotFromRows([
    liveRow({ id: "old-source" }),
    liveRow({
      id: "new-source",
      primary_apply_url: `${liveRow().primary_apply_url}?utm_source=refresh`,
      posted_date: "2026-08-22",
      first_seen_at: "2026-08-22T01:00:00.000Z",
      last_seen_at: "2026-08-22T01:00:00.000Z",
    }),
  ], "2026-08-22T02:00:00.000Z");

  assert.equal(older.jobs[0].id, refreshed.jobs[0].id);
  assert.deepEqual(refreshed.jobs[0].sourceRecordIds, ["new-source", "old-source"]);
  assert.equal(
    refreshed.jobs[0].employerPostedAt,
    older.jobs[0].employerPostedAt,
    "a duplicate refresh must not make an older posting look newly posted",
  );
});

test("provider canonicalization retains exact prior public URL IDs as aliases", () => {
  const snapshot = createLiveSnapshotFromRows([liveRow()], "2026-08-21T22:00:00.000Z");
  const current = snapshot.jobs[0];
  assert.ok(current.legacyIds?.length);
  assert.equal(getJobById(current.legacyIds[0], { snapshot })?.id, current.id);
});

test("date-only and discovery timestamps keep their honest precision", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow(),
    liveRow({
      id: "future-date",
      title: "Security Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/notion/future-date",
      posted_date: "2026-08-22",
    }),
  ], "2026-08-21T22:00:00.000Z");
  const page = queryJobs({}, {
    snapshot,
    limit: 10,
    now: "2026-08-21T22:00:00.000Z",
  });
  const dated = page.items.find((job) => job.title === "Software Engineer Intern");
  const future = page.items.find((job) => job.title === "Security Engineer Intern");

  assert.equal(dated?.freshnessKind, "posted");
  assert.equal(dated?.freshnessLabel, "today");
  assert.equal(dated?.postedAtPrecision, "date");
  assert.equal(future?.freshnessKind, "found");
  assert.equal(future?.postedAt, null);
  assert.equal(future?.freshnessLabel, "15 hours ago");

  const monthOld = queryJobs({}, {
    snapshot: createLiveSnapshotFromRows([
      liveRow({ posted_date: "2026-07-21" }),
    ], "2026-08-21T22:00:00.000Z"),
    now: "2026-08-21T22:00:00.000Z",
  });
  assert.equal(monthOld.items[0].freshnessLabel, "1 month ago");
});

test("community dates stay source-reported and cannot impersonate a fresh employer post", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({
      id: "community-date",
      title: "Software Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/community/date-role",
      primary_source: "speedyapply",
      posted_date: "2026-08-21",
      first_seen_at: "2026-08-10T12:00:00.000Z",
      last_seen_at: "2026-08-21T12:00:00.000Z",
    }),
    liveRow({
      id: "verified-date",
      company: "Acme",
      title: "Security Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/acme/verified-date",
      primary_source: "lever:acme",
      posted_date: "2026-08-20",
      first_seen_at: "2026-08-20T12:00:00.000Z",
      last_seen_at: "2026-08-21T12:00:00.000Z",
    }),
  ], "2026-08-21T22:00:00.000Z");
  const page = queryJobs({}, {
    snapshot,
    now: "2026-08-21T22:00:00.000Z",
  });

  assert.deepEqual(page.items.map((job) => job.id), [
    snapshot.jobs.find((job) => job.sourceRecordIds.includes("verified-date")).id,
    snapshot.jobs.find((job) => job.sourceRecordIds.includes("community-date")).id,
  ]);
  const community = page.items.find((job) => job.title === "Software Engineer Intern");
  assert.equal(community?.freshnessKind, "reported");
  assert.equal(community?.dateProvenance, "source-reported");
  assert.equal(community?.possibleRepost, true);
  assert.deepEqual(community?.sourceNames, ["SpeedyApply community list"]);
});

test("complete duplicate titles win and remaining clipped titles are labelled", () => {
  const sharedUrl = "https://jobs.ashbyhq.com/notion/e66c6658-9e65-4c58-8db2-844628b6e8f8";
  const snapshot = createLiveSnapshotFromRows([
    liveRow({
      id: "clipped-copy",
      title: "Software Engineering Intern – Platfo...",
      primary_apply_url: sharedUrl,
      primary_source: "zapplyjobs",
    }),
    liveRow({
      id: "complete-copy",
      title: "Software Engineering Intern – Platform Infrastructure",
      primary_apply_url: sharedUrl,
      primary_source: "ashby:notion",
    }),
    liveRow({
      id: "only-clipped",
      company: "Acme",
      title: "Security Engineering Intern – Detec...",
      primary_apply_url: "https://jobs.lever.co/acme/clipped",
      primary_source: "zapplyjobs",
    }),
  ], "2026-08-21T22:00:00.000Z");
  const page = queryJobs({}, { snapshot });
  const merged = page.items.find((job) => job.sourceNames.length === 2);
  const clipped = page.items.find((job) => job.company === "Acme");

  assert.equal(merged?.title, "Software Engineering Intern – Platform Infrastructure");
  assert.equal(merged?.titleIncomplete, false);
  assert.deepEqual(merged?.sourceNames, ["Ashby employer board", "ZApplyJobs community list"]);
  assert.equal(clipped?.titleIncomplete, true);
});

test("ambiguous and senior new-grad titles are withheld from the public feed", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({
      id: "senior-role",
      role_type: "new_grad",
      title: "Senior Software Engineer",
      primary_apply_url: "https://jobs.lever.co/acme/senior",
    }),
    liveRow({
      id: "level-two-role",
      role_type: "new_grad",
      title: "Software Engineer II",
      primary_apply_url: "https://jobs.lever.co/acme/level-two",
    }),
    liveRow({
      id: "early-role",
      role_type: "new_grad",
      title: "Software Engineer, New Grad",
      primary_apply_url: "https://jobs.lever.co/acme/early",
    }),
    liveRow({
      id: "product-role",
      role_type: "new_grad",
      title: "Product Manager, New Grad",
      category: "product",
      primary_apply_url: "https://jobs.lever.co/acme/product",
    }),
    liveRow({
      id: "student-senior-role",
      role_type: "new_grad",
      title: "Rising Senior Software Engineer Program",
      primary_apply_url: "https://jobs.lever.co/acme/student-senior",
    }),
  ], "2026-08-21T22:00:00.000Z");
  const page = queryJobs({}, { snapshot, limit: 10 });

  assert.deepEqual(
    new Set(page.items.map((job) => job.title)),
    new Set([
      "Software Engineer, New Grad",
      "Product Manager, New Grad",
      "Rising Senior Software Engineer Program",
    ]),
  );
  assert.equal(getJobById(
    snapshot.jobs.find((job) => job.sourceRecordIds.includes("senior-role")).id,
    { snapshot },
  ), null);
});

test("search matches unordered field prefixes and common role aliases", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({ location_type: "remote", display_location: "United States" }),
    liveRow({
      id: "security-role",
      company: "Acme",
      title: "Security Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/acme/security-role",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(queryJobs({ q: "not sof eng united" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "swe remote" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "otion" }, { snapshot }).total, 0);
  assert.equal(queryJobs({ location: "California" }, {
    snapshot: createLiveSnapshotFromRows([liveRow()], "2026-08-21T22:00:00.000Z"),
  }).total, 1);
});

test("technical search preserves punctuation, phrases, and workplace intent", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({
      id: "cplusplus-role",
      role_type: "new_grad",
      title: "C++ Software Engineer, New Grad",
      primary_apply_url: "https://jobs.lever.co/acme/cplusplus",
      location_type: "remote",
    }),
    liveRow({
      id: "dotnet-role",
      role_type: "new_grad",
      title: "C# / .NET Software Engineer, New Grad",
      primary_apply_url: "https://jobs.lever.co/acme/dotnet",
      location_type: "hybrid",
    }),
    liveRow({
      id: "network-role",
      role_type: "new_grad",
      title: "Network Engineer, New Grad",
      primary_apply_url: "https://jobs.lever.co/acme/network",
      location_type: "onsite",
    }),
    liveRow({
      id: "sre-role",
      role_type: "new_grad",
      title: "Site Reliability Engineer, New Grad",
      primary_apply_url: "https://jobs.lever.co/acme/sre",
      location_type: "onsite",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(queryJobs({ q: "C++" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "C#" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: ".NET" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "dot net" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "SRE" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: '"site reliability"' }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "remote C++" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ q: "remote network" }, { snapshot }).total, 0);
  assert.equal(queryJobs({ q: "onsite network" }, { snapshot }).total, 1);
});

test("location search expands postal codes without treating prose as a state", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({ display_location: "New York, NY or Remote" }),
    liveRow({
      id: "boston-role",
      company: "Acme",
      display_location: "Boston, MA or Remote",
      primary_apply_url: "https://jobs.lever.co/acme/boston-role",
    }),
  ], "2026-08-21T22:00:00.000Z");

  assert.equal(queryJobs({ location: "Oregon" }, { snapshot }).total, 0);
  assert.equal(queryJobs({ location: "Indiana" }, { snapshot }).total, 0);
  assert.equal(queryJobs({ location: "IN" }, { snapshot }).total, 0);
  assert.equal(queryJobs({ location: "Massachusetts" }, { snapshot }).total, 1);
  assert.equal(queryJobs({ location: "NY" }, { snapshot }).total, 1);
  const indiana = createLiveSnapshotFromRows([
    liveRow({ display_location: "Fort Wayne, IN" }),
  ], "2026-08-21T22:00:00.000Z");
  assert.equal(queryJobs({ location: "IN" }, { snapshot: indiana }).total, 1);
  assert.equal(queryJobs({ location: "Indiana" }, { snapshot: indiana }).total, 1);
});

test("jobs sharing one displayed age stay together by company", () => {
  const snapshot = createLiveSnapshotFromRows([
    liveRow({
      id: "alpha-one",
      company: "Alpha",
      title: "Software Engineer Intern I",
      primary_apply_url: "https://jobs.lever.co/alpha/one",
      posted_date: "2026-08-21T19:50:00.000Z",
    }),
    liveRow({
      id: "beta-one",
      company: "Beta",
      title: "Software Engineer Intern I",
      primary_apply_url: "https://jobs.lever.co/beta/one",
      posted_date: "2026-08-21T19:55:00.000Z",
    }),
    liveRow({
      id: "alpha-two",
      company: "Alpha Company",
      title: "Software Engineer Intern II",
      primary_apply_url: "https://jobs.lever.co/alpha/two",
      posted_date: "2026-08-21T19:40:00.000Z",
    }),
    liveRow({
      id: "beta-two",
      company: "Beta",
      title: "Software Engineer Intern II",
      primary_apply_url: "https://jobs.lever.co/beta/two",
      posted_date: "2026-08-21T19:45:00.000Z",
    }),
    liveRow({
      id: "newer-role",
      company: "Zulu",
      title: "Software Engineer Intern III",
      primary_apply_url: "https://jobs.lever.co/zulu/three",
      posted_date: "2026-08-21T21:30:00.000Z",
    }),
  ], "2026-08-21T22:00:00.000Z");

  const page = queryJobs({}, {
    snapshot,
    limit: 10,
    now: "2026-08-21T22:00:00.000Z",
  });
  assert.deepEqual(
    page.items.map((job) => job.company),
    ["Zulu", "Alpha", "Alpha Company", "Beta", "Beta"],
  );
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

  const changedSameSnapshot = createLiveSnapshotFromRows([
    liveRow(),
    liveRow({
      id: "second-role",
      title: "Security Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/notion/security-role",
    }),
    liveRow({
      id: "third-role",
      title: "Data Engineer Intern",
      primary_apply_url: "https://jobs.lever.co/notion/data-role",
    }),
  ], firstSnapshot.asOf);
  assert.throws(
    () => queryJobs({}, {
      snapshot: changedSameSnapshot,
      cursor: firstPage.nextCursor,
      limit: 1,
    }),
    InvalidCursorError,
  );

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

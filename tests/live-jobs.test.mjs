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
let freshLiveModuleSequence = 0;

async function loadFreshLiveModule(fallbackRows = [fallbackFixture]) {
  freshLiveModuleSequence += 1;
  const marker = `fresh-${freshLiveModuleSequence}`;
  const freshFallbackUrl = `data:text/javascript;base64,${Buffer.from(
    `export const BUNDLED_FALLBACK_CAPTURED_AT = "2026-08-31T22:15:17.000Z"; export const BUNDLED_FALLBACK_ROWS = ${JSON.stringify(fallbackRows)}; export const TEST_MARKER = ${JSON.stringify(marker)};`,
  ).toString("base64")}`;
  const source = stripTypeScriptTypes(liveSource)
    .replace(/from "\.\/index";/, `from "${domainUrl}";`)
    .replace(/from "\.\/fallback-data";/, `from "${freshFallbackUrl}";`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${marker}`);
}

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
  assert.equal(snapshot.jobs.length, 4_857);
  assert.equal(new Set(snapshot.jobs.map((job) => job.id)).size, 4_857);
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

test("the live reader requests only rows changed since the verified snapshot", async () => {
  const freshLive = await loadFreshLiveModule();
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.TIMLEY_USE_DEMO_JOBS;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  const requests = [];
  process.env.TIMLEY_USE_DEMO_JOBS = "false";
  delete process.env.VERCEL_ENV;
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return Response.json([
      liveRow({
        id: "delta-role",
        company: "Acme",
        title: "Security Engineer Intern",
        primary_apply_url: "https://jobs.lever.co/acme/security-delta",
        primary_source: "lever:acme",
        updated_at: "2026-08-31T22:16:00.000Z",
      }),
    ], { headers: { "content-range": "0-0/1" } });
  };

  try {
    const snapshot = await freshLive.getPublicJobsSnapshot();
    const health = freshLive.getPublicJobsFeedHealth();
    const requestUrl = new URL(requests[0]);

    assert.equal(requests.length, 1);
    assert.deepEqual(requestUrl.searchParams.getAll("updated_at"), [
      "gt.2026-08-31T22:15:17.000Z",
    ]);
    assert.equal(requestUrl.searchParams.get("first_seen_at"), `lte.${snapshot.asOf}`);
    assert.equal(requestUrl.searchParams.has("is_active"), false);
    assert.equal(snapshot.jobs.length, 2);
    assert.equal(health.status, "healthy");
    assert.equal(health.mode, "live");
    assert.equal(health.baselineRows, 1);
    assert.equal(health.deltaRows, 1);
    assert.equal(health.mergedRows, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.TIMLEY_USE_DEMO_JOBS;
    else process.env.TIMLEY_USE_DEMO_JOBS = originalMode;
    if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnvironment;
  }
});

// Model the current-row filtering and ordering performed by PostgREST. Updating
// a row replaces its prior version; an updated_at cutoff cannot recover it.
function currentRepositoryFetch(rows, onPage) {
  return async (input) => {
    const url = new URL(String(input));
    const filtered = rows.filter((row) => ["updated_at", "first_seen_at"].every((field) =>
      url.searchParams.getAll(field).every((filter) => {
        const separator = filter.indexOf(".");
        const operator = filter.slice(0, separator);
        const value = Date.parse(filter.slice(separator + 1));
        return operator === "gt" ? Date.parse(row[field]) > value : Date.parse(row[field]) <= value;
      })
    ));
    const order = (url.searchParams.get("order") ?? "id.asc").split(",").map((part) => part.split(".")[0]);
    filtered.sort((a, b) => {
      for (const field of order) {
        const comparison = String(a[field]).localeCompare(String(b[field]));
        if (comparison) return comparison;
      }
      return 0;
    });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const page = filtered.slice(offset, offset + Number(url.searchParams.get("limit") ?? 1000));
    const response = Response.json(page, { headers: { "content-range": `${offset}-${offset + page.length - 1}/${filtered.length}` } });
    onPage?.(url);
    return response;
  };
}

async function withCurrentRepository(rows, verify, onPage) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalMode = process.env.TIMLEY_USE_DEMO_JOBS;
  process.env.TIMLEY_USE_DEMO_JOBS = "false";
  Date.now = () => Date.parse("2026-09-05T17:14:00.000Z");
  globalThis.fetch = currentRepositoryFetch(rows, onPage);
  try {
    await verify(await loadFreshLiveModule());
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalMode === undefined) delete process.env.TIMLEY_USE_DEMO_JOBS;
    else process.env.TIMLEY_USE_DEMO_JOBS = originalMode;
  }
}

test("refreshes inside a discovery bucket retain current jobs and apply closure tombstones", async () => {
  const rows = [
    { ...fallbackFixture, is_active: false, updated_at: "2026-09-05T17:10:06.000Z" },
    liveRow({
      id: "recently-refreshed-role", company: "ABB", title: "Product Marketing Intern",
      primary_apply_url: "https://jobs.lever.co/abb/product-marketing",
      first_seen_at: "2026-09-04T06:15:06.000Z", last_seen_at: "2026-09-05T17:10:06.000Z",
      updated_at: "2026-09-05T17:10:06.000Z",
    }),
    ...Array.from({ length: 10 }, (_, index) => liveRow({
      id: `not-discovered-at-boundary-${index}`,
      primary_apply_url: `https://jobs.lever.co/acme/new-discovery-${index}`,
      first_seen_at: "2026-09-05T17:12:00.000Z", last_seen_at: "2026-09-05T17:12:00.000Z",
      updated_at: "2026-09-05T17:12:00.000Z",
    })),
  ];
  await withCurrentRepository(rows, async (freshLive) => {
    const snapshot = await freshLive.getPublicJobsSnapshot();
    const page = queryJobs({}, { snapshot });
    assert.equal(snapshot.asOf, "2026-09-05T17:10:00.000Z");
    assert.equal(page.total, 1);
    assert.equal(page.items[0].company, "ABB");
    assert.equal(snapshot.jobs.find(job => job.sourceRecordIds.includes(fallbackFixture.id)).active, false);
    assert.equal(snapshot.jobs.some(job => job.sourceRecordIds.some(id => id.startsWith("not-discovered"))), false);
    assert.equal(freshLive.getPublicJobsFeedHealth().mode, "live");
    assert.equal(freshLive.getPublicJobsFeedHealth().invalidRows, 0);
  });
});

test("an employer refresh cannot move current rows between database pages", async () => {
  const rows = Array.from({ length: 1002 }, (_, index) => liveRow({
    id: `page-${String(index).padStart(4, "0")}`,
    primary_apply_url: `https://jobs.lever.co/acme/page-${index}`,
    updated_at: "2026-09-05T17:08:00.000Z",
  }));
  let pages = 0;
  await withCurrentRepository(rows, async (freshLive) => {
    const snapshot = await freshLive.getPublicJobsSnapshot();
    const sourceIds = new Set(snapshot.jobs.flatMap(job => job.sourceRecordIds));
    assert.equal(pages, 2);
    assert.equal(freshLive.getPublicJobsFeedHealth().mode, "live");
    assert.equal(freshLive.getPublicJobsFeedHealth().deltaRows, 1002);
    assert.equal(freshLive.getPublicJobsFeedHealth().duplicateDeltaIds, 0);
    for (const row of rows) assert.ok(sourceIds.has(row.id), `missing ${row.id}`);
  }, () => {
    pages += 1;
    if (pages === 1) rows[0].updated_at = "2026-09-05T17:09:00.000Z";
  });
});

test("same-bucket reconstruction on another instance rejects a changed cursor revision", async () => {
  const rows = [liveRow({ id: "changing-role", updated_at: "2026-09-05T17:09:00.000Z" })];
  await withCurrentRepository(rows, async (firstInstance) => {
    const first = await firstInstance.getPublicJobsSnapshot();
    const firstPage = queryJobs({}, { snapshot: first, limit: 1 });
    assert.ok(firstPage.nextCursor);
    rows[0].title = "Security Engineer Intern";
    rows[0].updated_at = "2026-09-05T17:13:00.000Z";
    assert.equal(await firstInstance.getPublicJobsSnapshot(first.asOf), first);
    const secondInstance = await loadFreshLiveModule();
    const rebuilt = await secondInstance.getPublicJobsSnapshot(first.asOf);
    assert.equal(rebuilt.asOf, first.asOf);
    assert.throws(() => queryJobs({}, { snapshot: rebuilt, cursor: firstPage.nextCursor }), InvalidCursorError);
  });
});

test("live employer receipts use collection time while future receipts remain untrusted", async () => {
  const makeEvidenceRow = (id, checkedAt, eligibility = "accepted") => {
    const url = `https://jobs.lever.co/acme/${id}`;
    return liveRow({
      id, primary_apply_url: url, updated_at: "2026-09-05T17:13:00.000Z",
      employer_evidence: { status: "verified", sourceUrl: url, contentHash: "a".repeat(64),
        checkedAt, title: "Verified employer title", sponsorship: "Not offered", eligibility },
    });
  };
  const rows = [
    makeEvidenceRow("fresh-receipt", "2026-09-05T17:13:00.000Z"),
    makeEvidenceRow("future-receipt", "2026-09-05T17:15:00.000Z"),
    makeEvidenceRow("newly-quarantined", "2026-09-05T17:13:00.000Z", "quarantined"),
  ];
  await withCurrentRepository(rows, async (freshLive) => {
    const snapshot = await freshLive.getPublicJobsSnapshot();
    const find = id => snapshot.jobs.find(job => job.sourceRecordIds.includes(id));
    assert.equal(find("fresh-receipt").sponsorship, "Not offered");
    assert.equal(find("fresh-receipt").title, "Verified employer title");
    assert.equal(find("future-receipt").sponsorship, undefined);
    assert.equal(find("future-receipt").title, "Software Engineer Intern");
    assert.equal(find("newly-quarantined").eligibilityStatus, "quarantined");
    const publicIds = new Set(queryJobs({}, { snapshot }).items.map(job => job.id));
    assert.equal(publicIds.has(find("newly-quarantined").id), false);
    const deterministic = createLiveSnapshotFromRows(rows, snapshot.asOf);
    assert.equal(deterministic.jobs.find(job => job.sourceRecordIds.includes("fresh-receipt")).sponsorship, undefined);
  });
});

test("cursor revisions detect evidence-only changes to eligibility and date provenance", async () => {
  for (const change of ["eligibility", "dateProvenance"]) {
    const url = "https://jobs.lever.co/acme/evidence-change";
    const row = liveRow({
      id: "evidence-change", primary_apply_url: url, primary_source: "simplify",
      posted_date: "2026-09-04", first_seen_at: "2026-09-01T12:00:00.000Z",
      last_seen_at: "2026-09-05T17:09:00.000Z", updated_at: "2026-09-05T17:09:00.000Z",
    });
    await withCurrentRepository([row], async (firstInstance) => {
      const first = await firstInstance.getPublicJobsSnapshot();
      const firstPage = queryJobs({}, { snapshot: first, limit: 1 });
      assert.ok(firstPage.nextCursor);
      row.updated_at = "2026-09-05T17:13:00.000Z";
      row.employer_evidence = {
        status: "verified", sourceUrl: url, contentHash: "b".repeat(64), checkedAt: row.updated_at,
        ...(change === "eligibility" ? { eligibility: "quarantined" } : { postedAt: row.posted_date }),
      };
      const secondInstance = await loadFreshLiveModule();
      const rebuilt = await secondInstance.getPublicJobsSnapshot(first.asOf);
      const find = snapshot => snapshot.jobs.find(job => job.sourceRecordIds.includes(row.id));
      assert.equal(find(first).title, find(rebuilt).title);
      assert.equal(find(first).employerPostedAt, find(rebuilt).employerPostedAt);
      assert.notEqual(find(first)[change === "eligibility" ? "eligibilityStatus" : change],
        find(rebuilt)[change === "eligibility" ? "eligibilityStatus" : change]);
      assert.throws(() => queryJobs({}, { snapshot: rebuilt, cursor: firstPage.nextCursor }), InvalidCursorError, change);
    });
  }
});

test("production ignores demo mode and backs off after a failed live refresh", async () => {
  const freshLive = await loadFreshLiveModule();
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.TIMLEY_USE_DEMO_JOBS;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  let requests = 0;
  process.env.TIMLEY_USE_DEMO_JOBS = "true";
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = async () => {
    requests += 1;
    return new Response("quota unavailable", { status: 402 });
  };

  try {
    const first = await freshLive.getPublicJobsSnapshot();
    const second = await freshLive.getPublicJobsSnapshot();
    const health = freshLive.getPublicJobsFeedHealth();

    assert.equal(first, second);
    assert.equal(requests, 1);
    assert.equal(first.fallbackCapturedAt, "2026-08-31T22:15:17.000Z");
    assert.equal(first.jobs.length, 1);
    assert.equal(health.status, "degraded");
    assert.equal(health.mode, "verified-fallback");
    assert.equal(health.consecutiveFailures, 1);
    assert.ok(Date.parse(health.nextRetryAt) > Date.now());
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.TIMLEY_USE_DEMO_JOBS;
    else process.env.TIMLEY_USE_DEMO_JOBS = originalMode;
    if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnvironment;
  }
});

test("an incomplete delta page cannot replace the verified feed", async () => {
  const freshLive = await loadFreshLiveModule();
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.TIMLEY_USE_DEMO_JOBS;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  process.env.TIMLEY_USE_DEMO_JOBS = "false";
  delete process.env.VERCEL_ENV;
  globalThis.fetch = async () => Response.json([
    liveRow({ id: "only-one-of-two", updated_at: "2026-08-31T22:16:00.000Z" }),
  ], { headers: { "content-range": "0-0/2" } });

  try {
    const snapshot = await freshLive.getPublicJobsSnapshot();
    const health = freshLive.getPublicJobsFeedHealth();

    assert.equal(snapshot.fallbackCapturedAt, "2026-08-31T22:15:17.000Z");
    assert.equal(snapshot.jobs.length, 1);
    assert.equal(health.mode, "verified-fallback");
    assert.equal(health.lastSuccessAt, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.TIMLEY_USE_DEMO_JOBS;
    else process.env.TIMLEY_USE_DEMO_JOBS = originalMode;
    if (originalVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnvironment;
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
  assert.equal(snapshot.jobs[0].sponsorship, undefined);
});

test("community sponsorship claims stay unconfirmed while exact empty taxonomy is preserved", () => {
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
  assert.equal(noMajor?.sponsorship, undefined);
  assert.equal(restricted?.sponsorship, undefined);
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

test("ambiguous titles remain available until employer requirements establish ineligibility", () => {
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
      "Senior Software Engineer",
      "Software Engineer II",
      "Software Engineer, New Grad",
      "Product Manager, New Grad",
      "Rising Senior Software Engineer Program",
    ]),
  );
  assert.notEqual(getJobById(
    snapshot.jobs.find((job) => job.sourceRecordIds.includes("senior-role")).id,
    { snapshot },
  ), null);
});

test("fresh employer eligibility survives duplicate merging while stale exclusions do not hide jobs", () => {
  const url='https://jobs.lever.co/acme/experienced-role';
  const asOf='2026-08-31T22:00:00.000Z';
  const receipt={status:'verified',checkedAt:'2026-08-31T20:00:00.000Z',sourceUrl:url,contentHash:'a'.repeat(64),title:'Senior Engineer',eligibility:'quarantined',requirements:['Candidates must have 5 years of professional experience.']};
  const build=evidence=>createLiveSnapshotFromRows([
    liveRow({id:'evidence-row',role_type:'new_grad',title:'Senior Engineer',primary_apply_url:url,employer_evidence:evidence}),
    liveRow({id:'community-mirror',role_type:'new_grad',title:'Senior Engineer',primary_apply_url:url,primary_source:'simplify'}),
  ],asOf);
  const excluded=build(receipt);
  assert.equal(excluded.jobs.length,1,'preserve the canonical record for diagnosis');
  assert.equal(queryJobs({}, {snapshot:excluded}).items.length,0);
  assert.equal(getJobById(excluded.jobs[0].id,{snapshot:excluded}),null);
  const graduate=build({...receipt,eligibility:'accepted',requirements:['Fresh PhD graduates are eligible.']});
  assert.equal(queryJobs({}, {snapshot:graduate}).items.length,1);
  assert.equal(queryJobs({}, {snapshot:graduate}).items[0].eligibilityNeedsReview,false);
  const expired=build({...receipt,checkedAt:'2026-08-01T00:00:00.000Z'});
  assert.equal(queryJobs({}, {snapshot:expired}).items.length,1);
  assert.equal(queryJobs({}, {snapshot:expired}).items[0].eligibilityNeedsReview,true);
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

test("numeric and multipart Workday identities preserve distinct requisitions and old links", () => {
  const base = 'https://hp.wd5.myworkdayjobs.com';
  const urls = [`${base}/external/job/Texas/Software-Intern_3161388`, `${base}/external-eu/job/Texas/Software-Intern_3161388-2`, `${base}/external/job/Texas/Software-Intern_3161399`];
  const snapshot = createLiveSnapshotFromRows(urls.map((url,i)=>liveRow({id:`numeric-${i}`,company:'HP',primary_apply_url:url})), '2026-08-31T22:15:17.000Z');
  assert.equal(snapshot.jobs.length,2);
  const merged=snapshot.jobs.find(j=>j.sourceRecordIds.length===2);
  assert.ok(merged);
  for (const alias of merged.legacyIds) assert.equal(getJobById(alias,{snapshot}).id,merged.id);
  assert.match(providerIdentityFromUrl('https://alcon.wd5.myworkdayjobs.com/jobs/job/Texas/Intern_R-2026-49480','Alcon').key,/R-2026-49480$/);
  assert.equal(providerIdentityFromUrl(`${base}/external/job/Texas/Intern_2027`,'HP'),null);
  assert.equal(providerIdentityFromUrl(`${base}/external/job/%XX`,'HP'),null);
});

test("sponsorship requires fresh matching employer evidence and preserves explicit restrictions", () => {
  const asOf='2026-08-31T22:15:17.000Z';
  const url='https://abb.wd3.myworkdayjobs.com/jobs/job/Tennessee/Intern_JR00045260';
  const evidence={status:'verified',checkedAt:'2026-08-31T20:00:00.000Z',sourceUrl:url,contentHash:'a'.repeat(64),sponsorship:'Not offered',title:'Product Marketing Intern - Summer 2027',compensation:'$20 - $34/hour'};
  const make=ev=>createLiveSnapshotFromRows([liveRow({primary_apply_url:url,sponsorship:'offers-sponsorship',employer_evidence:ev})],asOf).jobs[0];
  assert.equal(make(undefined).sponsorship,undefined);
  assert.equal(make(evidence).sponsorship,'Not offered');
  assert.equal(make(evidence).compensation,'$20 - $34/hour');
  assert.equal(make({...evidence,sponsorship:'Confirmed'}).sponsorship,'Confirmed');
  assert.equal(make({...evidence,checkedAt:'2026-08-01T00:00:00Z'}).sponsorship,undefined);
  assert.equal(make({...evidence,sourceUrl:url+'9'}).sponsorship,undefined);
  assert.equal(make({...evidence,checkedAt:'2026-09-01T00:00:00Z'}).sponsorship,undefined);
});

test("newly imported older listings do not outrank recent postings", () => {
  const snapshot=createLiveSnapshotFromRows([
    liveRow({id:'old-import',company:'AAA',primary_apply_url:'https://jobs.lever.co/aaa/old-import',primary_source:'simplify',posted_date:'2026-08-01',first_seen_at:'2026-08-31T12:00:00Z',last_seen_at:'2026-08-31T12:00:00Z'}),
    liveRow({id:'recent-job',company:'ZZZ',primary_apply_url:'https://jobs.lever.co/zzz/recent',primary_source:'simplify',posted_date:'2026-08-30',first_seen_at:'2026-08-30T12:00:00Z',last_seen_at:'2026-08-31T12:00:00Z'}),
  ],'2026-08-31T22:15:00Z');
  const page=queryJobs({}, {snapshot,now:'2026-08-31T22:15:00Z'});
  assert.equal(page.items[0].company,'ZZZ');
  assert.equal(page.items[1].freshnessKind,'reported');
});

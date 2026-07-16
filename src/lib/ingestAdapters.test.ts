import assert from "node:assert/strict";
import test from "node:test";
import type { SourceSnapshot } from "./ingest/contracts";
import { applyPostFilters } from "./ingest/normalize";
import { SOURCE_REGISTRY } from "./ingest/sourceRegistry";
import { parseNorthwesternFeed } from "./ingest/sources/northwestern-quant";
import { parseSimplifyFeed } from "./ingest/sources/simplify";
import { parseSpeedyFeed } from "./ingest/sources/speedy";
import { parseVanshFeed } from "./ingest/sources/vansh";
import { parseZapplyFeed } from "./ingest/sources/zapply";
import { parseZshahFeed } from "./ingest/sources/zshah";

const NOW = new Date("2026-07-12T12:00:00.000Z");

const SIMPLIFY_FIXTURE = JSON.stringify([
  {
    id: "simplify-123",
    company_name: "Acme Labs",
    title: "Software Engineering Intern",
    url: "https://jobs.example.com/apply/simplify-123?utm_source=feed",
    locations: ["Denver, CO"],
    terms: ["Summer 2027"],
    category: "Software",
    sponsorship: "Offers sponsorship",
    active: true,
    is_visible: true,
    date_posted: Date.UTC(2026, 6, 10) / 1_000,
    requisition_id: "REQ-SIMPLIFY",
  },
]);

const ZSHAH_FIXTURE = JSON.stringify({
  generated_at: "2026-07-12T10:00:00Z",
  count: 1,
  jobs: [
    {
      id: "zshah-123",
      company: "Acme Labs",
      title: "Data Science Intern",
      season: "Summer 2027",
      category: "Data",
      location: "Denver, CO",
      url: "https://jobs.example.com/apply/zshah-123",
      posted_at: "2026-07-09T10:00:00Z",
      sponsorship: "offers-sponsorship",
      salary: "$40-$50/hr",
      requisition_id: "REQ-ZSHAH",
    },
  ],
});

const ZAPPLY_FIXTURE = `
<summary><h3>Software Engineering</h3></summary>
| Company | Role | Location | Posted | Visa | **Apply** |
| --- | --- | --- | --- | --- | --- |
| Acme Labs | Software Engineering Intern - Summer 2027 | Denver, CO | 2d | Sponsors | [Apply](https://jobs.example.com/apply/zapply-123) |
`;

const ZAPPLY_CURRENT_FIXTURE = `
<summary><h3>Software Engineering</h3></summary>
| Company | Role | Location | Posted | Visa | **Apply** |
|---------|------|----------|--------|------|----------|
| **Acme Labs** | Software Engineering Intern - Summer 2027 | Denver, CO | Recently | | [Apply](https://jobs.example.com/apply/zapply-current) |
`;

const NORTHWESTERN_FIXTURE = `
## Acme Capital
**Locations**: Denver, CO
|Role|Links|
|-------|-------|
|SWE|[Summer 2027](https://jobs.example.com/apply/northwestern-123)|
`;

const SPEEDY_FIXTURE = `
<!-- TABLE_START -->
| Company | Position | Location | Salary | Posting | Age |
| --- | --- | --- | --- | --- | --- |
| <strong>Acme Space</strong> | Software Engineering Intern | Denver, CO | $8,000/month | <a href="https://jobs.example.com/apply/speedy-123">Apply</a> | 2d |
<!-- TABLE_END -->
`;

const VANSH_FIXTURE = `
| Company | Role | Location | Application | Date Posted |
| --- | --- | --- | --- | --- |
| Acme Industries | Software Engineering Intern | Denver, CO | <a href="https://jobs.example.com/apply/vansh-123">Apply</a> | Jul 10 |
`;

function parseFixtures(): SourceSnapshot[] {
  return [
    parseSimplifyFeed(
      SIMPLIFY_FIXTURE,
      SOURCE_REGISTRY.simplify.feeds[0],
      NOW.getTime(),
    ),
    parseZshahFeed(ZSHAH_FIXTURE, NOW.getTime()),
    parseZapplyFeed(ZAPPLY_FIXTURE, NOW),
    parseNorthwesternFeed(NORTHWESTERN_FIXTURE),
    parseSpeedyFeed(
      SPEEDY_FIXTURE,
      SOURCE_REGISTRY.speedyapply.feeds[0],
      NOW,
    ),
    parseVanshFeed(VANSH_FIXTURE, NOW),
  ];
}

test("all six source adapters accept their current fixture shape with exact counts", () => {
  const snapshots = parseFixtures();
  const expectedTerms = {
    simplify: ["summer-2027"],
    zshah101: ["summer-2027"],
    zapplyjobs: ["summer-2027"],
    northwesternfintech: ["summer-2027"],
    speedyapply: [],
    vanshb03: ["summer-2027"],
  } as const;
  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.source),
    [
      "simplify",
      "zshah101",
      "zapplyjobs",
      "northwesternfintech",
      "speedyapply",
      "vanshb03",
    ],
  );

  for (const snapshot of snapshots) {
    assert.deepEqual(
      {
        raw: snapshot.raw_count,
        parsed: snapshot.parsed_count,
        accepted: snapshot.accepted_count,
        rejected: snapshot.rejected_count,
      },
      { raw: 1, parsed: 1, accepted: 1, rejected: 0 },
      snapshot.source,
    );
    assert.equal(snapshot.health.schema_valid, true, snapshot.source);
    assert.equal(snapshot.health.markers_valid, true, snapshot.source);
    assert.equal(snapshot.health.complete, true, snapshot.source);
    assert.deepEqual(snapshot.health.issues, [], snapshot.source);

    const [rawJob] = snapshot.jobs;
    assert.match(rawJob.link, /^https:\/\/jobs\.example\.com\/apply\//);
    assert.ok(rawJob.raw_title, snapshot.source);
    assert.ok(rawJob.raw_location, snapshot.source);
    assert.match(rawJob.source_url ?? "", /^https:\/\//, snapshot.source);

    const [acceptedJob] = applyPostFilters(snapshot.jobs, NOW.getTime());
    assert.ok(acceptedJob, snapshot.source);
    assert.equal(acceptedJob.location, "Denver, CO", snapshot.source);
    assert.equal(acceptedJob.locations?.[0].country_code, "US", snapshot.source);
    assert.equal(acceptedJob.locations?.[0].region_code, "CO", snapshot.source);
    assert.equal(acceptedJob.locations?.[0].eligible, true, snapshot.source);
    assert.equal(acceptedJob.observations?.length, 1, snapshot.source);
    assert.deepEqual(
      acceptedJob.term_keys,
      expectedTerms[snapshot.source],
      snapshot.source,
    );
    assert.deepEqual(
      acceptedJob.observations?.[0].term_keys,
      expectedTerms[snapshot.source],
      snapshot.source,
    );
  }
});

test("Simplify retains every current structured term while preserving one raw season", () => {
  const snapshot = parseSimplifyFeed(
    JSON.stringify([
      {
        ...JSON.parse(SIMPLIFY_FIXTURE)[0],
        terms: ["Fall 2026", "Summer 2027"],
      },
    ]),
    SOURCE_REGISTRY.simplify.feeds[0],
    NOW.getTime(),
  );
  const [accepted] = applyPostFilters(snapshot.jobs, NOW.getTime());

  assert.equal(accepted.season, "Fall 2026");
  assert.deepEqual(accepted.term_keys, ["fall-2026", "summer-2027"]);
});

test("adapter salary text gains source-listed provenance after normalization", () => {
  const snapshots = parseFixtures();
  const normalized = snapshots.flatMap((snapshot) =>
    applyPostFilters(snapshot.jobs, NOW.getTime()),
  );

  const zshah = normalized.find((job) => job.source === "zshah101");
  assert.equal(zshah?.compensation?.cadence, "hourly");
  assert.equal(zshah?.compensation?.annualized_maximum, 104_000);
  assert.equal(zshah?.compensation?.provenance, "source-listed");

  const speedy = normalized.find((job) => job.source === "speedyapply");
  assert.equal(speedy?.compensation?.cadence, "monthly");
  assert.equal(speedy?.compensation?.annualized_minimum, 96_000);
  assert.equal(speedy?.compensation?.provenance, "source-listed");
});

test("Zapply accepts the current Recently value as an unknown posted date", () => {
  const snapshot = parseZapplyFeed(ZAPPLY_CURRENT_FIXTURE, NOW);

  assert.equal(snapshot.accepted_count, 1);
  assert.equal(snapshot.rejected_count, 0);
  assert.equal(snapshot.jobs[0]?.posted_date, null);
  assert.equal(snapshot.health.complete, true);
  assert.deepEqual(snapshot.health.issues, []);
});

test("Northwestern counts posting links and rejects an HTTP row without failing the feed", () => {
  const snapshot = parseNorthwesternFeed(`
## Acme Capital
**Locations**: Denver, CO
|Role|Links|
|-------|-------|
|SWE|[✅ HTTPS](https://jobs.example.com/apply/northwestern-valid) [HTTP](http://jobs.example.com/apply/northwestern-invalid)|
`);

  assert.equal(snapshot.raw_count, 2);
  assert.equal(snapshot.parsed_count, 2);
  assert.equal(snapshot.accepted_count, 1);
  assert.equal(snapshot.rejected_count, 1);
  assert.equal(snapshot.health.schema_valid, true);
  assert.equal(snapshot.health.markers_valid, true);
  assert.equal(snapshot.health.complete, true);
  assert.ok(
    snapshot.health.issues.some((issue) => issue.code === "invalid_url"),
  );
});

test("structural failures and snapshots with no accepted rows stay incomplete", () => {
  const invalidJson = parseSimplifyFeed(
    "not json",
    SOURCE_REGISTRY.simplify.feeds[0],
    NOW.getTime(),
  );
  assert.equal(invalidJson.health.schema_valid, false);
  assert.equal(invalidJson.health.complete, false);
  assert.ok(
    invalidJson.health.issues.some((issue) => issue.code === "invalid_json"),
  );

  const invalidEnvelope = parseZshahFeed(
    JSON.stringify({ generated_at: "2026-07-12", count: 0 }),
    NOW.getTime(),
  );
  assert.equal(invalidEnvelope.health.schema_valid, false);
  assert.equal(invalidEnvelope.health.complete, false);
  assert.ok(
    invalidEnvelope.health.issues.some((issue) =>
      ["invalid_schema", "empty_snapshot"].includes(issue.code),
    ),
  );

  const missingMarker = parseZapplyFeed(
    ZAPPLY_FIXTURE.replace(
      "<summary><h3>Software Engineering</h3></summary>",
      "## Software Engineering",
    ),
    NOW,
  );
  assert.equal(missingMarker.accepted_count, 1);
  assert.equal(missingMarker.health.markers_valid, false);
  assert.equal(missingMarker.health.complete, false);
  assert.ok(
    missingMarker.health.issues.some((issue) => issue.code === "missing_marker"),
  );

  const unsafeUrl = parseVanshFeed(
    VANSH_FIXTURE.replace(
      "https://jobs.example.com/apply/vansh-123",
      "http://jobs.example.com/apply/vansh-123",
    ),
    NOW,
  );
  assert.equal(unsafeUrl.accepted_count, 0);
  assert.equal(unsafeUrl.rejected_count, 1);
  assert.equal(unsafeUrl.health.complete, false);
  assert.ok(
    unsafeUrl.health.issues.some((issue) => issue.code === "invalid_url"),
  );

  const invalidDate = parseSpeedyFeed(
    SPEEDY_FIXTURE.replace("| 2d |", "| yesterday |"),
    SOURCE_REGISTRY.speedyapply.feeds[0],
    NOW,
  );
  assert.equal(invalidDate.accepted_count, 0);
  assert.equal(invalidDate.rejected_count, 1);
  assert.equal(invalidDate.health.complete, false);
  assert.ok(
    invalidDate.health.issues.some((issue) => issue.code === "invalid_date"),
  );
});

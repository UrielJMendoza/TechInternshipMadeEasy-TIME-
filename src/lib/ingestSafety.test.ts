import assert from "node:assert/strict";
import test from "node:test";
import {
  createSnapshot,
  jobsFromHealthySnapshot,
  rejectedCountAfterPostFilters,
} from "./ingest/contracts";
import { FeedFetchError, fetchFeedText } from "./ingest/fetch";
import { normalizeStructuredLocation } from "./ingest/location";
import {
  cleanLink,
  companyDomainFromApplicationUrl,
  comparableAnnualCompensation,
  dedupeJobs,
  dedupeKey,
  normalizePostedDate,
  parseSourceCompensation,
  postedDateFromUnixSeconds,
} from "./ingest/normalize";
import {
  SOURCE_IDS,
  SOURCE_REGISTRY,
  sourceDefinition,
  sourceFeed,
} from "./ingest/sourceRegistry";
import type { NormalizedJob } from "./types";

function fixtureJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    title: "Software Engineering Intern",
    company: "Example Company",
    location: "Denver, CO",
    category: "software",
    role_type: "internship",
    season: "Summer 2027",
    salary: null,
    link: "https://jobs.example.com/apply/fixture",
    source: "simplify",
    sponsorship: null,
    posted_date: "2026-07-01",
    dedupe_key: "fixture-key",
    ...overrides,
  };
}

test("source registry is typed, complete, and contains only bounded HTTPS feeds", () => {
  assert.deepEqual([...SOURCE_IDS].sort(), [
    "northwesternfintech",
    "simplify",
    "speedyapply",
    "vanshb03",
    "zapplyjobs",
    "zshah101",
  ]);

  for (const source of SOURCE_IDS) {
    const definition = sourceDefinition(source);
    assert.equal(definition, SOURCE_REGISTRY[source]);
    assert.equal(definition.id, source);
    assert.match(definition.homepage, /^https:\/\//);
    assert.ok(definition.parser_version.length > 0);
    assert.ok(definition.feeds.length > 0);

    for (const feed of definition.feeds) {
      assert.equal(sourceFeed(source, feed.id), feed);
      assert.match(feed.url, /^https:\/\//);
      assert.ok(feed.max_response_bytes > 0);
      assert.ok(feed.max_response_bytes <= 24 * 1024 * 1024);
      assert.ok(feed.expected_content_types.length > 0);
      if (feed.format === "markdown") {
        assert.ok(feed.required_markers.length > 0);
      }
    }
  }
});

test("bounded fetch validates content, caps retries, bytes, and deadlines", async () => {
  let attempts = 0;
  const sleeps: number[] = [];
  const fetchImpl = (async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError("temporary network failure");
    return new Response("{\"ok\":true}", {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }) as typeof fetch;

  const result = await fetchFeedText("https://feeds.example.com/jobs.json", {
    fetchImpl,
    expectedContentTypes: ["application/json"],
    maxRetries: 99,
    random: () => 0,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });
  assert.equal(result.text, "{\"ok\":true}");
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [150, 300]);

  await assert.rejects(
    fetchFeedText("https://feeds.example.com/jobs.json", {
      fetchImpl: (async () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
      expectedContentTypes: ["application/json"],
    }),
    (error) =>
      error instanceof FeedFetchError && error.code === "content_type",
  );

  await assert.rejects(
    fetchFeedText("https://feeds.example.com/jobs.json", {
      fetchImpl: (async () =>
        new Response("oversized", {
          headers: {
            "content-type": "application/json",
            "content-length": "999",
          },
        })) as typeof fetch,
      expectedContentTypes: ["application/json"],
      maxBytes: 8,
    }),
    (error) =>
      error instanceof FeedFetchError && error.code === "response_too_large",
  );

  const hangingFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    })) as typeof fetch;
  await assert.rejects(
    fetchFeedText("https://feeds.example.com/jobs.json", {
      fetchImpl: hangingFetch,
      timeoutMs: 5,
      maxRetries: 0,
    }),
    (error) => error instanceof FeedFetchError && error.code === "timeout",
  );
});

test("snapshot counts reject bad rows while only structural failures fail closed", () => {
  const empty = createSnapshot(
    "simplify",
    "test-v1",
    [],
    { raw_count: 1, parsed_count: 1, accepted_count: 0 },
  );
  assert.equal(empty.rejected_count, 1);
  assert.equal(empty.health.complete, false);
  assert.ok(
    empty.health.issues.some((issue) => issue.code === "empty_snapshot"),
  );
  assert.throws(() => jobsFromHealthySnapshot(empty), /snapshot is incomplete/);

  const partial = createSnapshot(
    "simplify",
    "test-v1",
    [fixtureJob()],
    { raw_count: 2, parsed_count: 2, accepted_count: 1 },
    [
      {
        code: "invalid_url",
        message: "one row had an unsafe URL",
        row: 2,
      },
    ],
  );
  assert.equal(partial.rejected_count, 1);
  assert.equal(partial.health.schema_valid, true);
  assert.equal(partial.health.complete, true);
  assert.equal(jobsFromHealthySnapshot(partial).length, 1);

  const partialDate = createSnapshot(
    "simplify",
    "test-v1",
    [fixtureJob()],
    { raw_count: 2, parsed_count: 2, accepted_count: 1 },
    [
      {
        code: "invalid_date",
        message: "one row had an invalid posted date",
        row: 2,
      },
    ],
  );
  assert.equal(partialDate.rejected_count, 1);
  assert.equal(partialDate.health.complete, true);

  const structurallyInvalid = createSnapshot(
    "simplify",
    "test-v1",
    [fixtureJob()],
    { raw_count: 2, parsed_count: 1, accepted_count: 1 },
    [
      {
        code: "invalid_row",
        message: "one row did not match the source schema",
        row: 2,
      },
    ],
  );
  assert.equal(structurallyInvalid.health.schema_valid, false);
  assert.equal(structurallyInvalid.health.complete, false);
  assert.throws(
    () => jobsFromHealthySnapshot(structurallyInvalid),
    /invalid_row/,
  );

  const safelyFiltered = createSnapshot(
    "simplify",
    "test-v1",
    [fixtureJob()],
    { raw_count: 2, parsed_count: 1, accepted_count: 1 },
  );
  assert.equal(safelyFiltered.rejected_count, 0);
  assert.equal(safelyFiltered.health.complete, true);
  assert.equal(jobsFromHealthySnapshot(safelyFiltered).length, 1);

  const historicRows = createSnapshot(
    "simplify",
    "test-v1",
    [fixtureJob(), fixtureJob({ link: "https://jobs.example.com/apply/second" })],
    { raw_count: 100, parsed_count: 2, accepted_count: 2 },
  );
  assert.equal(historicRows.rejected_count, 0);
  assert.equal(rejectedCountAfterPostFilters(historicRows, 1), 1);
});

test("structured locations require explicit US evidence and preserve mixed rows", () => {
  const mixed = normalizeStructuredLocation("London, UK; Chicago, IL");
  assert.equal(mixed.display, "Chicago, IL");
  assert.equal(mixed.eligible, true);
  assert.deepEqual(
    mixed.locations.map((location) => [
      location.raw_location,
      location.country_code,
      location.region_code,
      location.eligible,
    ]),
    [
      ["London, UK", "GB", null, false],
      ["Chicago, IL", "US", "IL", true],
    ],
  );

  const amsterdamNh = normalizeStructuredLocation("Amsterdam, NH");
  assert.equal(amsterdamNh.eligible, false);
  assert.equal(amsterdamNh.locations[0].country_code, "NL");
  assert.equal(amsterdamNh.locations[0].quarantine_reason, "explicit_foreign");

  const amsterdamNy = normalizeStructuredLocation("Amsterdam, NY");
  assert.equal(amsterdamNy.eligible, true);
  assert.equal(amsterdamNy.locations[0].country_code, "US");
  assert.equal(amsterdamNy.locations[0].region_code, "NY");

  const territory = normalizeStructuredLocation("Chicago, Puerto Rico");
  assert.equal(territory.display, "Chicago, IL; Puerto Rico");
  assert.deepEqual(
    territory.locations.map((location) => [
      location.country_code,
      location.region_code,
      location.eligible,
    ]),
    [
      ["US", "IL", true],
      ["US", "PR", true],
    ],
  );

  const territoryCity = normalizeStructuredLocation("San Juan, Puerto Rico");
  assert.equal(territoryCity.eligible, true);
  assert.equal(territoryCity.locations[0].country_code, "US");
  assert.equal(territoryCity.locations[0].region_code, "PR");
  assert.equal(territoryCity.locations[0].city, "San Juan");

  const territoryRemote = normalizeStructuredLocation("Remote in Puerto Rico");
  assert.equal(territoryRemote.eligible, true);
  assert.equal(territoryRemote.locations[0].location_type, "remote");
  assert.equal(territoryRemote.locations[0].region_code, "PR");

  const remoteUs = normalizeStructuredLocation("Remote in USA");
  assert.equal(remoteUs.eligible, true);
  assert.equal(remoteUs.locations[0].location_type, "remote");
  assert.equal(remoteUs.locations[0].country_code, "US");

  for (const raw of [
    "Remote in Canada",
    "Remote in Israel",
    "Remote in South Africa",
    "San Jose, Costa Rica",
    "Remote worldwide",
  ]) {
    const result = normalizeStructuredLocation(raw);
    assert.equal(result.eligible, false, raw);
    assert.equal(result.quarantined, true, raw);
  }

  const blank = normalizeStructuredLocation("");
  assert.equal(blank.eligible, false);
  assert.deepEqual(blank.quarantine_reasons, ["blank"]);

  assert.equal(
    normalizeStructuredLocation("Remote", { sourceUsOnly: true }).eligible,
    true,
  );
  assert.equal(
    normalizeStructuredLocation("", { sourceUsOnly: true }).eligible,
    false,
  );
});

test("company logo domains require exact first-party application-host evidence", () => {
  assert.equal(
    companyDomainFromApplicationUrl(
      "Microsoft Corporation",
      "https://careers.microsoft.com/jobs/123",
    ),
    "microsoft.com",
  );
  assert.equal(
    companyDomainFromApplicationUrl("Amazon", "https://amazon.jobs/content/123"),
    "amazon.jobs",
  );
  assert.equal(
    companyDomainFromApplicationUrl(
      "Example Labs",
      "https://boards.greenhouse.io/example/jobs/123",
    ),
    null,
  );
  assert.equal(
    companyDomainFromApplicationUrl(
      "Meta",
      "https://www.metacareers.com/jobs/123",
    ),
    null,
  );
});

test("application URLs and posted dates reject unsafe or malformed input", () => {
  assert.equal(
    cleanLink(
      "https://jobs.example.com/apply?utm_source=list&ref=feed&keep=1",
    ),
    "https://jobs.example.com/apply?keep=1",
  );
  for (const link of [
    "http://jobs.example.com/apply",
    "https://user:secret@jobs.example.com/apply",
    "https://localhost/apply",
    "https://127.0.0.1/apply",
    "not a url",
    `https://jobs.example.com/${"x".repeat(2_100)}`,
  ]) {
    assert.equal(cleanLink(link), "", link);
  }

  const now = Date.UTC(2026, 6, 12);
  assert.equal(normalizePostedDate("2026-07-11", now), "2026-07-11");
  assert.equal(
    normalizePostedDate("2026-07-11T20:15:30.000Z", now),
    "2026-07-11",
  );
  for (const date of [
    "2026-02-30",
    "2026-07-11garbage",
    "2026-07-11T99:00:00Z",
    "2026-08-01",
  ]) {
    assert.equal(normalizePostedDate(date, now), null, date);
  }
  assert.equal(postedDateFromUnixSeconds(1e15, now), null);
});

test("source compensation preserves cadence, provenance, and conservative sorting", () => {
  const hourly = parseSourceCompensation("$40–$50/hr Summer 2027");
  assert.deepEqual(hourly, {
    currency: "USD",
    minimum: 40,
    maximum: 50,
    cadence: "hourly",
    annualized_minimum: 83_200,
    annualized_maximum: 104_000,
    raw_text: "$40–$50/hr Summer 2027",
    parse_confidence: "high",
    provenance: "source-listed",
  });

  const monthly = parseSourceCompensation("USD 8,000 per month");
  assert.equal(monthly?.annualized_minimum, 96_000);
  assert.equal(monthly?.annualized_maximum, 96_000);

  const annual = parseSourceCompensation("$120k - $150k annually");
  assert.equal(annual?.minimum, 120_000);
  assert.equal(annual?.maximum, 150_000);
  assert.equal(comparableAnnualCompensation(annual?.raw_text ?? null), 150_000);

  assert.equal(comparableAnnualCompensation("CAD 70/hour"), 0);
  assert.equal(comparableAnnualCompensation("70-80 hourly"), 0);
  assert.equal(parseSourceCompensation("N/A"), null);
  assert.equal(parseSourceCompensation("competitive pay"), null);
});

test("dedupe is transitive and preserves every source observation and repost field", () => {
  const locations = normalizeStructuredLocation("Denver, CO").locations;
  const jobs = [
    fixtureJob({
      source: "simplify",
      link: "https://jobs.example.com/apply/shared?utm_source=simplify",
      dedupe_key: "first-key",
      posted_date: "2026-06-01",
      season: "Summer 2027",
      requisition_id: "REQ-A",
      salary: "$40/hr",
      locations,
    }),
    fixtureJob({
      source: "zshah101",
      link: "https://jobs.example.com/apply/shared",
      dedupe_key: "bridge-key",
      posted_date: "2026-06-15",
      season: "Fall 2026",
      requisition_id: "REQ-B",
      salary: "USD 8,000 per month",
      locations,
    }),
    fixtureJob({
      source: "vanshb03",
      link: "https://jobs.example.com/apply/repost",
      dedupe_key: "bridge-key",
      posted_date: "2026-07-01",
      season: "Spring 2027",
      requisition_id: "REQ-C",
      locations,
    }),
  ];

  const [merged] = dedupeJobs(jobs);
  assert.equal(dedupeJobs(jobs).length, 1);
  assert.equal(merged.source, "simplify");
  assert.equal(merged.posted_date, "2026-07-01");
  assert.deepEqual(merged.contributing_sources, [
    "simplify",
    "zshah101",
    "vanshb03",
  ]);
  assert.deepEqual(merged.seasons, [
    "Summer 2027",
    "Fall 2026",
    "Spring 2027",
  ]);
  assert.deepEqual(merged.term_keys, [
    "fall-2026",
    "spring-2027",
    "summer-2027",
  ]);
  assert.deepEqual(
    merged.observations?.map((observation) => observation.term_keys),
    [["summer-2027"], ["fall-2026"], ["spring-2027"]],
  );
  assert.deepEqual(merged.requisition_ids, ["REQ-A", "REQ-B", "REQ-C"]);
  assert.equal(merged.observations?.length, 3);
  assert.equal(merged.locations?.length, 1);
  assert.equal(merged.compensation?.provenance, "source-listed");

  assert.notEqual(
    dedupeKey("Varda", jobs[0].title, jobs[0].location),
    dedupeKey("Varda Space", jobs[0].title, jobs[0].location),
  );
});

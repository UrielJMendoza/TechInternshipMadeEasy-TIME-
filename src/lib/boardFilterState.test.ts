import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BOARD_FILTERS,
  activeFilterCount,
  boardUrl,
  normalizePublicJobsUrl,
  parseBoardFilters,
  parseStoredBoardFilters,
  publicBoardUrl,
  serializeBoardFilters,
} from "./boardFilterState";

test("public URL filters take precedence while private stored state stays local", () => {
  const stored = JSON.stringify({
    ...DEFAULT_BOARD_FILTERS,
    remoteOnly: true,
    locationIds: ["denver-co"],
    collection: "saved",
    stages: ["offer"],
  });
  const parsed = parseBoardFilters("?q=cloud&stages=interview,offer&visa=1", stored);

  assert.equal(parsed.query, "cloud");
  assert.equal(parsed.remoteOnly, false);
  assert.deepEqual(parsed.locationIds, []);
  assert.equal(parsed.collection, "saved");
  assert.deepEqual(parsed.stages, ["offer"]);
  assert.equal(parsed.visaSponsorship, true);
});

test("stored preferences load when no URL filter state exists", () => {
  const parsed = parseBoardFilters(
    "",
    JSON.stringify({
      ...DEFAULT_BOARD_FILTERS,
      tab: "new_grad",
      remoteOnly: true,
      locationOrder: "alphabetical",
    }),
  );

  assert.equal(parsed.tab, "new_grad");
  assert.equal(parsed.remoteOnly, true);
  assert.equal(parsed.locationOrder, "alphabetical");
});

test("invalid stored and URL values fall back safely", () => {
  assert.deepEqual(parseStoredBoardFilters("not-json"), DEFAULT_BOARD_FILTERS);
  const parsed = parseBoardFilters("?sort=broken&major=invalid&stages=offer,bogus");
  assert.equal(parsed.sort, "featured");
  assert.equal(parsed.major, "all");
  assert.deepEqual(parsed.stages, []);
});

test("legacy OA filters migrate in private browser storage only", () => {
  assert.deepEqual(
    parseStoredBoardFilters(
      JSON.stringify({ ...DEFAULT_BOARD_FILTERS, stages: ["oa"] }),
    ).stages,
    ["assessment"],
  );
});

test("serialization excludes defaults and preserves unrelated query parameters", () => {
  const filters = {
    ...DEFAULT_BOARD_FILTERS,
    tab: "new_grad" as const,
    locationIds: ["denver-co" as const],
    remoteOnly: true,
    sort: "location" as const,
  };
  assert.equal(
    serializeBoardFilters(filters).toString(),
    "tab=new-grad&locations=denver-co&sort=location&remote=1",
  );
  assert.equal(
    boardUrl("/jobs", "?utm_source=test&old=1", filters),
    "/jobs?utm_source=test&old=1&tab=new-grad&locations=denver-co&sort=location&remote=1",
  );
});

test("public filters round-trip while private tracker state stays out of URLs", () => {
  const filters = {
    ...DEFAULT_BOARD_FILTERS,
    tab: "new_grad" as const,
    query: "platform engineer",
    major: "computer-science" as const,
    niche: "software-engineering",
    locationIds: ["denver-co", "new-york-ny"] as const,
    locationOrder: "alphabetical" as const,
    freshness: "new" as const,
    collection: "saved" as const,
    sort: "application-stage" as const,
    stages: ["interview", "offer"] as const,
    remoteOnly: false,
    visaSponsorship: true,
    minimumSalary: "80000" as const,
  };
  const serialized = serializeBoardFilters({
    ...filters,
    locationIds: [...filters.locationIds],
    stages: [...filters.stages],
  });
  const publicUrl = `?${serialized.toString()}`;

  assert.doesNotMatch(publicUrl, /collection|stages|application-stage/);
  assert.deepEqual(
    parseBoardFilters(publicUrl, JSON.stringify(filters)),
    {
      ...filters,
      locationIds: [...filters.locationIds],
      sort: "application-stage",
      stages: [...filters.stages],
    },
  );
});

test("share URLs are deterministic and sanitize untrusted saved links", () => {
  const filters = {
    ...DEFAULT_BOARD_FILTERS,
    query: " platform ",
    locationIds: ["new-york-ny", "denver-co"] as const,
    collection: "saved" as const,
    stages: ["offer"] as const,
    sort: "application-stage" as const,
  };

  assert.equal(
    publicBoardUrl({
      ...filters,
      locationIds: [...filters.locationIds],
      stages: [...filters.stages],
    }),
    "/jobs?q=platform&locations=denver-co%2Cnew-york-ny",
  );
  assert.equal(
    normalizePublicJobsUrl(
      "/jobs?utm_source=private&q=cloud&locations=new-york-ny%2Cdenver-co&collection=saved&stages=offer#secret",
    ),
    null,
  );
  assert.equal(
    normalizePublicJobsUrl(
      "/jobs?utm_source=private&q=cloud&locations=new-york-ny%2Cdenver-co&collection=saved&stages=offer",
    ),
    "/jobs?q=cloud&locations=denver-co%2Cnew-york-ny",
  );
  assert.equal(normalizePublicJobsUrl("https://example.com/jobs?q=cloud"), null);
});

test("active filter count reflects filter groups without counting search or role tab", () => {
  assert.equal(
    activeFilterCount({
      ...DEFAULT_BOARD_FILTERS,
      tab: "new_grad",
      query: "security",
      major: "engineering",
      niche: "mechanical-engineering",
      locationIds: ["denver-co", "new-york-ny"],
      stages: ["offer", "interview"],
      freshness: "hot",
      collection: "saved",
      sort: "newest",
      remoteOnly: true,
      visaSponsorship: true,
      minimumSalary: "100000",
    }),
    11,
  );
});

test("minimum employer-listed pay round-trips through the jobs URL", () => {
  const filters = {
    ...DEFAULT_BOARD_FILTERS,
    minimumSalary: "100000" as const,
  };
  assert.equal(
    serializeBoardFilters(filters).toString(),
    "min-salary=100000",
  );
  assert.equal(
    parseBoardFilters("?min-salary=100000").minimumSalary,
    "100000",
  );
  assert.equal(parseBoardFilters("?min-salary=unknown").minimumSalary, "any");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BOARD_FILTERS,
  boardUrl,
  parseBoardFilters,
  parseStoredBoardFilters,
  serializeBoardFilters,
} from "./boardFilterState";

test("URL filter state takes precedence over stored preferences", () => {
  const stored = JSON.stringify({
    ...DEFAULT_BOARD_FILTERS,
    remoteOnly: true,
    locationIds: ["denver-co"],
  });
  const parsed = parseBoardFilters(
    "?q=cloud&stages=interview,offer&terms=fall-2026,summer-2027&visa=1",
    stored,
  );

  assert.equal(parsed.query, "cloud");
  assert.equal(parsed.remoteOnly, false);
  assert.deepEqual(parsed.locationIds, []);
  assert.deepEqual(parsed.stages, ["offer", "interview"]);
  assert.deepEqual(parsed.termKeys, ["fall-2026", "summer-2027"]);
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
  assert.equal(parsed.sort, "newest");
  assert.equal(parsed.major, "all");
  assert.deepEqual(parsed.stages, ["offer"]);
});

test("serialization excludes defaults and preserves unrelated query parameters", () => {
  const filters = {
    ...DEFAULT_BOARD_FILTERS,
    tab: "new_grad" as const,
    locationIds: ["denver-co" as const],
    termKeys: ["fall-2026" as const, "not-listed" as const],
    remoteOnly: true,
    sort: "location" as const,
  };
  assert.equal(
    serializeBoardFilters(filters).toString(),
    "tab=new-grad&locations=denver-co&sort=location&remote=1",
  );
  assert.equal(
    boardUrl("/", "?utm_source=test&old=1", filters),
    "/?utm_source=test&old=1&tab=new-grad&locations=denver-co&sort=location&remote=1",
  );
});

test("internship term selections round-trip through shareable URLs", () => {
  const filters = {
    ...DEFAULT_BOARD_FILTERS,
    termKeys: ["fall-2026" as const, "summer-2027" as const],
  };
  const serialized = serializeBoardFilters(filters).toString();

  assert.equal(serialized, "terms=fall-2026%2Csummer-2027");
  assert.deepEqual(parseBoardFilters(`?${serialized}`).termKeys, [
    "fall-2026",
    "summer-2027",
  ]);
});

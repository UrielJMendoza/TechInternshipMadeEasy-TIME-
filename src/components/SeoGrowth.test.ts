import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("public growth routes and crawl controls are implemented from shared data", () => {
  const sitemap = source("../app/sitemap.ts");
  const robots = source("../app/robots.ts");
  const catalog = source("../lib/publicCatalog.ts");

  for (const route of [
    "/discover",
    "/discover/locations",
    "/discover/seasons",
    "/collections/campus",
    "/companies",
  ]) {
    assert.match(sitemap, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.match(sitemap, /snapshot\.loadError \|\| snapshot\.partialData/);
  assert.match(sitemap, /collection\.indexable/);
  assert.match(sitemap, /company\.indexable/);
  assert.match(sitemap, /isLegitimateActiveJob/);
  assert.match(robots, /disallow:\s*\["\/api\/"\]/);
  assert.match(robots, /sitemap:/);
  assert.match(catalog, /MIN_INDEXABLE_COLLECTION_COMPANIES/);
  assert.match(catalog, /MAX_INDEXABLE_COLLECTION_AGE_DAYS/);
});

test("private state is excluded from public shares and analytics is wired", () => {
  const board = source("./Board.tsx");
  const share = source("./ShareControls.tsx");
  const filters = source("../lib/boardFilterState.ts");
  const tracker = source("./Tracker.tsx");
  const savedSearch = source("./SavedSearchButton.tsx");

  assert.match(board, /publicBoardUrl/);
  assert.match(board, /kind="filter"/);
  assert.match(share, /navigator\.share/);
  assert.match(share, /clipboard/);
  assert.match(filters, /PRIVATE_BOARD_FILTER_QUERY_KEYS/);
  assert.match(filters, /collection:\s*DEFAULT_BOARD_FILTERS\.collection/);
  assert.match(filters, /stages:\s*\[\]/);
  assert.match(tracker, /trackTrackerRevisited/);
  assert.match(tracker, /trackStageChanged/);
  assert.match(savedSearch, /trackSearchSaved/);
  assert.match(savedSearch, /trackAlertEnabled/);
});

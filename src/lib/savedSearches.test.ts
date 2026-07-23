import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BOARD_FILTERS } from "./boardFilterState";
import {
  MAX_SAVED_SEARCHES,
  MAX_SAVED_SEARCH_STORAGE_LENGTH,
  MAX_SAVED_SEARCH_TOMBSTONES,
  SAVED_SEARCH_STORAGE_KEY,
  SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
  createSavedSearchRecord,
  generateSavedSearchId,
  mergeSavedSearchStates,
  parseSavedSearch,
  parseStoredSavedSearches,
  parseStoredSavedSearchTombstones,
  serializeSavedSearches,
  serializeSavedSearchTombstones,
  timestampAfter,
  type SavedSearch,
  type SavedSearchTombstone,
} from "./savedSearches";

const CREATED_AT = "2026-07-22T12:00:00.000Z";
const UPDATED_AT = "2026-07-22T13:00:00.000Z";

function savedSearch(
  id: string,
  overrides: Partial<SavedSearch> = {},
): SavedSearch {
  return {
    id,
    name: `Search ${id}`,
    filters: {
      ...DEFAULT_BOARD_FILTERS,
      query: "platform engineering",
      tab: "new_grad",
      locationIds: ["denver-co"],
      remoteOnly: false,
      visaSponsorship: true,
      minimumSalary: "100000",
    },
    frequency: "daily",
    channels: {
      inApp: true,
      browser: false,
      email: false,
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

test("uses distinct versioned keys for records and deletion tombstones", () => {
  assert.equal(SAVED_SEARCH_STORAGE_KEY, "timley:saved-searches:v1");
  assert.equal(
    SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
    "timley:saved-searches:tombstones:v1",
  );
});

test("saved searches round-trip a complete canonical BoardFilters snapshot", () => {
  const original = savedSearch("round-trip", {
    filters: {
      ...DEFAULT_BOARD_FILTERS,
      tab: "new_grad",
      query: "security engineer",
      major: "computer-science",
      niche: "cybersecurity",
      locationIds: ["denver-co", "new-york-ny"],
      locationOrder: "alphabetical",
      freshness: "new",
      collection: "saved",
      sort: "salary",
      stages: ["assessment", "interview"],
      remoteOnly: false,
      visaSponsorship: true,
      minimumSalary: "120000",
    },
    frequency: "instant",
    channels: { inApp: true, browser: true, email: false },
  });

  const parsed = parseStoredSavedSearches(
    serializeSavedSearches([original]),
  );
  assert.deepEqual(parsed, [original]);
  assert.equal(parsed[0].filters.minimumSalary, "120000");
});

test("strict parsing rejects malformed identity, fields, and chronology", () => {
  const valid = savedSearch("valid");
  assert.equal(parseSavedSearch({ ...valid, id: "__proto__" }), null);
  assert.equal(parseSavedSearch({ ...valid, name: "bad\u0000name" }), null);
  assert.equal(
    parseSavedSearch({
      ...valid,
      frequency: "hourly",
    }),
    null,
  );
  assert.equal(
    parseSavedSearch({
      ...valid,
      channels: { inApp: true, browser: false },
    }),
    null,
  );
  assert.equal(
    parseSavedSearch({
      ...valid,
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    }),
    null,
  );
  assert.equal(parseSavedSearch({ ...valid, filters: null }), null);
});

test("BoardFilters validation sanitizes untrusted stored snapshots", () => {
  const raw = JSON.stringify({
    version: 1,
    searches: [
      {
        ...savedSearch("sanitized"),
        filters: {
          ...DEFAULT_BOARD_FILTERS,
          query: "x".repeat(300),
          stages: ["oa", "bogus"],
          minimumSalary: "not-a-band",
        },
      },
    ],
  });
  const [parsed] = parseStoredSavedSearches(raw);
  assert.equal(parsed.filters.query.length, 200);
  assert.deepEqual(parsed.filters.stages, ["assessment"]);
  assert.equal(parsed.filters.minimumSalary, "any");
});

test("corrupt, unsupported, and oversized storage is safely empty", () => {
  assert.deepEqual(parseStoredSavedSearches("not-json"), []);
  assert.deepEqual(
    parseStoredSavedSearches(
      JSON.stringify({ version: 2, searches: [savedSearch("ignored")] }),
    ),
    [],
  );
  assert.deepEqual(
    parseStoredSavedSearches(
      " ".repeat(MAX_SAVED_SEARCH_STORAGE_LENGTH + 1),
    ),
    [],
  );
});

test("parsing caps record and tombstone counts to bounded newest sets", () => {
  const searches = Array.from(
    { length: MAX_SAVED_SEARCHES + 12 },
    (_, index) => {
      const timestamp = new Date(
        Date.parse(CREATED_AT) + index * 1_000,
      ).toISOString();
      return savedSearch(`search-${index}`, {
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
  );
  const tombstones: SavedSearchTombstone[] = Array.from(
    { length: MAX_SAVED_SEARCH_TOMBSTONES + 12 },
    (_, index) => ({
      id: `deleted-${index}`,
      deletedAt: new Date(
        Date.parse(CREATED_AT) + index * 1_000,
      ).toISOString(),
    }),
  );

  const parsedSearches = parseStoredSavedSearches(JSON.stringify(searches));
  const parsedTombstones = parseStoredSavedSearchTombstones(
    JSON.stringify(tombstones),
  );
  assert.equal(parsedSearches.length, MAX_SAVED_SEARCHES);
  assert.equal(parsedTombstones.length, MAX_SAVED_SEARCH_TOMBSTONES);
  assert.equal(parsedSearches[0].id, `search-${searches.length - 1}`);
  assert.equal(
    parsedTombstones[0].id,
    `deleted-${tombstones.length - 1}`,
  );
});

test("newest updatedAt wins for duplicate saved-search IDs", () => {
  const old = savedSearch("same", {
    name: "Old name",
    updatedAt: "2026-07-22T13:00:00.000Z",
  });
  const current = savedSearch("same", {
    name: "Current name",
    updatedAt: "2026-07-22T14:00:00.000Z",
  });
  const merged = mergeSavedSearchStates(
    { searches: [old], tombstones: [] },
    { searches: [current], tombstones: [] },
  );
  assert.equal(merged.searches.length, 1);
  assert.equal(merged.searches[0].name, "Current name");
});

test("newer and equal tombstones prevent stale search resurrection", () => {
  const search = savedSearch("deleted", {
    updatedAt: "2026-07-22T14:00:00.000Z",
  });
  const older: SavedSearchTombstone = {
    id: search.id,
    deletedAt: "2026-07-22T13:59:59.000Z",
  };
  const equal: SavedSearchTombstone = {
    id: search.id,
    deletedAt: search.updatedAt,
  };
  const newer: SavedSearchTombstone = {
    id: search.id,
    deletedAt: "2026-07-22T14:00:01.000Z",
  };

  assert.equal(
    mergeSavedSearchStates({
      searches: [search],
      tombstones: [older],
    }).searches.length,
    1,
  );
  assert.equal(
    mergeSavedSearchStates({
      searches: [search],
      tombstones: [equal],
    }).searches.length,
    0,
  );
  assert.equal(
    mergeSavedSearchStates({
      searches: [search],
      tombstones: [newer],
    }).searches.length,
    0,
  );
});

test("a genuinely newer record can supersede an older tombstone", () => {
  const tombstone: SavedSearchTombstone = {
    id: "restored",
    deletedAt: "2026-07-22T14:00:00.000Z",
  };
  const restored = savedSearch("restored", {
    updatedAt: "2026-07-22T14:00:00.001Z",
  });
  const merged = mergeSavedSearchStates({
    searches: [restored],
    tombstones: [tombstone],
  });
  assert.deepEqual(merged.searches, [restored]);
  assert.deepEqual(merged.tombstones, [tombstone]);
});

test("tombstone serialization keeps only the newest marker per ID", () => {
  const raw = serializeSavedSearchTombstones([
    { id: "one", deletedAt: "2026-07-22T13:00:00.000Z" },
    { id: "one", deletedAt: "2026-07-22T14:00:00.000Z" },
  ]);
  assert.deepEqual(parseStoredSavedSearchTombstones(raw), [
    { id: "one", deletedAt: "2026-07-22T14:00:00.000Z" },
  ]);
});

test("record creation defaults to local in-app delivery and a stable ID", () => {
  const created = createSavedSearchRecord(
    {
      name: "  Denver roles  ",
      filters: DEFAULT_BOARD_FILTERS,
    },
    {
      id: "fixed-id",
      now: CREATED_AT,
    },
  );
  assert.ok(created);
  assert.equal(created.id, "fixed-id");
  assert.equal(created.name, "Denver roles");
  assert.equal(created.frequency, "daily");
  assert.deepEqual(created.channels, {
    inApp: true,
    browser: false,
    email: false,
  });
  assert.equal(created.createdAt, CREATED_AT);
  assert.equal(created.updatedAt, CREATED_AT);
});

test("generated IDs are safe and distinct and mutation timestamps advance", () => {
  const ids = new Set(Array.from({ length: 20 }, generateSavedSearchId));
  assert.equal(ids.size, 20);
  for (const id of ids) {
    assert.match(id, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
  }
  assert.ok(Date.parse(timestampAfter(UPDATED_AT)) > Date.parse(UPDATED_AT));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_STORAGE_KEY,
  LEGACY_SAVED_STORAGE_KEY,
  type ApplicationRecord,
} from "./applicationTracking";
import {
  BOARD_FILTER_STORAGE_KEY,
  DEFAULT_BOARD_FILTERS,
} from "./boardFilterState";
import {
  APPLICATION_TOMBSTONE_STORAGE_KEY,
  BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
  CONTINUITY_SNAPSHOT_FORMAT,
  CONTINUITY_SNAPSHOT_VERSION,
  DEFAULT_SYNC_SELECTION,
  SAVED_JOB_TOMBSTONE_STORAGE_KEY,
  SAVED_JOB_UPDATED_AT_STORAGE_KEY,
  captureContinuitySnapshot,
  commitContinuitySnapshotToStorage,
  parseContinuityRecovery,
  parseContinuitySnapshot,
  prepareContinuitySync,
  serializeContinuityRecovery,
  serializeContinuitySnapshot,
  summarizeContinuitySnapshot,
  type ContinuitySnapshot,
  type ContinuitySnapshotCategories,
  type ContinuityStorageWriter,
  type SyncSelection,
} from "./continuitySnapshot";
import {
  SAVED_SEARCH_STORAGE_KEY,
  SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
  serializeSavedSearches,
  serializeSavedSearchTombstones,
  type SavedSearch,
  type SavedSearchTombstone,
} from "./savedSearches";

const LOCAL_TIME = "2026-07-22T12:00:00.000Z";
const REMOTE_TIME = "2026-07-22T13:00:00.000Z";
const MERGE_TIME = "2026-07-22T14:00:00.000Z";

class MemoryStorage implements ContinuityStorageWriter {
  readonly reads: string[] = [];
  readonly writes: Array<[string, string]> = [];

  constructor(private readonly values = new Map<string, string>()) {}

  getItem(key: string): string | null {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push([key, value]);
    this.values.set(key, value);
  }

  value(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

function application(
  updatedAt: string,
  overrides: Partial<ApplicationRecord> = {},
): ApplicationRecord {
  return {
    stage: "applied",
    updatedAt,
    jobTitle: "Software Engineer Intern",
    company: "Example Labs",
    ...overrides,
  };
}

function savedSearch(
  id: string,
  updatedAt = LOCAL_TIME,
): SavedSearch {
  return {
    id,
    name: `Search ${id}`,
    filters: {
      ...DEFAULT_BOARD_FILTERS,
      query: "platform engineering",
    },
    frequency: "daily",
    channels: { inApp: true, browser: false, email: false },
    createdAt: LOCAL_TIME,
    updatedAt,
  };
}

function snapshot(
  capturedAt: string,
  categories: ContinuitySnapshot["categories"],
): ContinuitySnapshot {
  return {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt,
    categories,
  };
}

function savedJobs(
  urls: string[],
  updatedAt = LOCAL_TIME,
): NonNullable<ContinuitySnapshotCategories["savedJobs"]> {
  return {
    urls,
    updatedAt: Object.fromEntries(
      urls.map((url) => [url, updatedAt]),
    ),
    tombstones: {},
  };
}

function applications(
  records: Record<string, ApplicationRecord>,
): NonNullable<ContinuitySnapshotCategories["applications"]> {
  return { records, tombstones: {} };
}

const SELECT_ALL: SyncSelection = {
  savedJobs: true,
  applications: true,
  filters: true,
  savedSearches: true,
};

test("applications are opt-in and unselected private storage is not read", () => {
  const storage = new MemoryStorage(
    new Map([
      [LEGACY_SAVED_STORAGE_KEY, JSON.stringify(["https://jobs.test/1"])],
      [
        APPLICATION_STORAGE_KEY,
        JSON.stringify({
          "manual:private": application(LOCAL_TIME, {
            notes: "Private interview notes",
            contact: "A recruiter",
          }),
        }),
      ],
      [BOARD_FILTER_STORAGE_KEY, JSON.stringify(DEFAULT_BOARD_FILTERS)],
      [BOARD_FILTER_UPDATED_AT_STORAGE_KEY, LOCAL_TIME],
    ]),
  );

  assert.equal(DEFAULT_SYNC_SELECTION.applications, false);
  const captured = captureContinuitySnapshot(
    storage,
    { ...DEFAULT_SYNC_SELECTION },
    MERGE_TIME,
  );
  assert.equal(storage.reads.includes(APPLICATION_STORAGE_KEY), false);
  assert.equal(
    storage.reads.includes(APPLICATION_TOMBSTONE_STORAGE_KEY),
    false,
  );
  assert.equal(
    Object.hasOwn(captured.categories, "applications"),
    false,
  );
  assert.deepEqual(captured.categories.savedJobs?.urls, [
    "https://jobs.test/1",
  ]);
  assert.equal(
    summarizeContinuitySnapshot(captured)
      .containsSensitiveApplicationData,
    false,
  );
});

test("explicit application capture summarizes sensitive fields without exposing values", () => {
  const storage = new MemoryStorage(
    new Map([
      [
        APPLICATION_STORAGE_KEY,
        JSON.stringify({
          "manual:stable-id": application(LOCAL_TIME, {
            notes: "Private notes",
            contact: "alex@example.com",
            compensationNotes: "$45/hour",
          }),
          "https://jobs.test/2": application(REMOTE_TIME),
        }),
      ],
    ]),
  );
  const captured = captureContinuitySnapshot(
    storage,
    {
      savedJobs: false,
      applications: true,
      filters: false,
      savedSearches: false,
    },
    MERGE_TIME,
  );
  const summary = summarizeContinuitySnapshot(captured);

  assert.deepEqual(
    Object.keys(captured.categories.applications?.records ?? {}),
    ["https://jobs.test/2", "manual:stable-id"],
  );
  assert.equal(summary.applicationCount, 2);
  assert.equal(summary.applicationsWithNotes, 1);
  assert.equal(summary.applicationsWithContacts, 1);
  assert.equal(summary.applicationsWithCompensationNotes, 1);
  assert.equal(summary.applicationsWithSensitiveFields, 1);
  assert.equal(summary.containsSensitiveApplicationData, true);
  assert.equal(JSON.stringify(summary).includes("Private notes"), false);
  assert.equal(JSON.stringify(summary).includes("alex@example.com"), false);
});

test("selected categories merge conservatively while preserving stable application keys", () => {
  const localSearch = savedSearch("keep-search", REMOTE_TIME);
  const deletedSearch = savedSearch("deleted-search", LOCAL_TIME);
  const tombstone: SavedSearchTombstone = {
    id: deletedSearch.id,
    deletedAt: REMOTE_TIME,
  };
  const local = snapshot(LOCAL_TIME, {
    savedJobs: savedJobs(
      ["https://jobs.test/local"],
      REMOTE_TIME,
    ),
    applications: applications({
      "manual:stable-local": application(REMOTE_TIME, {
        company: "Local winner",
      }),
      "https://jobs.test/remote-newer": application(LOCAL_TIME, {
        company: "Local older",
      }),
    }),
    filters: {
      filters: { ...DEFAULT_BOARD_FILTERS, query: "local filter" },
      updatedAt: REMOTE_TIME,
    },
    savedSearches: {
      searches: [localSearch, deletedSearch],
      tombstones: [],
    },
  });
  const remote = snapshot(REMOTE_TIME, {
    savedJobs: savedJobs(
      ["https://jobs.test/remote"],
      REMOTE_TIME,
    ),
    applications: applications({
      "manual:stable-local": application(LOCAL_TIME, {
        company: "Remote older",
      }),
      "https://jobs.test/remote-newer": application(REMOTE_TIME, {
        company: "Remote winner",
      }),
    }),
    filters: {
      filters: { ...DEFAULT_BOARD_FILTERS, query: "remote tie" },
      updatedAt: REMOTE_TIME,
    },
    savedSearches: {
      searches: [deletedSearch],
      tombstones: [tombstone],
    },
  });
  const localBefore = structuredClone(local);
  const remoteBefore = structuredClone(remote);
  const result = prepareContinuitySync(
    local,
    remote,
    SELECT_ALL,
    MERGE_TIME,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.plan.mergedLocal.categories.savedJobs?.urls, [
    "https://jobs.test/local",
    "https://jobs.test/remote",
  ]);
  assert.equal(
    result.plan.mergedLocal.categories.applications?.records[
      "manual:stable-local"
    ].company,
    "Local winner",
  );
  assert.equal(
    result.plan.mergedLocal.categories.applications?.records[
      "https://jobs.test/remote-newer"
    ].company,
    "Remote winner",
  );
  assert.equal(
    result.plan.mergedLocal.categories.filters?.filters.query,
    "local filter",
  );
  assert.deepEqual(
    result.plan.mergedLocal.categories.savedSearches?.searches.map(
      ({ id }) => id,
    ),
    ["keep-search"],
  );
  assert.deepEqual(local, localBefore);
  assert.deepEqual(remote, remoteBefore);
});

test("non-selected categories remain on their original side and local private data is not uploaded", () => {
  const local = snapshot(LOCAL_TIME, {
    savedJobs: savedJobs(["https://jobs.test/local"]),
    applications: applications({
      "manual:local-private": application(LOCAL_TIME, {
        notes: "Never upload this selection",
      }),
    }),
    filters: {
      filters: { ...DEFAULT_BOARD_FILTERS, query: "local only" },
      updatedAt: LOCAL_TIME,
    },
  });
  const remote = snapshot(REMOTE_TIME, {
    savedJobs: savedJobs(
      ["https://jobs.test/remote"],
      REMOTE_TIME,
    ),
    applications: applications({
      "manual:remote-existing": application(REMOTE_TIME, {
        notes: "Already remote",
      }),
    }),
    filters: {
      filters: { ...DEFAULT_BOARD_FILTERS, query: "remote only" },
      updatedAt: REMOTE_TIME,
    },
  });
  const selection: SyncSelection = {
    savedJobs: true,
    applications: false,
    filters: false,
    savedSearches: false,
  };
  const result = prepareContinuitySync(
    local,
    remote,
    selection,
    MERGE_TIME,
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.plan.mergedLocal.categories.applications,
    local.categories.applications,
  );
  assert.equal(
    Object.hasOwn(result.plan.upload.categories, "applications"),
    false,
  );
  assert.deepEqual(
    result.plan.mergedLocal.categories.filters,
    local.categories.filters,
  );
  assert.equal(
    Object.hasOwn(result.plan.upload.categories, "filters"),
    false,
  );
});

test("strict snapshot parsing round-trips valid stable IDs and rejects malformed remote data", () => {
  const valid = snapshot(LOCAL_TIME, {
    savedJobs: savedJobs(["https://jobs.test/1"]),
    applications: applications({
      "manual:stable-id": application(LOCAL_TIME),
    }),
    filters: {
      filters: { ...DEFAULT_BOARD_FILTERS, query: "security" },
      updatedAt: LOCAL_TIME,
    },
    savedSearches: {
      searches: [savedSearch("stable-search-id")],
      tombstones: [],
    },
  });
  const parsed = parseContinuitySnapshot(
    serializeContinuitySnapshot(valid),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(
      Object.hasOwn(
        parsed.snapshot.categories.applications?.records ?? {},
        "manual:stable-id",
      ),
      true,
    );
    assert.equal(
      parsed.snapshot.categories.savedSearches?.searches[0].id,
      "stable-search-id",
    );
  }

  assert.equal(parseContinuitySnapshot("{not json").ok, false);
  assert.equal(
    parseContinuitySnapshot({
      ...valid,
      version: 99,
    }).ok,
    false,
  );
  assert.equal(
    parseContinuitySnapshot(
      {
        ...snapshot(LOCAL_TIME, {}),
        categories: {
        applications: {
          ["__proto__"]: application(LOCAL_TIME),
        },
        },
      },
    ).ok,
    false,
  );
  assert.equal(
    parseContinuitySnapshot(
      {
        ...snapshot(LOCAL_TIME, {}),
        categories: {
        savedJobs: ["javascript:alert(1)"],
        },
      },
    ).ok,
    false,
  );
  assert.equal(
    parseContinuitySnapshot(
      snapshot(LOCAL_TIME, {
        filters: {
          filters: {
            ...DEFAULT_BOARD_FILTERS,
            stages: ["invented"] as never,
          },
          updatedAt: LOCAL_TIME,
        },
      }),
    ).ok,
    false,
  );
});

test("legacy snapshots migrate existing saved jobs and applications without changing stable ids", () => {
  const parsed = parseContinuitySnapshot({
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt: LOCAL_TIME,
    categories: {
      savedJobs: ["https://jobs.test/legacy"],
      applications: {
        "manual:legacy-stable": application(LOCAL_TIME),
      },
    },
  });

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.snapshot.categories.savedJobs, {
    urls: ["https://jobs.test/legacy"],
    updatedAt: {
      "https://jobs.test/legacy": LOCAL_TIME,
    },
    tombstones: {},
  });
  assert.equal(
    Object.hasOwn(
      parsed.snapshot.categories.applications?.records ?? {},
      "manual:legacy-stable",
    ),
    true,
  );
});

test("application and saved-job tombstones prevent stale resurrection while newer undo wins", () => {
  const jobUrl = "https://jobs.test/deleted";
  const jobKey = "manual:deleted";
  const deleted = snapshot(REMOTE_TIME, {
    savedJobs: {
      urls: [jobUrl],
      updatedAt: { [jobUrl]: LOCAL_TIME },
      tombstones: { [jobUrl]: REMOTE_TIME },
    },
    applications: {
      records: { [jobKey]: application(LOCAL_TIME) },
      tombstones: { [jobKey]: REMOTE_TIME },
    },
  });
  const staleRemote = snapshot(LOCAL_TIME, {
    savedJobs: savedJobs([jobUrl], LOCAL_TIME),
    applications: applications({
      [jobKey]: application(LOCAL_TIME),
    }),
  });
  const deletedResult = prepareContinuitySync(
    deleted,
    staleRemote,
    SELECT_ALL,
    MERGE_TIME,
  );
  assert.equal(deletedResult.ok, true);
  if (!deletedResult.ok) return;
  assert.deepEqual(
    deletedResult.plan.mergedLocal.categories.savedJobs?.urls,
    [],
  );
  assert.equal(
    Object.hasOwn(
      deletedResult.plan.mergedLocal.categories.applications
        ?.records ?? {},
      jobKey,
    ),
    false,
  );

  const restored = snapshot(MERGE_TIME, {
    savedJobs: {
      urls: [jobUrl],
      updatedAt: { [jobUrl]: MERGE_TIME },
      tombstones: { [jobUrl]: REMOTE_TIME },
    },
    applications: {
      records: { [jobKey]: application(MERGE_TIME) },
      tombstones: { [jobKey]: REMOTE_TIME },
    },
  });
  const restoredResult = prepareContinuitySync(
    restored,
    deleted,
    SELECT_ALL,
    "2026-07-22T15:00:00.000Z",
  );
  assert.equal(restoredResult.ok, true);
  if (!restoredResult.ok) return;
  assert.deepEqual(
    restoredResult.plan.mergedLocal.categories.savedJobs?.urls,
    [jobUrl],
  );
  assert.equal(
    Object.hasOwn(
      restoredResult.plan.mergedLocal.categories.applications
        ?.records ?? {},
      jobKey,
    ),
    true,
  );
});

test("a fresh browser keeps missing filters absent so remote filters restore", () => {
  const freshStorage = new MemoryStorage();
  const local = captureContinuitySnapshot(
    freshStorage,
    {
      savedJobs: false,
      applications: false,
      filters: true,
      savedSearches: false,
    },
    MERGE_TIME,
  );
  assert.equal(Object.hasOwn(local.categories, "filters"), false);
  assert.equal(
    freshStorage.reads.includes(
      BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
    ),
    false,
  );

  const remote = snapshot(REMOTE_TIME, {
    filters: {
      filters: {
        ...DEFAULT_BOARD_FILTERS,
        query: "restore this remote filter",
      },
      updatedAt: REMOTE_TIME,
    },
  });
  const selection = {
    savedJobs: false,
    applications: false,
    filters: true,
    savedSearches: false,
  };
  const prepared = prepareContinuitySync(
    local,
    remote,
    selection,
    MERGE_TIME,
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(
    prepared.plan.mergedLocal.categories.filters?.filters.query,
    "restore this remote filter",
  );
  assert.equal(
    commitContinuitySnapshotToStorage(
      freshStorage,
      prepared.plan.mergedLocal,
      selection,
    ).ok,
    true,
  );
  assert.equal(
    JSON.parse(
      freshStorage.value(BOARD_FILTER_STORAGE_KEY) ?? "{}",
    ).query,
    "restore this remote filter",
  );
});

test("an untimestamped hook-created default blob stays non-authoritative", () => {
  const hookCreatedStorage = new MemoryStorage(
    new Map([
      [
        BOARD_FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_BOARD_FILTERS),
      ],
    ]),
  );
  const selection = {
    savedJobs: false,
    applications: false,
    filters: true,
    savedSearches: false,
  };
  const local = captureContinuitySnapshot(
    hookCreatedStorage,
    selection,
    MERGE_TIME,
  );
  assert.equal(Object.hasOwn(local.categories, "filters"), false);
  assert.equal(
    hookCreatedStorage.reads.includes(
      BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
    ),
    true,
  );

  const olderRemote = snapshot(REMOTE_TIME, {
    filters: {
      filters: {
        ...DEFAULT_BOARD_FILTERS,
        query: "older remote custom filters",
      },
      updatedAt: REMOTE_TIME,
    },
  });
  const prepared = prepareContinuitySync(
    local,
    olderRemote,
    selection,
    MERGE_TIME,
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(
    prepared.plan.mergedLocal.categories.filters?.filters.query,
    "older remote custom filters",
  );
});

test("a timestamped intentional reset to default remains authoritative", () => {
  const intentionalResetStorage = new MemoryStorage(
    new Map([
      [
        BOARD_FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_BOARD_FILTERS),
      ],
      [BOARD_FILTER_UPDATED_AT_STORAGE_KEY, MERGE_TIME],
    ]),
  );
  const selection = {
    savedJobs: false,
    applications: false,
    filters: true,
    savedSearches: false,
  };
  const local = captureContinuitySnapshot(
    intentionalResetStorage,
    selection,
    "2026-07-22T15:00:00.000Z",
  );
  assert.equal(Object.hasOwn(local.categories, "filters"), true);

  const olderRemote = snapshot(REMOTE_TIME, {
    filters: {
      filters: {
        ...DEFAULT_BOARD_FILTERS,
        query: "older remote custom filters",
      },
      updatedAt: REMOTE_TIME,
    },
  });
  const prepared = prepareContinuitySync(
    local,
    olderRemote,
    selection,
    "2026-07-22T15:00:00.000Z",
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(
    prepared.plan.mergedLocal.categories.filters?.filters,
    DEFAULT_BOARD_FILTERS,
  );
});

test("recovery data round-trips the exact pre-sync and intended local snapshots", () => {
  const local = snapshot(LOCAL_TIME, {
    savedJobs: savedJobs(["https://jobs.test/local"]),
    applications: applications({
      "manual:recover": application(LOCAL_TIME, {
        notes: "Recover me",
      }),
    }),
  });
  const remote = snapshot(REMOTE_TIME, {
    savedJobs: savedJobs(
      ["https://jobs.test/remote"],
      REMOTE_TIME,
    ),
    applications: applications({}),
  });
  const result = prepareContinuitySync(
    local,
    remote,
    SELECT_ALL,
    MERGE_TIME,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = parseContinuityRecovery(
    serializeContinuityRecovery(result.plan.recovery),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.recovery.localBefore, result.plan.localBefore);
  assert.deepEqual(
    parsed.recovery.intendedMerged,
    result.plan.mergedLocal,
  );
  assert.deepEqual(parsed.recovery.selection, SELECT_ALL);
  assert.equal(
    parseContinuityRecovery({
      ...parsed.recovery,
      version: 999,
    }).ok,
    false,
  );
});

test("local writes touch selected merged categories only", () => {
  const originalApplications = JSON.stringify({
    "manual:keep-local": application(LOCAL_TIME),
  });
  const originalFilters = JSON.stringify({
    ...DEFAULT_BOARD_FILTERS,
    query: "leave untouched",
  });
  const storage = new MemoryStorage(
    new Map([
      [APPLICATION_STORAGE_KEY, originalApplications],
      [BOARD_FILTER_STORAGE_KEY, originalFilters],
      [BOARD_FILTER_UPDATED_AT_STORAGE_KEY, LOCAL_TIME],
    ]),
  );
  const merged = snapshot(MERGE_TIME, {
    savedJobs: savedJobs(
      ["https://jobs.test/merged"],
      MERGE_TIME,
    ),
    applications: applications({
      "manual:remote": application(REMOTE_TIME),
    }),
    filters: {
      filters: { ...DEFAULT_BOARD_FILTERS, query: "do not write" },
      updatedAt: REMOTE_TIME,
    },
    savedSearches: {
      searches: [savedSearch("merged-search")],
      tombstones: [],
    },
  });
  const result = commitContinuitySnapshotToStorage(storage, merged, {
    savedJobs: true,
    applications: false,
    filters: false,
    savedSearches: true,
  });

  assert.deepEqual(result, {
    ok: true,
    written: ["savedJobs", "savedSearches"],
  });
  assert.equal(storage.value(APPLICATION_STORAGE_KEY), originalApplications);
  assert.equal(storage.value(BOARD_FILTER_STORAGE_KEY), originalFilters);
  assert.equal(
    storage.value(BOARD_FILTER_UPDATED_AT_STORAGE_KEY),
    LOCAL_TIME,
  );
  assert.deepEqual(
    JSON.parse(storage.value(LEGACY_SAVED_STORAGE_KEY) ?? "[]"),
    ["https://jobs.test/merged"],
  );
  assert.equal(
    storage.writes.some(([key]) => key === APPLICATION_STORAGE_KEY),
    false,
  );
  assert.equal(
    storage.writes.some(([key]) => key === BOARD_FILTER_STORAGE_KEY),
    false,
  );
  assert.equal(
    storage.writes[0][0],
    SAVED_JOB_TOMBSTONE_STORAGE_KEY,
  );
  assert.equal(
    storage.writes[1][0],
    SAVED_JOB_UPDATED_AT_STORAGE_KEY,
  );
  assert.equal(storage.writes[2][0], LEGACY_SAVED_STORAGE_KEY);
  assert.equal(
    storage.writes[3][0],
    SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
  );
  assert.equal(storage.writes[4][0], SAVED_SEARCH_STORAGE_KEY);
});

test("capture and commit preserve the existing saved-search storage envelopes", () => {
  const search = savedSearch("round-trip-search");
  const tombstone: SavedSearchTombstone = {
    id: "old-deleted-search",
    deletedAt: REMOTE_TIME,
  };
  const storage = new MemoryStorage(
    new Map([
      [SAVED_SEARCH_STORAGE_KEY, serializeSavedSearches([search])],
      [
        SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
        serializeSavedSearchTombstones([tombstone]),
      ],
    ]),
  );
  const captured = captureContinuitySnapshot(
    storage,
    {
      savedJobs: false,
      applications: false,
      filters: false,
      savedSearches: true,
    },
    MERGE_TIME,
  );
  const committed = commitContinuitySnapshotToStorage(
    storage,
    captured,
    {
      savedJobs: false,
      applications: false,
      filters: false,
      savedSearches: true,
    },
  );

  assert.equal(committed.ok, true);
  assert.deepEqual(
    captured.categories.savedSearches?.searches.map(({ id }) => id),
    ["round-trip-search"],
  );
  assert.deepEqual(
    captured.categories.savedSearches?.tombstones.map(({ id }) => id),
    ["old-deleted-search"],
  );
  assert.doesNotThrow(() =>
    JSON.parse(storage.value(SAVED_SEARCH_STORAGE_KEY) ?? ""),
  );
  assert.doesNotThrow(() =>
    JSON.parse(storage.value(SAVED_SEARCH_TOMBSTONE_STORAGE_KEY) ?? ""),
  );
});

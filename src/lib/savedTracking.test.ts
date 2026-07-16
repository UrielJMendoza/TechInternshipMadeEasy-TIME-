import assert from "node:assert/strict";
import test from "node:test";
import {
  SAVED_STORE_VERSION,
  createEmptySavedStore,
  mergeSavedStores,
  migrateSavedTracking,
  parseSavedStore,
  recoverUnmatchedSavedRecords,
  savedTrackingKeys,
  serializeSavedStore,
  setSavedState,
  toggleSavedState,
  unmatchedSavedKeys,
  type SavedStoreV2,
} from "./savedTracking";

const NOW = "2026-07-10T18:00:00.000Z";
const LATER = "2026-07-11T18:00:00.000Z";
const LATEST = "2026-07-12T18:00:00.000Z";
const OLD_URL = "https://jobs.example.test/old-apply-url";
const NEW_URL = "https://jobs.example.test/new-apply-url";
const UNKNOWN_URL = "https://unknown.example.test/apply";
const TRACKING_KEY = "job_immutable_123";

test("saved v2 migration maps legacy URLs and retains unmatched recovery entries", () => {
  const migration = migrateSavedTracking(
    null,
    JSON.stringify([OLD_URL, UNKNOWN_URL, OLD_URL]),
    { [OLD_URL]: TRACKING_KEY },
    NOW,
  );

  assert.equal(migration.source, "legacy");
  assert.equal(migration.shouldPersist, true);
  assert.equal(migration.migratedCount, 2);
  assert.deepEqual([...migration.saved], [TRACKING_KEY]);
  assert.deepEqual([...migration.unmatched], [UNKNOWN_URL]);
  assert.deepEqual(migration.store.records[TRACKING_KEY], {
    saved: true,
    updatedAt: NOW,
  });
  assert.equal(serializeSavedStore(migration.store).includes(OLD_URL), false);
});

test("saved state survives apply URL changes because consumers use the tracking key", () => {
  const migration = migrateSavedTracking(
    null,
    JSON.stringify([OLD_URL]),
    { [OLD_URL]: TRACKING_KEY, [NEW_URL]: TRACKING_KEY },
    NOW,
  );

  assert.equal(savedTrackingKeys(migration.store).has(TRACKING_KEY), true);
  assert.equal(savedTrackingKeys(migration.store).has(NEW_URL), false);
});

test("saved migration and later unmatched recovery are idempotent", () => {
  const initial = migrateSavedTracking(
    null,
    JSON.stringify([UNKNOWN_URL]),
    {},
    NOW,
  );
  const repeated = migrateSavedTracking(
    serializeSavedStore(initial.store),
    JSON.stringify([UNKNOWN_URL]),
    {},
    LATER,
  );
  assert.equal(repeated.source, "v2");
  assert.equal(repeated.shouldPersist, false);
  assert.deepEqual(repeated.store, initial.store);

  const recovered = recoverUnmatchedSavedRecords(initial.store, {
    [UNKNOWN_URL]: TRACKING_KEY,
  });
  assert.equal(recovered.recoveredCount, 1);
  assert.equal(savedTrackingKeys(recovered.store).has(TRACKING_KEY), true);
  assert.deepEqual([...unmatchedSavedKeys(recovered.store)], []);

  const recoveredAgain = recoverUnmatchedSavedRecords(recovered.store, {
    [UNKNOWN_URL]: TRACKING_KEY,
  });
  assert.equal(recoveredAgain.recoveredCount, 0);
  assert.equal(recoveredAgain.store, recovered.store);
});

test("a present corrupt saved v2 key is authoritative", () => {
  const result = migrateSavedTracking(
    "{bad-json",
    JSON.stringify([OLD_URL]),
    { [OLD_URL]: TRACKING_KEY },
    NOW,
  );

  assert.equal(result.source, "v2");
  assert.equal(result.shouldPersist, false);
  assert.deepEqual(result.store, createEmptySavedStore());
  assert.deepEqual(parseSavedStore("[]"), createEmptySavedStore());
});

test("saved toggles retain removal tombstones and monotonically advance timestamps", () => {
  const saved = toggleSavedState(createEmptySavedStore(), TRACKING_KEY, NOW);
  assert.equal(saved.records[TRACKING_KEY].saved, true);
  const removed = toggleSavedState(saved, TRACKING_KEY, NOW);
  assert.equal(removed.records[TRACKING_KEY].saved, false);
  assert.equal(removed.records[TRACKING_KEY].updatedAt, "2026-07-10T18:00:00.001Z");
  assert.equal(savedTrackingKeys(removed).has(TRACKING_KEY), false);
  assert.equal(setSavedState(removed, TRACKING_KEY, false, LATER), removed);
});

test("cross-tab saved merges preserve independent changes and newest removals", () => {
  const left = setSavedState(createEmptySavedStore(), "left-job", true, NOW);
  const right = setSavedState(createEmptySavedStore(), "right-job", true, LATER);
  const union = mergeSavedStores(left, right);
  assert.deepEqual([...savedTrackingKeys(union)].sort(), ["left-job", "right-job"]);

  const staleSave: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records: { [TRACKING_KEY]: { saved: true, updatedAt: NOW } },
    unmatched: {},
  };
  const newerRemoval: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records: { [TRACKING_KEY]: { saved: false, updatedAt: LATER } },
    unmatched: {},
  };
  assert.equal(
    mergeSavedStores(staleSave, newerRemoval).records[TRACKING_KEY].saved,
    false,
  );

  const newestSave: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records: { [TRACKING_KEY]: { saved: true, updatedAt: LATEST } },
    unmatched: {},
  };
  assert.equal(
    mergeSavedStores(newerRemoval, newestSave).records[TRACKING_KEY].saved,
    true,
  );
});

test("same-timestamp removal wins regardless of merge order", () => {
  const save: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records: { [TRACKING_KEY]: { saved: true, updatedAt: NOW } },
    unmatched: {},
  };
  const removal: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records: { [TRACKING_KEY]: { saved: false, updatedAt: NOW } },
    unmatched: {},
  };

  assert.equal(mergeSavedStores(save, removal).records[TRACKING_KEY].saved, false);
  assert.equal(mergeSavedStores(removal, save).records[TRACKING_KEY].saved, false);
});

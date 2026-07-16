import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_STORE_VERSION,
  createEmptyApplicationStore,
  getApplicationStage,
  mergeApplicationStores,
  migrateApplicationRecords,
  parseApplicationRecords,
  parseApplicationStore,
  recoverUnmatchedApplicationRecords,
  resetApplicationStage,
  serializeApplicationStore,
  setApplicationStage,
  setApplicationStoreStage,
  updateApplicationRecordDetails,
  type ApplicationRecords,
  type ApplicationStoreV3,
} from "./applicationTracking";

const NOW = "2026-07-10T18:00:00.000Z";
const LATER = "2026-07-11T18:00:00.000Z";
const LATEST = "2026-07-12T18:00:00.000Z";
const OLD_URL = "https://jobs.example.test/old-apply-url";
const NEW_URL = "https://jobs.example.test/new-apply-url";
const UNKNOWN_URL = "https://unknown.example.test/apply";
const TRACKING_KEY = "job_immutable_123";

test("v2 migration maps URLs to tracking keys and preserves recovery data and timestamps", () => {
  const result = migrateApplicationRecords(
    null,
    JSON.stringify({
      [OLD_URL]: {
        stage: "interview",
        updatedAt: LATER,
        appliedAt: NOW,
        notes: "Prepare systems examples",
        nextActionAt: LATEST,
        deadline: LATEST,
        recruiter: "Ada Recruiter",
        contact: "ada@example.test",
      },
      [UNKNOWN_URL]: {
        stage: "applied",
        updatedAt: NOW,
        appliedAt: NOW,
      },
    }),
    JSON.stringify(["https://ignored.example.test/legacy"]),
    { [OLD_URL]: TRACKING_KEY },
    LATEST,
  );

  assert.equal(result.source, "v2");
  assert.equal(result.shouldPersist, true);
  assert.equal(result.migratedCount, 2);
  assert.equal(result.unmatchedCount, 1);
  assert.deepEqual(result.records[TRACKING_KEY], {
    stage: "interview",
    updatedAt: LATER,
    appliedAt: NOW,
    notes: "Prepare systems examples",
    nextActionAt: LATEST,
    deadline: LATEST,
    recruiter: "Ada Recruiter",
    contact: "ada@example.test",
  });
  assert.equal(result.unmatched[UNKNOWN_URL]?.stage, "applied");
  assert.equal(Object.hasOwn(result.records, OLD_URL), false);
});

test("tracking state survives an apply URL change", () => {
  const migrated = migrateApplicationRecords(
    null,
    JSON.stringify({
      [OLD_URL]: { stage: "offer", updatedAt: LATER, appliedAt: NOW },
    }),
    null,
    { [OLD_URL]: TRACKING_KEY, [NEW_URL]: TRACKING_KEY },
    LATEST,
  );

  assert.equal(getApplicationStage(migrated.records, TRACKING_KEY), "offer");
  assert.equal(getApplicationStage(migrated.records, NEW_URL), "not_applied");
  assert.equal(serializeApplicationStore(migrated.store).includes(OLD_URL), false);
  assert.equal(serializeApplicationStore(migrated.store).includes(NEW_URL), false);
});

test("multiple historical URLs collapse deterministically without losing the first appliedAt", () => {
  const oldestApplied = "2026-07-08T18:00:00.000Z";
  const result = migrateApplicationRecords(
    null,
    JSON.stringify({
      [OLD_URL]: { stage: "interview", updatedAt: LATER, appliedAt: NOW },
      [NEW_URL]: {
        stage: "offer",
        updatedAt: LATEST,
        appliedAt: oldestApplied,
      },
    }),
    null,
    { [OLD_URL]: TRACKING_KEY, [NEW_URL]: TRACKING_KEY },
    LATEST,
  );

  assert.equal(result.migratedCount, 2);
  assert.deepEqual(result.records[TRACKING_KEY], {
    stage: "offer",
    updatedAt: LATEST,
    appliedAt: oldestApplied,
  });
});

test("legacy applied URLs migrate once and retain unmatched URLs", () => {
  const result = migrateApplicationRecords(
    null,
    null,
    JSON.stringify([OLD_URL, OLD_URL, UNKNOWN_URL]),
    { [OLD_URL]: TRACKING_KEY },
    NOW,
  );

  assert.equal(result.source, "legacy");
  assert.equal(result.migratedCount, 2);
  assert.deepEqual(result.records[TRACKING_KEY], {
    stage: "applied",
    updatedAt: NOW,
    appliedAt: NOW,
  });
  assert.deepEqual(result.unmatched[UNKNOWN_URL], {
    stage: "applied",
    updatedAt: NOW,
    appliedAt: NOW,
  });

  const repeated = migrateApplicationRecords(
    serializeApplicationStore(result.store),
    null,
    JSON.stringify([OLD_URL, UNKNOWN_URL]),
    { [OLD_URL]: TRACKING_KEY },
    LATEST,
  );
  assert.equal(repeated.source, "v3");
  assert.equal(repeated.shouldPersist, false);
  assert.equal(repeated.migratedCount, 0);
  assert.deepEqual(repeated.store, result.store);
});

test("unmatched v3 data is recoverable later and recovery is idempotent", () => {
  const initial = migrateApplicationRecords(
    null,
    JSON.stringify({
      [UNKNOWN_URL]: { stage: "oa", updatedAt: LATER, appliedAt: NOW },
    }),
    null,
    {},
    LATEST,
  );
  const recovery = recoverUnmatchedApplicationRecords(initial.store, {
    [UNKNOWN_URL]: TRACKING_KEY,
  });

  assert.equal(recovery.recoveredCount, 1);
  assert.equal(recovery.store.records[TRACKING_KEY]?.stage, "oa");
  assert.deepEqual(recovery.store.unmatched, {});
  const repeated = recoverUnmatchedApplicationRecords(recovery.store, {
    [UNKNOWN_URL]: TRACKING_KEY,
  });
  assert.equal(repeated.recoveredCount, 0);
  assert.equal(repeated.store, recovery.store);

  const throughMigration = migrateApplicationRecords(
    serializeApplicationStore(initial.store),
    null,
    null,
    { [UNKNOWN_URL]: TRACKING_KEY },
    LATEST,
  );
  assert.equal(throughMigration.shouldPersist, true);
  assert.equal(throughMigration.migratedCount, 1);
});

test("a present corrupt v3 envelope is authoritative and never restores old data", () => {
  const result = migrateApplicationRecords(
    "{not-json",
    JSON.stringify({
      [OLD_URL]: { stage: "applied", updatedAt: NOW },
    }),
    JSON.stringify([OLD_URL]),
    { [OLD_URL]: TRACKING_KEY },
    LATER,
  );

  assert.equal(result.source, "v3");
  assert.equal(result.shouldPersist, false);
  assert.deepEqual(result.records, {});
  assert.deepEqual(parseApplicationStore("{}"), createEmptyApplicationStore());
});

test("safe storage parser keeps valid fields and rejects unsafe or corrupt entries", () => {
  const records = parseApplicationRecords(
    `{
      "good":{"stage":"interview","updatedAt":"${NOW}","appliedAt":"${NOW}","notes":"Keep this","nextActionAt":"not-a-date"},
      "badStage":{"stage":"wishlist","updatedAt":"${NOW}"},
      "badDate":{"stage":"offer","updatedAt":"yesterday"},
      "reset":{"stage":"not_applied","updatedAt":"${NOW}"},
      "__proto__":{"stage":"offer","updatedAt":"${NOW}"}
    }`,
  );

  assert.deepEqual(records, {
    good: {
      stage: "interview",
      updatedAt: NOW,
      appliedAt: NOW,
      notes: "Keep this",
    },
  });
  assert.equal(({} as Record<string, unknown>).stage, undefined);
});

test("stage and detail helpers are immutable and preserve appliedAt", () => {
  const empty: ApplicationRecords = {};
  const applied = setApplicationStage(empty, TRACKING_KEY, "applied", NOW);
  const interview = setApplicationStage(applied, TRACKING_KEY, "interview", LATER);

  assert.deepEqual(empty, {});
  assert.equal(getApplicationStage(empty, TRACKING_KEY), "not_applied");
  assert.deepEqual(interview[TRACKING_KEY], {
    stage: "interview",
    updatedAt: LATER,
    appliedAt: NOW,
  });
  assert.equal(setApplicationStage(interview, TRACKING_KEY, "interview", LATEST), interview);

  const reset = resetApplicationStage(interview, TRACKING_KEY);
  assert.equal(getApplicationStage(reset, TRACKING_KEY), "not_applied");
  assert.equal(Object.hasOwn(interview, TRACKING_KEY), true);

  const store = setApplicationStoreStage(
    createEmptyApplicationStore(),
    TRACKING_KEY,
    "applied",
    NOW,
  );
  const detailed = updateApplicationRecordDetails(
    store,
    TRACKING_KEY,
    {
      notes: "Follow up after the assessment",
      nextActionAt: LATEST,
      deadline: LATEST,
      recruiter: "Grace",
      contact: "+1 555 0100",
    },
    LATER,
  );
  assert.equal(detailed.records[TRACKING_KEY].appliedAt, NOW);
  assert.equal(detailed.records[TRACKING_KEY].updatedAt, LATER);
  assert.equal(detailed.records[TRACKING_KEY].notes, "Follow up after the assessment");

  const cleared = updateApplicationRecordDetails(
    detailed,
    TRACKING_KEY,
    { notes: null, recruiter: "" },
    LATEST,
  );
  assert.equal(cleared.records[TRACKING_KEY].notes, undefined);
  assert.equal(cleared.records[TRACKING_KEY].recruiter, undefined);
  assert.equal(cleared.records[TRACKING_KEY].appliedAt, NOW);
});

test("cross-tab merge keeps independent records and honors deletion tombstones", () => {
  const left = setApplicationStoreStage(
    createEmptyApplicationStore(),
    "left-job",
    "applied",
    NOW,
  );
  const right = setApplicationStoreStage(
    createEmptyApplicationStore(),
    "right-job",
    "interview",
    LATER,
  );
  const union = mergeApplicationStores(left, right);
  assert.deepEqual(Object.keys(union.records).sort(), ["left-job", "right-job"]);

  const deleted = setApplicationStoreStage(
    left,
    "left-job",
    "not_applied",
    LATER,
  );
  const staleMerged = mergeApplicationStores(deleted, left);
  assert.equal(staleMerged.records["left-job"], undefined);
  assert.equal(staleMerged.tombstones["left-job"], LATER);

  const restored = setApplicationStoreStage(
    deleted,
    "left-job",
    "offer",
    LATEST,
  );
  const restoredMerged = mergeApplicationStores(restored, deleted);
  assert.equal(restoredMerged.records["left-job"]?.stage, "offer");
  assert.equal(restoredMerged.tombstones["left-job"], undefined);

  const withVeryStaleTab = mergeApplicationStores(restoredMerged, left);
  assert.equal(withVeryStaleTab.records["left-job"]?.appliedAt, LATEST);
});

test("same-key cross-tab updates choose the newest complete record", () => {
  const left: ApplicationStoreV3 = {
    version: APPLICATION_STORE_VERSION,
    records: {
      [TRACKING_KEY]: { stage: "interview", updatedAt: LATER, appliedAt: NOW },
    },
    unmatched: {},
    tombstones: {},
  };
  const right: ApplicationStoreV3 = {
    version: APPLICATION_STORE_VERSION,
    records: {
      [TRACKING_KEY]: {
        stage: "offer",
        updatedAt: LATEST,
        appliedAt: LATER,
      },
    },
    unmatched: {},
    tombstones: {},
  };

  assert.deepEqual(mergeApplicationStores(left, right).records[TRACKING_KEY], {
    stage: "offer",
    updatedAt: LATEST,
    appliedAt: LATER,
  });
  assert.deepEqual(
    mergeApplicationStores(left, right),
    mergeApplicationStores(right, left),
  );
});

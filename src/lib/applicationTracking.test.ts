import assert from "node:assert/strict";
import test from "node:test";
import {
  getApplicationStage,
  migrateApplicationRecords,
  parseApplicationRecords,
  resetApplicationStage,
  setApplicationStage,
  type ApplicationRecords,
} from "./applicationTracking";

const NOW = "2026-07-10T18:00:00.000Z";
const LATER = "2026-07-11T18:00:00.000Z";

test("migrates and deduplicates the legacy applied set", () => {
  const result = migrateApplicationRecords(
    null,
    JSON.stringify(["https://a.test/job", "https://a.test/job", "https://b.test/job"]),
    NOW,
  );

  assert.equal(result.source, "legacy");
  assert.equal(result.shouldPersist, true);
  assert.equal(result.migratedCount, 2);
  assert.deepEqual(result.records["https://a.test/job"], {
    stage: "applied",
    updatedAt: NOW,
    appliedAt: NOW,
  });
});

test("an existing empty v2 value is authoritative and never remigrates", () => {
  const result = migrateApplicationRecords(
    "{}",
    JSON.stringify(["https://legacy.test/job"]),
    NOW,
  );

  assert.equal(result.source, "v2");
  assert.equal(result.shouldPersist, false);
  assert.equal(result.migratedCount, 0);
  assert.deepEqual(result.records, {});
});

test("an existing corrupt v2 value fails safely without restoring legacy data", () => {
  const result = migrateApplicationRecords(
    "{not-json",
    JSON.stringify(["https://legacy.test/job"]),
    NOW,
  );

  assert.equal(result.source, "v2");
  assert.equal(result.shouldPersist, false);
  assert.deepEqual(result.records, {});
});

test("safe parser keeps valid records and drops corrupt entries", () => {
  const records = parseApplicationRecords(
    JSON.stringify({
      good: { stage: "interview", updatedAt: NOW, appliedAt: NOW },
      badStage: { stage: "wishlist", updatedAt: NOW },
      badDate: { stage: "offer", updatedAt: "yesterday" },
      reset: { stage: "not_applied", updatedAt: NOW },
    }),
  );

  assert.deepEqual(records, {
    good: { stage: "interview", updatedAt: NOW, appliedAt: NOW },
  });
});

test("stage helpers are immutable, preserve appliedAt, and reset by deletion", () => {
  const empty: ApplicationRecords = {};
  const applied = setApplicationStage(empty, "job", "applied", NOW);
  const interview = setApplicationStage(applied, "job", "interview", LATER);

  assert.deepEqual(empty, {});
  assert.equal(getApplicationStage(empty, "job"), "not_applied");
  assert.equal(getApplicationStage(interview, "job"), "interview");
  assert.deepEqual(interview.job, {
    stage: "interview",
    updatedAt: LATER,
    appliedAt: NOW,
  });

  const reset = resetApplicationStage(interview, "job");
  assert.equal(getApplicationStage(reset, "job"), "not_applied");
  assert.equal(Object.hasOwn(reset, "job"), false);
  assert.equal(Object.hasOwn(interview, "job"), true);
});

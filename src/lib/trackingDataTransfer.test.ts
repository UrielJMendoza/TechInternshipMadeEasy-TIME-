import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_STORE_VERSION,
  mergeApplicationStores,
  type ApplicationStoreV3,
} from "./applicationTracking";
import {
  exportApplicationTrackingCsv,
  exportApplicationTrackingJson,
} from "./applicationTrackingTransfer";
import {
  SAVED_STORE_VERSION,
  mergeSavedStores,
  type SavedStoreV2,
} from "./savedTracking";
import {
  TRACKING_DATA_EXPORT_FORMAT,
  TrackingDataImportError,
  exportTrackingDataCsv,
  exportTrackingDataJson,
  importTrackingDataCsv,
  importTrackingDataJson,
} from "./trackingDataTransfer";

const EARLIER = "2026-07-09T18:00:00.000Z";
const UPDATED = "2026-07-10T18:00:00.000Z";
const LEGACY_URL = "https://legacy.example.test/jobs/42";

const applications: ApplicationStoreV3 = {
  version: APPLICATION_STORE_VERSION,
  records: {
    "=job-formula-key": {
      stage: "interview",
      appliedAt: EARLIER,
      updatedAt: UPDATED,
      notes: "=2+2\nreview, then follow up",
      recruiter: "+Taylor",
    },
  },
  unmatched: {
    [LEGACY_URL]: {
      stage: "applied",
      appliedAt: EARLIER,
      updatedAt: UPDATED,
    },
  },
  tombstones: {},
};

const saved: SavedStoreV2 = {
  version: SAVED_STORE_VERSION,
  records: {
    "=job-formula-key": { saved: true, updatedAt: UPDATED },
    "removed-job": { saved: false, updatedAt: UPDATED },
  },
  unmatched: {
    [LEGACY_URL]: { saved: true, updatedAt: EARLIER },
    "https://legacy.example.test/removed": {
      saved: false,
      updatedAt: UPDATED,
    },
  },
};

test("combined JSON round-trips applications, saved tombstones, and unmatched recovery data", () => {
  const raw = exportTrackingDataJson({ applications, saved }, UPDATED);
  const imported = importTrackingDataJson(raw);

  assert.equal(imported.source, "tracking-data");
  assert.deepEqual(imported.applications.records, applications.records);
  assert.deepEqual(imported.applications.unmatched, applications.unmatched);
  assert.deepEqual(imported.saved, saved);
  assert.match(raw, new RegExp(`"format": "${TRACKING_DATA_EXPORT_FORMAT}"`));
  assert.match(raw, /"saved": false/);
});

test("combined CSV is spreadsheet-safe and round-trips both stores", () => {
  const raw = exportTrackingDataCsv({ applications, saved });

  assert.match(raw, /"'=job-formula-key"/);
  assert.match(raw, /"'=2\+2/);
  assert.match(raw, /"'\+Taylor"/);
  const imported = importTrackingDataCsv(raw);
  assert.equal(imported.source, "tracking-data");
  assert.deepEqual(imported.applications.records, applications.records);
  assert.deepEqual(imported.applications.unmatched, applications.unmatched);
  assert.deepEqual(imported.saved, saved);
});

test("legacy application-only JSON and CSV backups remain import-compatible", () => {
  const json = importTrackingDataJson(
    exportApplicationTrackingJson(applications, UPDATED),
  );
  const csv = importTrackingDataCsv(exportApplicationTrackingCsv(applications));

  for (const imported of [json, csv]) {
    assert.equal(imported.source, "application-only");
    assert.deepEqual(imported.applications.records, applications.records);
    assert.deepEqual(imported.applications.unmatched, applications.unmatched);
    assert.equal(imported.saved, null);
  }
});

test("imported stores merge idempotently and retain newer local saved removals", () => {
  const imported = importTrackingDataJson(
    exportTrackingDataJson({ applications, saved }, UPDATED),
  );
  assert.ok(imported.saved);
  const newerLocalSaved: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records: {
      "=job-formula-key": {
        saved: false,
        updatedAt: "2026-07-11T18:00:00.000Z",
      },
    },
    unmatched: {},
  };

  const applicationsOnce = mergeApplicationStores(
    applications,
    imported.applications,
  );
  const applicationsTwice = mergeApplicationStores(
    applicationsOnce,
    imported.applications,
  );
  const savedOnce = mergeSavedStores(newerLocalSaved, imported.saved);
  const savedTwice = mergeSavedStores(savedOnce, imported.saved);

  assert.deepEqual(applicationsTwice, applicationsOnce);
  assert.deepEqual(savedTwice, savedOnce);
  assert.equal(savedOnce.records["=job-formula-key"].saved, false);
});

test("combined JSON validation rejects unknown fields and invalid saved rows as a unit", () => {
  const valid = JSON.parse(
    exportTrackingDataJson({ applications, saved }, UPDATED),
  ) as Record<string, unknown>;
  assert.throws(
    () => importTrackingDataJson(JSON.stringify({ ...valid, extra: true })),
    TrackingDataImportError,
  );

  const badVersion = structuredClone(valid) as {
    saved: { version: number };
  };
  badVersion.saved.version = 1;
  assert.throws(
    () => importTrackingDataJson(JSON.stringify(badVersion)),
    /saved has an unsupported version/,
  );

  const badTimestamp = structuredClone(valid) as {
    saved: { records: Array<{ updatedAt: string }> };
  };
  badTimestamp.saved.records[0].updatedAt = "2026-02-31T00:00:00Z";
  assert.throws(
    () => importTrackingDataJson(JSON.stringify(badTimestamp)),
    /updatedAt must be a valid ISO timestamp/,
  );
});

test("combined CSV validation rejects duplicate saved keys and cross-type fields", () => {
  const header =
    "data_type,collection,key,saved,stage,updated_at,applied_at,notes,next_action_at,deadline,recruiter,contact";
  assert.throws(
    () =>
      importTrackingDataCsv(
        [
          header,
          `saved,records,duplicate,true,,${UPDATED},,,,,,`,
          `saved,unmatched,duplicate,false,,${UPDATED},,,,,,`,
        ].join("\n"),
      ),
    /duplicates saved key duplicate/,
  );
  assert.throws(
    () =>
      importTrackingDataCsv(
        [header, `saved,records,job,true,applied,${UPDATED},,,,,,`].join(
          "\n",
        ),
      ),
    /contains application fields for saved data/,
  );
  assert.throws(
    () =>
      importTrackingDataCsv(
        [header, `application,records,job,true,applied,${UPDATED},,,,,,`].join(
          "\n",
        ),
      ),
    /must leave saved empty/,
  );
});

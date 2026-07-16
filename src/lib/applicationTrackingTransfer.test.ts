import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_STORE_VERSION,
  type ApplicationStoreV3,
} from "./applicationTracking";
import {
  ApplicationTrackingImportError,
  exportApplicationTrackingCsv,
  exportApplicationTrackingJson,
  importApplicationTrackingCsv,
  importApplicationTrackingJson,
  makeSpreadsheetSafe,
} from "./applicationTrackingTransfer";

const APPLIED = "2026-07-09T18:00:00.000Z";
const UPDATED = "2026-07-10T18:00:00.000Z";
const DEADLINE = "2026-07-15T18:00:00.000Z";

const store: ApplicationStoreV3 = {
  version: APPLICATION_STORE_VERSION,
  records: {
    "job,one": {
      stage: "interview",
      appliedAt: APPLIED,
      updatedAt: UPDATED,
      notes: '=HYPERLINK("https://evil.test"), then\nreview "safe" notes',
      nextActionAt: DEADLINE,
      deadline: DEADLINE,
      recruiter: "+1 555 0100",
      contact: "@recruiter",
    },
  },
  unmatched: {
    "https://legacy.example.test/apply": {
      stage: "applied",
      appliedAt: APPLIED,
      updatedAt: UPDATED,
    },
  },
  tombstones: {
    "removed-job": UPDATED,
  },
};

test("strict JSON transfer round-trips live and unmatched records", () => {
  const json = exportApplicationTrackingJson(store, UPDATED);
  const imported = importApplicationTrackingJson(json);

  assert.deepEqual(imported.records, store.records);
  assert.deepEqual(imported.unmatched, store.unmatched);
  assert.deepEqual(imported.tombstones, {});
  assert.match(json, /"format": "timley-application-tracking"/);
});

test("JSON import rejects unknown fields, bad versions, and partial records", () => {
  const exported = JSON.parse(
    exportApplicationTrackingJson(store, UPDATED),
  ) as Record<string, unknown>;
  exported.extra = true;
  assert.throws(
    () => importApplicationTrackingJson(JSON.stringify(exported)),
    ApplicationTrackingImportError,
  );

  const badVersion = JSON.parse(
    exportApplicationTrackingJson(store, UPDATED),
  ) as Record<string, unknown>;
  badVersion.version = 2;
  assert.throws(
    () => importApplicationTrackingJson(JSON.stringify(badVersion)),
    /unsupported version/,
  );

  const partial = JSON.parse(
    exportApplicationTrackingJson(store, UPDATED),
  ) as { applications: Array<Record<string, unknown>> };
  delete partial.applications[0].updatedAt;
  assert.throws(
    () => importApplicationTrackingJson(JSON.stringify(partial)),
    /missing the required updatedAt/,
  );

  const invalidOptional = JSON.parse(
    exportApplicationTrackingJson(store, UPDATED),
  ) as { applications: Array<Record<string, unknown>> };
  invalidOptional.applications[0].nextActionAt = "tomorrow";
  assert.throws(
    () => importApplicationTrackingJson(JSON.stringify(invalidOptional)),
    /nextActionAt must be a valid ISO timestamp/,
  );

  const reversedDates = JSON.parse(
    exportApplicationTrackingJson(store, UPDATED),
  ) as { applications: Array<Record<string, unknown>> };
  reversedDates.applications[0].appliedAt = "2026-07-11T18:00:00.000Z";
  reversedDates.applications[0].updatedAt = "2026-07-10T18:00:00.000Z";
  assert.throws(
    () => importApplicationTrackingJson(JSON.stringify(reversedDates)),
    /appliedAt cannot be later/,
  );
});

test("CSV export neutralizes formulas and round-trips quotes, commas, and newlines", () => {
  const csv = exportApplicationTrackingCsv(store);

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/evil\.test""\)/);
  assert.match(csv, /"'\+1 555 0100"/);
  assert.match(csv, /"'@recruiter"/);

  const imported = importApplicationTrackingCsv(csv);
  assert.deepEqual(imported.records, store.records);
  assert.deepEqual(imported.unmatched, store.unmatched);
});

test("CSV imported formula-like values are always guarded again on export", () => {
  const csv = [
    "record_type,key,stage,updated_at,applied_at,notes,next_action_at,deadline,recruiter,contact",
    `application,job-safe,applied,${UPDATED},${APPLIED},=2+2,,,,-1+1`,
  ].join("\n");
  const imported = importApplicationTrackingCsv(csv);

  assert.equal(imported.records["job-safe"].notes, "=2+2");
  assert.equal(imported.records["job-safe"].contact, "-1+1");
  const reExported = exportApplicationTrackingCsv(imported);
  assert.match(reExported, /"'=2\+2"/);
  assert.match(reExported, /"'-1\+1"/);
});

test("CSV import rejects malformed quotes, headers, duplicate keys, and invalid dates", () => {
  assert.throws(
    () => importApplicationTrackingCsv('record_type,key\n"unterminated'),
    /unterminated quoted field/,
  );
  assert.throws(
    () => importApplicationTrackingCsv("key,stage\njob,applied"),
    /headers must be exactly/,
  );

  const header =
    "record_type,key,stage,updated_at,applied_at,notes,next_action_at,deadline,recruiter,contact";
  assert.throws(
    () =>
      importApplicationTrackingCsv(
        [
          header,
          `application,duplicate,applied,${UPDATED},${APPLIED},,,,,`,
          `unmatched,duplicate,applied,${UPDATED},${APPLIED},,,,,`,
        ].join("\n"),
      ),
    /duplicates key duplicate/,
  );
  assert.throws(
    () =>
      importApplicationTrackingCsv(
        [header, "application,job,applied,not-a-date,,,,,,"].join("\n"),
      ),
    /invalid application record/,
  );
  assert.throws(
    () =>
      importApplicationTrackingCsv(
        [header, "application,job,applied,2026-02-31T00:00:00Z,,,,,,"].join(
          "\n",
        ),
      ),
    /invalid application record/,
  );
});

test("formula guard covers whitespace-prefixed formulas without changing ordinary values", () => {
  assert.equal(makeSpreadsheetSafe(" =cmd"), "' =cmd");
  assert.equal(makeSpreadsheetSafe("\t@cmd"), "'\t@cmd");
  assert.equal(makeSpreadsheetSafe("normal + value"), "normal + value");
});

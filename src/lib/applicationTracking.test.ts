import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLICATION_STORAGE_KEY,
  applicationSnapshotFromJob,
  ensureSavedApplication,
  getApplicationStage,
  mergeApplicationRecords,
  migrateApplicationRecords,
  parseApplicationRecords,
  resetApplicationStage,
  restoreApplicationRecord,
  serializeApplicationRecords,
  setApplicationStage,
  updateApplicationRecord,
  type ApplicationRecords,
} from "./applicationTracking";
import type { Internship } from "./types";

const NOW = "2026-07-10T18:00:00.000Z";
const LATER = "2026-07-11T18:00:00.000Z";
const LATEST = "2026-07-12T18:00:00.000Z";

const job: Internship = {
  id: "job-1",
  title: "Software Engineering Intern",
  company: "Example Labs",
  location: "Remote; Denver, CO",
  category: "software",
  role_type: "internship",
  season: "Summer 2027",
  salary: null,
  link: "https://example.test/jobs/1",
  source: "fixture",
  sponsorship: null,
  posted_date: "2026-07-01",
  first_seen_at: "2026-07-01T00:00:00.000Z",
  last_seen_at: "2026-07-10T00:00:00.000Z",
  is_active: true,
};

test("uses the v3 storage boundary", () => {
  assert.equal(APPLICATION_STORAGE_KEY, "timley:applications:v3");
});

test("v3 presence is authoritative even when empty or corrupt", () => {
  for (const v3Raw of ["{}", "{not-json"]) {
    const result = migrateApplicationRecords({
      v3Raw,
      v2Raw: JSON.stringify({
        "https://v2.test/job": {
          stage: "interview",
          updatedAt: NOW,
        },
      }),
      legacyAppliedRaw: JSON.stringify(["https://legacy.test/job"]),
      savedRaw: JSON.stringify(["https://saved.test/job"]),
      now: LATER,
    });

    assert.equal(result.source, "v3");
    assert.equal(result.shouldPersist, false);
    assert.equal(result.migratedCount, 0);
    assert.deepEqual(result.records, {});
  }
});

test("migrates v2, legacy applied, and saved-only URLs without losing timestamps", () => {
  const result = migrateApplicationRecords({
    v3Raw: null,
    v2Raw: JSON.stringify({
      [job.link]: {
        stage: "oa",
        updatedAt: NOW,
        appliedAt: "2026-07-08T18:00:00.000Z",
      },
      "https://offer.test/job": {
        stage: "offer",
        updatedAt: LATER,
        appliedAt: NOW,
      },
      invalid: {
        stage: "wishlist",
        updatedAt: NOW,
      },
    }),
    legacyAppliedRaw: JSON.stringify([
      job.link,
      "https://legacy.test/job",
      "https://legacy.test/job",
    ]),
    savedRaw: JSON.stringify([
      job.link,
      "https://legacy.test/job",
      "https://saved.test/job",
      "https://saved.test/job",
    ]),
    jobs: [job],
    now: LATEST,
  });

  assert.equal(result.source, "v2");
  assert.equal(result.shouldPersist, true);
  assert.equal(result.migratedCount, 4);
  assert.deepEqual(result.records[job.link], {
    stage: "assessment",
    updatedAt: NOW,
    jobTitle: job.title,
    company: job.company,
    appliedAt: "2026-07-08T18:00:00.000Z",
    applicationUrl: job.link,
    locationArrangement: job.location,
  });
  assert.deepEqual(result.records["https://legacy.test/job"], {
    stage: "applied",
    updatedAt: LATEST,
    appliedAt: LATEST,
    applicationUrl: "https://legacy.test/job",
  });
  assert.deepEqual(result.records["https://saved.test/job"], {
    stage: "saved",
    updatedAt: LATEST,
    savedAt: LATEST,
    applicationUrl: "https://saved.test/job",
  });
  assert.equal(
    result.records["https://saved.test/job"].appliedAt,
    undefined,
  );
});

test("strict parser keeps rich valid data and strips invalid optional values", () => {
  const records = parseApplicationRecords(
    JSON.stringify({
      good: {
        stage: "interview",
        updatedAt: LATEST,
        jobTitle: "Platform Intern",
        company: "Example",
        savedAt: NOW,
        appliedAt: LATER,
        nextAction: "Prepare system design examples",
        nextActionAt: LATEST,
        interviewDates: [NOW, "not-a-date", LATER, NOW],
        notes: "Bring questions.",
        applicationUrl: "https://example.test/job",
        contact: "Taylor, recruiting",
        compensationNotes: "$42/hr target",
        locationArrangement: "Hybrid — Denver",
        ignored: "not part of the schema",
      },
      saved: {
        stage: "saved",
        updatedAt: NOW,
        appliedAt: NOW,
      },
      preparing: {
        stage: "preparing",
        updatedAt: NOW,
        appliedAt: NOW,
      },
      badStage: { stage: "oa", updatedAt: NOW },
      badDate: { stage: "offer", updatedAt: "yesterday" },
      reset: { stage: "not_applied", updatedAt: NOW },
      " leading-space": { stage: "saved", updatedAt: NOW },
    }),
  );

  assert.deepEqual(records.good, {
    stage: "interview",
    updatedAt: LATEST,
    jobTitle: "Platform Intern",
    company: "Example",
    savedAt: NOW,
    appliedAt: LATER,
    nextAction: "Prepare system design examples",
    nextActionAt: LATEST,
    interviewDates: [NOW, LATER],
    notes: "Bring questions.",
    applicationUrl: "https://example.test/job",
    contact: "Taylor, recruiting",
    compensationNotes: "$42/hr target",
    locationArrangement: "Hybrid — Denver",
  });
  assert.deepEqual(records.saved, {
    stage: "saved",
    updatedAt: NOW,
  });
  assert.deepEqual(records.preparing, {
    stage: "preparing",
    updatedAt: NOW,
  });
  assert.equal(records.badStage, undefined);
  assert.equal(records.badDate, undefined);
  assert.equal(records.reset, undefined);
  assert.equal(records[" leading-space"], undefined);
});

test("serialization round-trips the validated rich record map", () => {
  const original: ApplicationRecords = {
    job: {
      stage: "assessment",
      updatedAt: LATER,
      savedAt: NOW,
      appliedAt: NOW,
      notes: "Practice notes",
      interviewDates: [LATEST],
    },
  };
  assert.deepEqual(
    parseApplicationRecords(serializeApplicationRecords(original)),
    original,
  );
});

test("stage helpers preserve rich data and enforce applied-date invariants", () => {
  const saved = setApplicationStage({}, job.link, "saved", NOW, {
    jobTitle: job.title,
    company: job.company,
  });
  assert.deepEqual(saved[job.link], {
    stage: "saved",
    updatedAt: NOW,
    jobTitle: job.title,
    company: job.company,
    savedAt: NOW,
    applicationUrl: job.link,
  });

  const withNotes = updateApplicationRecord(
    saved,
    job.link,
    {
      notes: "Tailored resume complete",
      nextAction: "Submit",
      nextActionAt: LATER,
    },
    LATER,
  );
  const applied = setApplicationStage(withNotes, job.link, "applied", LATEST);
  assert.equal(applied[job.link].appliedAt, LATEST);
  assert.equal(applied[job.link].notes, "Tailored resume complete");
  assert.equal(applied[job.link].nextAction, "Submit");

  const preparing = setApplicationStage(
    applied,
    job.link,
    "preparing",
    "2026-07-13T18:00:00.000Z",
  );
  assert.equal(preparing[job.link].appliedAt, undefined);
  assert.equal(preparing[job.link].notes, "Tailored resume complete");
});

test("record updates can clear optional fields without mutating the source", () => {
  const records: ApplicationRecords = {
    job: {
      stage: "interview",
      updatedAt: NOW,
      notes: "Old note",
      contact: "Recruiter",
      interviewDates: [NOW],
    },
  };
  const next = updateApplicationRecord(
    records,
    "job",
    {
      notes: "",
      contact: undefined,
      interviewDates: [],
      compensationNotes: "Discuss equity",
    },
    LATER,
  );

  assert.deepEqual(records.job, {
    stage: "interview",
    updatedAt: NOW,
    notes: "Old note",
    contact: "Recruiter",
    interviewDates: [NOW],
  });
  assert.deepEqual(next.job, {
    stage: "interview",
    updatedAt: LATER,
    compensationNotes: "Discuss equity",
  });
});

test("ensure saved creates saved records and never downgrades an application", () => {
  const created = ensureSavedApplication({}, job.link, NOW, {
    jobTitle: job.title,
  });
  assert.equal(created[job.link].stage, "saved");
  assert.equal(created[job.link].savedAt, NOW);

  const applied: ApplicationRecords = {
    [job.link]: {
      stage: "interview",
      updatedAt: NOW,
      appliedAt: NOW,
    },
  };
  const enriched = ensureSavedApplication(applied, job.link, LATER, {
    company: job.company,
  });
  assert.equal(enriched[job.link].stage, "interview");
  assert.equal(enriched[job.link].appliedAt, NOW);
  assert.equal(enriched[job.link].savedAt, LATER);
  assert.equal(enriched[job.link].company, job.company);
});

test("delete and restore support undo while preserving exact timestamps", () => {
  const tracked = setApplicationStage({}, "job", "applied", NOW);
  const deleted = resetApplicationStage(tracked, "job");
  assert.equal(getApplicationStage(deleted, "job"), "not_applied");
  assert.equal(Object.hasOwn(deleted, "job"), false);

  const restored = restoreApplicationRecord(deleted, "job", tracked.job);
  assert.deepEqual(restored.job, tracked.job);
});

test("backup merge restores missing rows and keeps the newest conflict", () => {
  const current: ApplicationRecords = {
    same: {
      stage: "interview",
      updatedAt: LATEST,
      notes: "Current",
    },
  };
  const merged = mergeApplicationRecords(current, {
    same: {
      stage: "applied",
      updatedAt: NOW,
      notes: "Older backup",
    },
    restored: {
      stage: "archived",
      updatedAt: LATER,
      notes: "From backup",
    },
  });

  assert.deepEqual(merged.same, current.same);
  assert.deepEqual(merged.restored, {
    stage: "archived",
    updatedAt: LATER,
    notes: "From backup",
  });
});

test("job snapshots use only application-owned presentation fields", () => {
  assert.deepEqual(applicationSnapshotFromJob(job), {
    jobTitle: job.title,
    company: job.company,
    applicationUrl: job.link,
    locationArrangement: job.location,
  });
});

test("application URL aliases keep result-card stage lookups connected", () => {
  const records: ApplicationRecords = {
    "manual:application": {
      stage: "interview",
      updatedAt: LATER,
      applicationUrl: job.link,
    },
  };

  assert.equal(getApplicationStage(records, job.link), "interview");
  assert.equal(getApplicationStage(records, "manual:application"), "interview");
});

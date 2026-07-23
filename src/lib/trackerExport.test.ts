import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApplicationRecord,
  ApplicationRecords,
} from "./applicationTracking";
import {
  TRACKER_BACKUP_FORMAT,
  TRACKER_BACKUP_VERSION,
  buildTrackerCsv,
  buildTrackerIcs,
  escapeCsvCell,
  getUpcomingTrackerItems,
  mergeTrackerBackup,
  parseTrackerBackup,
  serializeTrackerBackup,
  type TrackerBackup,
} from "./trackerExport";

const NOW = "2026-07-22T12:00:00.000Z";

function application(
  overrides: Record<string, unknown> = {},
): ApplicationRecord {
  return {
    stage: "applied",
    updatedAt: NOW,
    jobTitle: "Software Engineering Intern",
    company: "Example Labs",
    savedAt: "2026-07-10",
    appliedAt: "2026-07-15",
    applicationUrl: "https://example.com/jobs/1",
    ...overrides,
  } as unknown as ApplicationRecord;
}

test("CSV exports every tracker field with spreadsheet formula protection", () => {
  const records = {
    "https://example.com/jobs/1": application({
      jobTitle: '=HYPERLINK("https://evil.test","Open")',
      company: "Example, Inc.",
      nextAction: "+Call recruiter",
      nextActionAt: "2026-07-23",
      interviewDates: ["2026-07-25T15:00:00Z", "2026-07-28"],
      notes: 'Line one\n"quoted" line',
      contact: "@recruiter",
      compensationNotes: "-$45/hour",
      locationArrangement: "Remote; Denver",
    }),
  } as unknown as ApplicationRecords;

  const csv = buildTrackerCsv(records);

  assert.match(csv, /^Job,Company,Stage,Date saved,Date applied,/);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"Example, Inc\."/);
  assert.match(csv, /'\+Call recruiter/);
  assert.match(csv, /'@recruiter/);
  assert.match(csv, /'-\$45\/hour/);
  assert.match(csv, /"Line one\r?\n""quoted"" line"/);
  assert.match(csv, /2026-07-25T15:00:00Z; 2026-07-28/);
  assert.equal(escapeCsvCell("ordinary"), "ordinary");
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
  assert.equal(escapeCsvCell(" =2+2"), "' =2+2");
});

test("versioned JSON backup round-trips all records and saved URLs", () => {
  const records = {
    "https://example.com/jobs/1": application({
      stage: "interview",
      nextAction: "Prepare examples",
      nextActionAt: "2026-07-24",
      interviewDates: ["2026-07-25T15:00:00Z"],
      notes: "Private notes",
      contact: "Alex — alex@example.com",
      compensationNotes: "$45/hour",
      locationArrangement: "Hybrid — Denver",
    }),
  } as unknown as ApplicationRecords;

  const serialized = serializeTrackerBackup(
    records,
    [
      "https://saved.example/jobs/2",
      "https://saved.example/jobs/2",
      "https://example.com/jobs/1",
    ],
    NOW,
  );
  const parsed = parseTrackerBackup(serialized);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.backup.format, TRACKER_BACKUP_FORMAT);
  assert.equal(parsed.backup.version, TRACKER_BACKUP_VERSION);
  assert.equal(parsed.backup.exportedAt, NOW);
  assert.deepEqual(parsed.backup.records, records);
  assert.deepEqual(parsed.backup.savedJobs, [
    "https://example.com/jobs/1",
    "https://saved.example/jobs/2",
  ]);
  assert.equal(parsed.skippedRecords, 0);
  assert.equal(parsed.skippedSavedJobs, 0);
});

test("backup parsing rejects the wrong envelope and skips unsafe entries", () => {
  assert.deepEqual(parseTrackerBackup("{not json"), {
    ok: false,
    error: "The selected file is not valid JSON.",
  });
  assert.equal(
    parseTrackerBackup(
      JSON.stringify({
        format: TRACKER_BACKUP_FORMAT,
        version: 99,
        exportedAt: NOW,
        records: {},
        savedJobs: [],
      }),
    ).ok,
    false,
  );

  const raw = `{
    "format": "${TRACKER_BACKUP_FORMAT}",
    "version": ${TRACKER_BACKUP_VERSION},
    "exportedAt": "${NOW}",
    "records": {
      "https://example.com/good": {
        "stage": "oa",
        "updatedAt": "${NOW}",
        "notes": "kept",
        "nextActionAt": "not-a-date",
        "interviewDates": ["2026-07-30", "invalid", "2026-07-30"]
      },
      "https://example.com/bad": {
        "stage": "invented",
        "updatedAt": "${NOW}"
      },
      "__proto__": {
        "stage": "applied",
        "updatedAt": "${NOW}"
      }
    },
    "savedJobs": [
      "https://example.com/good",
      "https://example.com/good",
      "javascript:alert(1)",
      42
    ]
  }`;
  const parsed = parseTrackerBackup(raw);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.skippedRecords, 2);
  assert.equal(parsed.skippedSavedJobs, 3);
  assert.deepEqual(parsed.backup.records["https://example.com/good"], {
    stage: "assessment",
    updatedAt: NOW,
    notes: "kept",
    interviewDates: ["2026-07-30"],
  });
  assert.deepEqual(parsed.backup.savedJobs, [
    "https://example.com/good",
  ]);
  assert.equal(Object.hasOwn(parsed.backup.records, "__proto__"), false);
});

test("merge restore keeps newer local records and unions saved jobs", () => {
  const current = {
    same: application({
      company: "Current",
      updatedAt: "2026-07-25T00:00:00.000Z",
    }),
    local: application(),
  } as unknown as ApplicationRecords;
  const backup = {
    format: TRACKER_BACKUP_FORMAT,
    version: TRACKER_BACKUP_VERSION,
    exportedAt: NOW,
    records: {
      same: application({
        company: "Older backup",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
      restored: application({
        updatedAt: "2026-07-24T00:00:00.000Z",
      }),
    } as unknown as ApplicationRecords,
    savedJobs: ["https://saved.example/restored"],
  } satisfies TrackerBackup;

  const merged = mergeTrackerBackup(
    current,
    ["https://saved.example/current"],
    backup,
  );

  assert.equal(
    (merged.records.same as unknown as { company: string }).company,
    "Current",
  );
  assert.equal(Object.hasOwn(merged.records, "restored"), true);
  assert.deepEqual(merged.savedJobs, [
    "https://saved.example/current",
    "https://saved.example/restored",
  ]);
});

test("ICS export escapes text, uses CRLF, stable UIDs, and omits private fields", () => {
  const records = {
    "https://example.com/jobs/1": application({
      nextAction: "Email recruiter, then review; notes\\draft\nConfirm",
      nextActionAt: "2026-07-23",
      interviewDates: [
        "2026-07-25T15:30:00Z",
        "2026-07-28T09:15",
      ],
      notes: "SECRET PERSONAL NOTE",
      contact: "PRIVATE CONTACT",
    }),
    "https://example.com/jobs/archived": application({
      stage: "archived",
      nextAction: "Should not export",
      nextActionAt: "2026-07-24",
    }),
  } as unknown as ApplicationRecords;

  const first = buildTrackerIcs(records, NOW);
  const second = buildTrackerIcs(records, NOW);

  assert.equal(first, second);
  assert.match(first, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(first, /DTSTART;VALUE=DATE:20260723\r\n/);
  assert.match(first, /DTEND;VALUE=DATE:20260724\r\n/);
  assert.match(first, /DTSTART:20260725T153000Z\r\n/);
  assert.match(first, /DTSTART:20260728T091500\r\n/);
  assert.match(
    first,
    /SUMMARY:Email recruiter\\, then review\\; notes\\\\draft\\nConfirm — Software Engineering Intern at Example Labs/,
  );
  assert.equal((first.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.equal((first.match(/UID:timley-[0-9a-f]{8}@timley\.local/g) ?? []).length, 3);
  assert.doesNotMatch(first, /Should not export/);
  assert.doesNotMatch(first, /SECRET PERSONAL NOTE|PRIVATE CONTACT/);
  assert.equal(first.replaceAll("\r\n", "").includes("\n"), false);
});

test("upcoming items classify, filter, deduplicate, and sort dated work", () => {
  const records = {
    overdue: application({
      nextAction: "Follow up",
      nextActionAt: "2026-07-20",
      company: "A Company",
    }),
    today: application({
      nextActionAt: "2026-07-22",
      interviewDates: ["2026-07-22T15:00:00Z", "2026-07-22T15:00:00Z"],
      company: "B Company",
    }),
    upcoming: application({
      nextAction: "Send materials",
      nextActionAt: "2026-07-23",
      interviewDates: ["2026-07-29"],
      company: "C Company",
    }),
    outside: application({
      nextActionAt: "2026-07-30",
    }),
    archived: application({
      stage: "archived",
      nextActionAt: "2026-07-21",
    }),
    rejected: application({
      stage: "rejected",
      interviewDates: ["2026-07-22"],
    }),
  } as unknown as ApplicationRecords;

  const items = getUpcomingTrackerItems(records, "2026-07-22", 7);

  assert.deepEqual(
    items.map((item) => [
      item.jobKey,
      item.kind,
      item.timing,
      item.dayOffset,
    ]),
    [
      ["overdue", "next-action", "overdue", -2],
      ["today", "next-action", "today", 0],
      ["today", "interview", "today", 0],
      ["upcoming", "next-action", "upcoming", 1],
      ["upcoming", "interview", "upcoming", 7],
    ],
  );
  assert.equal(items[1].label, "Next action");
  assert.equal(items.every((item) => item.status === item.timing), true);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
});

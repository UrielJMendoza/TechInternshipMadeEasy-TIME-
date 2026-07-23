import {
  mergeApplicationRecords,
  parseApplicationRecord,
  type ApplicationRecord,
  type ApplicationRecords,
} from "./applicationTracking";

export const TRACKER_BACKUP_FORMAT = "timley-tracker-backup";
export const TRACKER_BACKUP_VERSION = 1;

const DAY_MS = 86_400_000;
const DEFAULT_UPCOMING_HORIZON_DAYS = 30;
const unsafeRecordKeys = new Set(["__proto__", "constructor", "prototype"]);
const inactiveReminderStages = new Set([
  "rejected",
  "withdrawn",
  "archived",
]);

interface TrackerRecordFields {
  stage: string;
  updatedAt: string;
  jobTitle?: string;
  company?: string;
  savedAt?: string;
  appliedAt?: string;
  nextAction?: string;
  nextActionAt?: string;
  interviewDates?: string[];
  notes?: string;
  applicationUrl?: string;
  contact?: string;
  compensationNotes?: string;
  locationArrangement?: string;
}

export interface TrackerBackup {
  format: typeof TRACKER_BACKUP_FORMAT;
  version: typeof TRACKER_BACKUP_VERSION;
  exportedAt: string;
  records: ApplicationRecords;
  savedJobs: string[];
}

export type TrackerBackupParseResult =
  | {
      ok: true;
      backup: TrackerBackup;
      skippedRecords: number;
      skippedSavedJobs: number;
    }
  | {
      ok: false;
      error: string;
    };

export interface MergedTrackerBackup {
  records: ApplicationRecords;
  savedJobs: string[];
}

export type UpcomingTrackerItemKind = "next-action" | "interview";
export type UpcomingTrackerTiming = "overdue" | "today" | "upcoming";

export interface UpcomingTrackerItem {
  id: string;
  jobKey: string;
  kind: UpcomingTrackerItemKind;
  label: string;
  applicationLabel: string;
  jobTitle?: string;
  company?: string;
  stage: ApplicationRecord["stage"];
  date: string;
  timestamp: number;
  dayOffset: number;
  timing: UpcomingTrackerTiming;
  status: UpcomingTrackerTiming;
}

interface CalendarValue {
  date: string;
  dayNumber: number;
  sortTime: number;
  startLine: string;
  endLine?: string;
}

interface CalendarEvent {
  uid: string;
  sortTime: number;
  lines: string[];
}

const CSV_COLUMNS = [
  "Job",
  "Company",
  "Stage",
  "Date saved",
  "Date applied",
  "Next action",
  "Next-action date",
  "Interview dates",
  "Personal notes",
  "Application URL",
  "Contact",
  "Compensation notes",
  "Location / work arrangement",
  "Last updated",
] as const;

/**
 * Create a spreadsheet-friendly CSV without allowing user-entered values to
 * become formulas when the file is opened in common spreadsheet programs.
 */
export function buildTrackerCsv(records: ApplicationRecords): string {
  const rows = Object.entries(records)
    .filter(([jobKey]) => safeJobKey(jobKey))
    .sort(compareRecordEntries)
    .map(([jobKey, application]) => {
      const record = recordFields(application);
      return [
        record.jobTitle ?? "",
        record.company ?? "",
        stageLabel(record.stage),
        record.savedAt ?? "",
        record.appliedAt ?? "",
        record.nextAction ?? "",
        record.nextActionAt ?? "",
        record.interviewDates?.join("; ") ?? "",
        record.notes ?? "",
        record.applicationUrl ?? jobKey,
        record.contact ?? "",
        record.compensationNotes ?? "",
        record.locationArrangement ?? "",
        record.updatedAt,
      ];
    });

  return [
    CSV_COLUMNS.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\r\n");
}

export function escapeCsvCell(value: string): string {
  const neutralized =
    /^[\t\r]/.test(value) || /^[\s]*[=+\-@]/.test(value)
      ? `'${value}`
      : value;

  return /[",\r\n]/.test(neutralized)
    ? `"${neutralized.replaceAll('"', '""')}"`
    : neutralized;
}

export function serializeTrackerBackup(
  records: ApplicationRecords,
  savedJobs: readonly string[],
  exportedAt = new Date().toISOString(),
): string {
  const sortedRecords: ApplicationRecords = {};
  for (const [jobKey, record] of Object.entries(records).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (safeJobKey(jobKey)) sortedRecords[jobKey] = record;
  }

  const backup: TrackerBackup = {
    format: TRACKER_BACKUP_FORMAT,
    version: TRACKER_BACKUP_VERSION,
    exportedAt: isDateValue(exportedAt)
      ? exportedAt
      : new Date().toISOString(),
    records: sortedRecords,
    savedJobs: validSavedJobs(savedJobs),
  };

  return `${JSON.stringify(backup, null, 2)}\n`;
}

/**
 * Parse an untrusted backup into validated application records. Invalid
 * entries are counted and skipped while valid records remain available for a
 * merge restore.
 */
export function parseTrackerBackup(raw: string): TrackerBackupParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The selected file is not valid JSON." };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "The selected file is not a Timley backup." };
  }
  if (value.format !== TRACKER_BACKUP_FORMAT) {
    return { ok: false, error: "The selected file has an unknown backup format." };
  }
  if (value.version !== TRACKER_BACKUP_VERSION) {
    return {
      ok: false,
      error: `Backup version ${String(value.version)} is not supported.`,
    };
  }
  if (!isDateValue(value.exportedAt)) {
    return { ok: false, error: "The backup export date is invalid." };
  }
  if (!isRecord(value.records) || !Array.isArray(value.savedJobs)) {
    return { ok: false, error: "The backup is missing tracker data." };
  }

  const records: ApplicationRecords = {};
  let skippedRecords = 0;
  for (const [jobKey, candidate] of Object.entries(value.records)) {
    const record = safeJobKey(jobKey)
      ? parseBackupRecord(candidate)
      : null;
    if (!record) {
      skippedRecords += 1;
      continue;
    }
    records[jobKey] = record;
  }

  const savedJobs: string[] = [];
  const seenSavedJobs = new Set<string>();
  let skippedSavedJobs = 0;
  for (const candidate of value.savedJobs) {
    const url = safeHttpUrl(candidate);
    if (!url || seenSavedJobs.has(url)) {
      skippedSavedJobs += 1;
      continue;
    }
    seenSavedJobs.add(url);
    savedJobs.push(url);
  }
  savedJobs.sort((a, b) => a.localeCompare(b));

  return {
    ok: true,
    backup: {
      format: TRACKER_BACKUP_FORMAT,
      version: TRACKER_BACKUP_VERSION,
      exportedAt: value.exportedAt,
      records,
      savedJobs,
    },
    skippedRecords,
    skippedSavedJobs,
  };
}

/**
 * Merge a parsed backup without replacing newer local edits. Saved jobs use a
 * set union so restoring a backup cannot silently unsave a current job.
 */
export function mergeTrackerBackup(
  currentRecords: ApplicationRecords,
  currentSavedJobs: readonly string[],
  backup: TrackerBackup,
): MergedTrackerBackup {
  return {
    records: mergeApplicationRecords(currentRecords, backup.records),
    savedJobs: validSavedJobs([
      ...currentSavedJobs,
      ...backup.savedJobs,
    ]),
  };
}

/**
 * Build a standalone RFC 5545 calendar containing dated next actions and
 * interviews. Personal notes and contact details are deliberately omitted.
 */
export function buildTrackerIcs(
  records: ApplicationRecords,
  generatedAt = new Date().toISOString(),
): string {
  const stamp = toIcsUtc(
    isDateValue(generatedAt) ? new Date(generatedAt) : new Date(),
  );
  const events: CalendarEvent[] = [];

  for (const [jobKey, application] of Object.entries(records)) {
    if (!safeJobKey(jobKey)) continue;
    const record = recordFields(application);
    if (inactiveReminderStages.has(record.stage)) continue;

    const applicationLabel = labelForRecord(jobKey, record);
    const applicationUrl = safeHttpUrl(record.applicationUrl ?? jobKey);

    if (record.nextActionAt) {
      const date = parseCalendarValue(record.nextActionAt);
      if (date) {
        const action = record.nextAction?.trim() || "Next action";
        events.push(
          calendarEvent({
            jobKey,
            kind: "next-action",
            discriminator: "next-action",
            date,
            stamp,
            summary: `${action} — ${applicationLabel}`,
            description: `Stage: ${stageLabel(record.stage)}`,
            applicationUrl,
          }),
        );
      }
    }

    const interviewDates = [
      ...new Set(
        Array.isArray(record.interviewDates)
          ? record.interviewDates
          : [],
      ),
    ];
    for (const interviewDate of interviewDates) {
      const date = parseCalendarValue(interviewDate);
      if (!date) continue;
      events.push(
        calendarEvent({
          jobKey,
          kind: "interview",
          discriminator: `interview:${interviewDate}`,
          date,
          stamp,
          summary: `Interview — ${applicationLabel}`,
          description: `Stage: ${stageLabel(record.stage)}`,
          applicationUrl,
        }),
      );
    }
  }

  events.sort(
    (a, b) => a.sortTime - b.sortTime || a.uid.localeCompare(b.uid),
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timley//Application Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((event) => event.lines),
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

/**
 * Return active dated work through the inclusive future horizon. Overdue
 * items remain visible regardless of age so they can be resolved explicitly.
 */
export function getUpcomingTrackerItems(
  records: ApplicationRecords,
  today: Date | string = new Date(),
  horizonDays = DEFAULT_UPCOMING_HORIZON_DAYS,
): UpcomingTrackerItem[] {
  const todayDay = dayNumberForToday(today);
  const horizon = Number.isFinite(horizonDays)
    ? Math.max(0, Math.floor(horizonDays))
    : DEFAULT_UPCOMING_HORIZON_DAYS;
  const items: UpcomingTrackerItem[] = [];

  for (const [jobKey, application] of Object.entries(records)) {
    if (!safeJobKey(jobKey)) continue;
    const record = recordFields(application);
    if (inactiveReminderStages.has(record.stage)) continue;
    const applicationLabel = labelForRecord(jobKey, record);

    if (record.nextActionAt) {
      const date = parseCalendarValue(record.nextActionAt);
      if (date) {
        addUpcomingItem(items, {
          jobKey,
          application,
          record,
          kind: "next-action",
          label: record.nextAction?.trim() || "Next action",
          applicationLabel,
          date,
          todayDay,
          horizon,
          discriminator: "next-action",
        });
      }
    }

    const interviewDates = [
      ...new Set(
        Array.isArray(record.interviewDates)
          ? record.interviewDates
          : [],
      ),
    ];
    for (const interviewDate of interviewDates) {
      const date = parseCalendarValue(interviewDate);
      if (!date) continue;
      addUpcomingItem(items, {
        jobKey,
        application,
        record,
        kind: "interview",
        label: "Interview",
        applicationLabel,
        date,
        todayDay,
        horizon,
        discriminator: `interview:${interviewDate}`,
      });
    }
  }

  return items.sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      (a.kind === b.kind ? 0 : a.kind === "next-action" ? -1 : 1) ||
      a.applicationLabel.localeCompare(b.applicationLabel) ||
      a.id.localeCompare(b.id),
  );
}

function addUpcomingItem(
  items: UpcomingTrackerItem[],
  input: {
    jobKey: string;
    application: ApplicationRecord;
    record: TrackerRecordFields;
    kind: UpcomingTrackerItemKind;
    label: string;
    applicationLabel: string;
    date: CalendarValue;
    todayDay: number;
    horizon: number;
    discriminator: string;
  },
): void {
  const dayOffset = input.date.dayNumber - input.todayDay;
  if (dayOffset > input.horizon) return;

  const timing: UpcomingTrackerTiming =
    dayOffset < 0 ? "overdue" : dayOffset === 0 ? "today" : "upcoming";
  items.push({
    id: stableEventId(input.jobKey, input.discriminator),
    jobKey: input.jobKey,
    kind: input.kind,
    label: input.label,
    applicationLabel: input.applicationLabel,
    jobTitle: input.record.jobTitle,
    company: input.record.company,
    stage: input.application.stage,
    date: input.date.date,
    timestamp: input.date.sortTime,
    dayOffset,
    timing,
    status: timing,
  });
}

function calendarEvent(input: {
  jobKey: string;
  kind: UpcomingTrackerItemKind;
  discriminator: string;
  date: CalendarValue;
  stamp: string;
  summary: string;
  description: string;
  applicationUrl: string | null;
}): CalendarEvent {
  const uid = `${stableEventId(input.jobKey, input.discriminator)}@timley.local`;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${input.stamp}`,
    input.date.startLine,
  ];
  if (input.date.endLine) lines.push(input.date.endLine);
  lines.push(`SUMMARY:${escapeIcsText(input.summary)}`);
  lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.applicationUrl) lines.push(`URL:${input.applicationUrl}`);
  lines.push("STATUS:CONFIRMED", "END:VEVENT");
  return { uid, sortTime: input.date.sortTime, lines };
}

function parseBackupRecord(value: unknown): ApplicationRecord | null {
  if (!isRecord(value)) return null;
  const candidate =
    value.stage === "oa"
      ? { ...value, stage: "assessment" }
      : value;
  return parseApplicationRecord(candidate);
}

function parseCalendarValue(value: string): CalendarValue | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const dayNumber = strictDayNumber(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    );
    if (dayNumber === null) return null;
    const compact = `${dateOnly[1]}${dateOnly[2]}${dateOnly[3]}`;
    return {
      date: value,
      dayNumber,
      sortTime: dayNumber * DAY_MS,
      startLine: `DTSTART;VALUE=DATE:${compact}`,
      endLine: `DTEND;VALUE=DATE:${compactDate(dayNumber + 1)}`,
    };
  }

  const floating = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (floating) {
    const dayNumber = strictDayNumber(
      Number(floating[1]),
      Number(floating[2]),
      Number(floating[3]),
    );
    const hours = Number(floating[4]);
    const minutes = Number(floating[5]);
    const seconds = Number(floating[6] ?? "0");
    if (
      dayNumber === null ||
      hours > 23 ||
      minutes > 59 ||
      seconds > 59
    ) {
      return null;
    }
    return {
      date: value,
      dayNumber,
      sortTime:
        dayNumber * DAY_MS +
        hours * 3_600_000 +
        minutes * 60_000 +
        seconds * 1_000,
      startLine: `DTSTART:${floating[1]}${floating[2]}${floating[3]}T${floating[4]}${floating[5]}${(floating[6] ?? "00").padStart(2, "0")}`,
    };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: value,
    dayNumber: Math.floor(
      Date.UTC(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
      ) / DAY_MS,
    ),
    sortTime: parsed.getTime(),
    startLine: `DTSTART:${toIcsUtc(parsed)}`,
  };
}

function dayNumberForToday(value: Date | string): number {
  if (typeof value === "string") {
    const parsed = parseCalendarValue(value);
    if (parsed) return parsed.dayNumber;
  } else if (!Number.isNaN(value.getTime())) {
    return Math.floor(
      Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
      ) / DAY_MS,
    );
  }
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS,
  );
}

function strictDayNumber(
  year: number,
  month: number,
  day: number,
): number | null {
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / DAY_MS);
}

function compactDate(dayNumber: number): string {
  const date = new Date(dayNumber * DAY_MS);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function stableEventId(jobKey: string, discriminator: string): string {
  let hash = 0x811c9dc5;
  const input = `${jobKey}\u001f${discriminator}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `timley-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function compareRecordEntries(
  [aKey, aRecord]: [string, ApplicationRecord],
  [bKey, bRecord]: [string, ApplicationRecord],
): number {
  const a = recordFields(aRecord);
  const b = recordFields(bRecord);
  return (
    (a.company ?? "").localeCompare(b.company ?? "") ||
    (a.jobTitle ?? "").localeCompare(b.jobTitle ?? "") ||
    aKey.localeCompare(bKey)
  );
}

function labelForRecord(
  jobKey: string,
  record: TrackerRecordFields,
): string {
  if (record.jobTitle && record.company) {
    return `${record.jobTitle} at ${record.company}`;
  }
  return record.jobTitle ?? record.company ?? hostname(jobKey);
}

function hostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "") || "Application";
  } catch {
    return "Application";
  }
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    saved: "Saved",
    preparing: "Preparing",
    applied: "Applied",
    assessment: "Assessment",
    oa: "Assessment",
    interview: "Interview",
    offer: "Offer",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    archived: "Archived",
  };
  return labels[stage] ?? stage;
}

function recordFields(record: ApplicationRecord): TrackerRecordFields {
  return record as unknown as TrackerRecordFields;
}

function validSavedJobs(values: readonly unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    const url = safeHttpUrl(value);
    if (url) result.add(url);
  }
  return [...result].sort((a, b) => a.localeCompare(b));
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? trimmed
      : null;
  } catch {
    return null;
  }
}

function safeJobKey(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 4096 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !unsafeRecordKeys.has(value)
  );
}

function isDateValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { Internship } from "@/lib/types";

export const APPLICATION_STORAGE_KEY = "timley:applications:v3";
export const LEGACY_APPLICATION_STORAGE_KEY = "timley:applications:v2";
export const LEGACY_APPLIED_STORAGE_KEY = "timley:applied";
export const LEGACY_SAVED_STORAGE_KEY = "timley:saved";

export const TRACKED_APPLICATION_STAGES = [
  "saved",
  "preparing",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type TrackedApplicationStage =
  (typeof TRACKED_APPLICATION_STAGES)[number];

export const APPLICATION_STAGES = [
  "not_applied",
  ...TRACKED_APPLICATION_STAGES,
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Forward pipeline order used by tracker views, filters, and stage sorting. */
export const APPLICATION_STAGE_ORDER: readonly ApplicationStage[] = [
  ...TRACKED_APPLICATION_STAGES,
  "not_applied",
];

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  not_applied: "Not tracked",
  saved: "Saved",
  preparing: "Preparing",
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

export interface ApplicationRecord {
  stage: TrackedApplicationStage;
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

export type ApplicationRecords = Record<string, ApplicationRecord>;

export type ApplicationRecordPatch = Partial<
  Omit<ApplicationRecord, "updatedAt">
>;

export interface ApplicationRecordInput extends ApplicationRecordPatch {
  jobKey?: string;
  job?: Internship;
}

export interface ApplicationMigrationInput {
  v3Raw: string | null;
  v2Raw: string | null;
  legacyAppliedRaw: string | null;
  savedRaw: string | null;
  jobs?: readonly Internship[];
  now?: string;
}

export interface ApplicationMigrationResult {
  records: ApplicationRecords;
  source: "v3" | "v2" | "legacy" | "saved" | "empty";
  shouldPersist: boolean;
  migratedCount: number;
}

interface LegacyV2Record {
  stage: "applied" | "oa" | "interview" | "rejected" | "offer";
  updatedAt: string;
  appliedAt?: string;
}

const trackedStageSet = new Set<string>(TRACKED_APPLICATION_STAGES);
const legacyStageSet = new Set<string>([
  "applied",
  "oa",
  "interview",
  "rejected",
  "offer",
]);
const unsafeRecordKeys = new Set(["__proto__", "constructor", "prototype"]);
const stagesWithoutAppliedDate = new Set<TrackedApplicationStage>([
  "saved",
  "preparing",
]);
const stagesThatImplyApplication = new Set<TrackedApplicationStage>([
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
]);

const textFields = [
  "jobTitle",
  "company",
  "nextAction",
  "notes",
  "applicationUrl",
  "contact",
  "compensationNotes",
  "locationArrangement",
] as const satisfies ReadonlyArray<keyof ApplicationRecord>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrackedStage(value: unknown): value is TrackedApplicationStage {
  return typeof value === "string" && trackedStageSet.has(value);
}

function isLegacyStage(value: unknown): value is LegacyV2Record["stage"] {
  return typeof value === "string" && legacyStageSet.has(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function safeJobKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !unsafeRecordKeys.has(value)
  );
}

function validNow(value: string | undefined): string {
  return isTimestamp(value) ? value : new Date().toISOString();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function optionalTimestamp(value: unknown): string | undefined {
  return isTimestamp(value) ? value : undefined;
}

function applicationUrlFromKey(jobKey: string): string | undefined {
  try {
    const url = new URL(jobKey);
    return url.protocol === "http:" || url.protocol === "https:"
      ? jobKey
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeInterviewDates(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dates = [...new Set(value.filter(isTimestamp))];
  return dates.length > 0 ? dates : undefined;
}

/**
 * Validate one v3 record and discard unknown, empty, or invalid optional data.
 * Stage and updatedAt are required; an invalid required value rejects the row.
 */
export function parseApplicationRecord(
  value: unknown,
): ApplicationRecord | null {
  if (!isRecord(value)) return null;
  if (!isTrackedStage(value.stage) || !isTimestamp(value.updatedAt)) return null;

  const record: ApplicationRecord = {
    stage: value.stage,
    updatedAt: value.updatedAt,
  };

  for (const field of textFields) {
    const text = optionalText(value[field]);
    if (text !== undefined) record[field] = text;
  }

  const savedAt = optionalTimestamp(value.savedAt);
  if (savedAt) record.savedAt = savedAt;

  const appliedAt = optionalTimestamp(value.appliedAt);
  if (appliedAt && !stagesWithoutAppliedDate.has(record.stage)) {
    record.appliedAt = appliedAt;
  }

  const nextActionAt = optionalTimestamp(value.nextActionAt);
  if (nextActionAt) record.nextActionAt = nextActionAt;

  const interviewDates = normalizeInterviewDates(value.interviewDates);
  if (interviewDates) record.interviewDates = interviewDates;

  return record;
}

/**
 * Parse and validate the v3 localStorage map. Invalid rows are ignored while
 * valid rows remain usable. A corrupt top-level value safely becomes empty.
 */
export function parseApplicationRecords(raw: string | null): ApplicationRecords {
  if (!raw) return {};

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {};

    const records: ApplicationRecords = {};
    for (const [jobKey, candidate] of Object.entries(value)) {
      if (!safeJobKey(jobKey)) continue;
      const record = parseApplicationRecord(candidate);
      if (record) records[jobKey] = record;
    }
    return records;
  } catch {
    return {};
  }
}

export function serializeApplicationRecords(records: ApplicationRecords): string {
  return JSON.stringify(records);
}

function parseLegacyV2Records(raw: string | null): Record<string, LegacyV2Record> {
  if (!raw) return {};

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {};

    const records: Record<string, LegacyV2Record> = {};
    for (const [jobKey, candidate] of Object.entries(value)) {
      if (!safeJobKey(jobKey) || !isRecord(candidate)) continue;
      if (
        !isLegacyStage(candidate.stage) ||
        !isTimestamp(candidate.updatedAt)
      ) {
        continue;
      }

      const record: LegacyV2Record = {
        stage: candidate.stage,
        updatedAt: candidate.updatedAt,
      };
      if (isTimestamp(candidate.appliedAt)) {
        record.appliedAt = candidate.appliedAt;
      }
      records[jobKey] = record;
    }
    return records;
  } catch {
    return {};
  }
}

function parseLegacyKeySet(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(safeJobKey))];
  } catch {
    return [];
  }
}

function snapshotForKey(
  jobsByLink: ReadonlyMap<string, Internship>,
  jobKey: string,
): ApplicationRecordPatch {
  const job = jobsByLink.get(jobKey);
  if (job) return applicationSnapshotFromJob(job);

  const applicationUrl = applicationUrlFromKey(jobKey);
  return applicationUrl ? { applicationUrl } : {};
}

function mapLegacyStage(
  stage: LegacyV2Record["stage"],
): TrackedApplicationStage {
  return stage === "oa" ? "assessment" : stage;
}

/**
 * Build v3 records without mutating storage. Presence of the v3 key is always
 * authoritative, including an intentionally empty or corrupt value.
 */
export function migrateApplicationRecords({
  v3Raw,
  v2Raw,
  legacyAppliedRaw,
  savedRaw,
  jobs = [],
  now,
}: ApplicationMigrationInput): ApplicationMigrationResult {
  if (v3Raw !== null) {
    return {
      records: parseApplicationRecords(v3Raw),
      source: "v3",
      shouldPersist: false,
      migratedCount: 0,
    };
  }

  const timestamp = validNow(now);
  const jobsByLink = new Map<string, Internship>();
  for (const job of jobs) {
    if (!jobsByLink.has(job.link)) jobsByLink.set(job.link, job);
  }

  const v2Records = parseLegacyV2Records(v2Raw);
  const legacyAppliedKeys = parseLegacyKeySet(legacyAppliedRaw);
  const savedKeys = parseLegacyKeySet(savedRaw);
  const records: ApplicationRecords = {};

  for (const [jobKey, legacy] of Object.entries(v2Records)) {
    const candidate: ApplicationRecord = {
      ...snapshotForKey(jobsByLink, jobKey),
      stage: mapLegacyStage(legacy.stage),
      updatedAt: legacy.updatedAt,
    };
    if (legacy.appliedAt) candidate.appliedAt = legacy.appliedAt;
    const record = parseApplicationRecord(candidate);
    if (record) records[jobKey] = record;
  }

  for (const jobKey of legacyAppliedKeys) {
    if (Object.hasOwn(records, jobKey)) continue;
    records[jobKey] = {
      ...snapshotForKey(jobsByLink, jobKey),
      stage: "applied",
      updatedAt: timestamp,
      appliedAt: timestamp,
    };
  }

  for (const jobKey of savedKeys) {
    if (Object.hasOwn(records, jobKey)) continue;
    records[jobKey] = {
      ...snapshotForKey(jobsByLink, jobKey),
      stage: "saved",
      updatedAt: timestamp,
      savedAt: timestamp,
    };
  }

  const source =
    Object.keys(v2Records).length > 0
      ? "v2"
      : legacyAppliedKeys.length > 0
        ? "legacy"
        : savedKeys.length > 0
          ? "saved"
          : "empty";

  return {
    records,
    source,
    shouldPersist: true,
    migratedCount: Object.keys(records).length,
  };
}

export function applicationSnapshotFromJob(
  job: Internship,
): ApplicationRecordPatch {
  const snapshot: ApplicationRecordPatch = {};
  const jobTitle = optionalText(job.title);
  const company = optionalText(job.company);
  const applicationUrl = optionalText(job.link);
  const locationArrangement = optionalText(job.location);

  if (jobTitle) snapshot.jobTitle = jobTitle;
  if (company) snapshot.company = company;
  if (applicationUrl) snapshot.applicationUrl = applicationUrl;
  if (locationArrangement) {
    snapshot.locationArrangement = locationArrangement;
  }
  return snapshot;
}

function fillMissingSnapshot(
  record: ApplicationRecord,
  snapshot: ApplicationRecordPatch | undefined,
): ApplicationRecord {
  if (!snapshot) return record;
  const next = { ...record };
  for (const field of [
    "jobTitle",
    "company",
    "applicationUrl",
    "locationArrangement",
  ] as const) {
    if (!next[field] && snapshot[field]) next[field] = snapshot[field];
  }
  return next;
}

export function getApplicationRecord(
  records: ApplicationRecords,
  jobKey: string,
): ApplicationRecord | undefined {
  return (
    records[jobKey] ??
    Object.values(records).find(
      (record) => record.applicationUrl === jobKey,
    )
  );
}

export function getApplicationStage(
  records: ApplicationRecords,
  jobKey: string,
): ApplicationStage {
  return getApplicationRecord(records, jobKey)?.stage ?? "not_applied";
}

/**
 * Apply a stage while preserving rich record data. Not tracked remains a
 * virtual stage and therefore removes the record.
 */
export function setApplicationStage(
  records: ApplicationRecords,
  jobKey: string,
  stage: ApplicationStage,
  now = new Date().toISOString(),
  snapshot?: ApplicationRecordPatch,
): ApplicationRecords {
  if (!safeJobKey(jobKey)) return records;
  if (stage === "not_applied") return resetApplicationStage(records, jobKey);

  const previous = records[jobKey];
  const timestamp = validNow(now);
  let nextRecord: ApplicationRecord = previous
    ? { ...previous }
    : {
        stage,
        updatedAt: timestamp,
        savedAt: timestamp,
        ...(applicationUrlFromKey(jobKey)
          ? { applicationUrl: applicationUrlFromKey(jobKey) }
          : {}),
      };

  nextRecord = fillMissingSnapshot(nextRecord, snapshot);
  if (previous?.stage === stage && nextRecord === previous) return records;

  const metadataChanged =
    nextRecord.jobTitle !== previous?.jobTitle ||
    nextRecord.company !== previous?.company ||
    nextRecord.applicationUrl !== previous?.applicationUrl ||
    nextRecord.locationArrangement !== previous?.locationArrangement;
  if (previous?.stage === stage && !metadataChanged) return records;

  nextRecord.stage = stage;
  nextRecord.updatedAt = timestamp;

  if (stagesWithoutAppliedDate.has(stage)) {
    delete nextRecord.appliedAt;
  } else if (
    !nextRecord.appliedAt &&
    stagesThatImplyApplication.has(stage)
  ) {
    nextRecord.appliedAt = timestamp;
  }

  const normalized = parseApplicationRecord(nextRecord);
  if (!normalized) return records;
  return { ...records, [jobKey]: normalized };
}

export function updateApplicationRecord(
  records: ApplicationRecords,
  jobKey: string,
  patch: ApplicationRecordPatch,
  now = new Date().toISOString(),
): ApplicationRecords {
  if (!safeJobKey(jobKey) || !records[jobKey]) return records;

  if (
    Object.hasOwn(patch, "stage") &&
    patch.stage !== undefined &&
    !isTrackedStage(patch.stage)
  ) {
    return records;
  }

  const candidate: Record<string, unknown> = {
    ...records[jobKey],
    ...patch,
    updatedAt: validNow(now),
  };
  const normalized = parseApplicationRecord(candidate);
  if (!normalized) return records;
  return { ...records, [jobKey]: normalized };
}

export function ensureSavedApplication(
  records: ApplicationRecords,
  jobKey: string,
  now = new Date().toISOString(),
  snapshot?: ApplicationRecordPatch,
): ApplicationRecords {
  if (!safeJobKey(jobKey)) return records;
  const previous = records[jobKey];
  if (!previous) {
    return setApplicationStage(records, jobKey, "saved", now, snapshot);
  }

  const timestamp = validNow(now);
  let nextRecord = fillMissingSnapshot(previous, snapshot);
  if (!nextRecord.savedAt) {
    nextRecord = { ...nextRecord, savedAt: timestamp };
  }
  if (nextRecord === previous) return records;

  nextRecord.updatedAt = timestamp;
  const normalized = parseApplicationRecord(nextRecord);
  return normalized ? { ...records, [jobKey]: normalized } : records;
}

export function resetApplicationStage(
  records: ApplicationRecords,
  jobKey: string,
): ApplicationRecords {
  if (!Object.hasOwn(records, jobKey)) return records;
  const next = { ...records };
  delete next[jobKey];
  return next;
}

export function restoreApplicationRecord(
  records: ApplicationRecords,
  jobKey: string,
  record: ApplicationRecord,
): ApplicationRecords {
  if (!safeJobKey(jobKey)) return records;
  const normalized = parseApplicationRecord(record);
  return normalized ? { ...records, [jobKey]: normalized } : records;
}

/**
 * Merge backup data conservatively: missing rows are restored and the record
 * with the latest valid updatedAt wins a same-key conflict.
 */
export function mergeApplicationRecords(
  current: ApplicationRecords,
  incoming: ApplicationRecords,
): ApplicationRecords {
  let next = current;
  for (const [jobKey, candidate] of Object.entries(incoming)) {
    if (!safeJobKey(jobKey)) continue;
    const normalized = parseApplicationRecord(candidate);
    if (!normalized) continue;

    const existing = next[jobKey];
    if (
      existing &&
      Date.parse(existing.updatedAt) > Date.parse(normalized.updatedAt)
    ) {
      continue;
    }
    if (next === current) next = { ...current };
    next[jobKey] = normalized;
  }
  return next;
}

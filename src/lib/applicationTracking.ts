export const APPLICATION_STORAGE_KEY = "timley:applications:v2";
export const LEGACY_APPLIED_STORAGE_KEY = "timley:applied";

export const APPLICATION_STAGES = [
  "not_applied",
  "applied",
  "oa",
  "interview",
  "rejected",
  "offer",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Display/sort order for the application pipeline. */
export const APPLICATION_STAGE_ORDER: readonly ApplicationStage[] = [
  "offer",
  "interview",
  "oa",
  "applied",
  "rejected",
  "not_applied",
];

export const TRACKED_APPLICATION_STAGES = [
  "applied",
  "oa",
  "interview",
  "rejected",
  "offer",
] as const;

export type TrackedApplicationStage = (typeof TRACKED_APPLICATION_STAGES)[number];

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  oa: "OA / Assessment",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
};

export interface ApplicationRecord {
  stage: TrackedApplicationStage;
  updatedAt: string;
  appliedAt?: string;
}

export type ApplicationRecords = Record<string, ApplicationRecord>;

export interface ApplicationMigrationResult {
  records: ApplicationRecords;
  source: "v2" | "legacy" | "empty";
  shouldPersist: boolean;
  migratedCount: number;
}

const trackedStageSet = new Set<string>(TRACKED_APPLICATION_STAGES);
const unsafeRecordKeys = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrackedStage(value: unknown): value is TrackedApplicationStage {
  return typeof value === "string" && trackedStageSet.has(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function safeJobKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !unsafeRecordKeys.has(value)
  );
}

/**
 * Parse and validate the v2 localStorage map. Corrupt entries are ignored while
 * valid entries remain usable. A corrupt top-level value safely becomes empty.
 */
export function parseApplicationRecords(raw: string | null): ApplicationRecords {
  if (!raw) return {};

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {};

    const records: ApplicationRecords = {};
    for (const [jobKey, candidate] of Object.entries(value)) {
      if (!safeJobKey(jobKey) || !isRecord(candidate)) continue;
      if (!isTrackedStage(candidate.stage) || !isTimestamp(candidate.updatedAt)) continue;

      const record: ApplicationRecord = {
        stage: candidate.stage,
        updatedAt: candidate.updatedAt,
      };
      if (isTimestamp(candidate.appliedAt)) record.appliedAt = candidate.appliedAt;
      records[jobKey] = record;
    }
    return records;
  } catch {
    return {};
  }
}

export function serializeApplicationRecords(records: ApplicationRecords): string {
  return JSON.stringify(records);
}

function parseLegacyApplied(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(safeJobKey))];
  } catch {
    return [];
  }
}

/**
 * Build the initial v2 map without mutating storage. Presence of the v2 key is
 * authoritative, even if it contains an empty or corrupt value, so a user who
 * intentionally cleared v2 data is never re-populated from the legacy key.
 */
export function migrateApplicationRecords(
  v2Raw: string | null,
  legacyAppliedRaw: string | null,
  now = new Date().toISOString(),
): ApplicationMigrationResult {
  if (v2Raw !== null) {
    return {
      records: parseApplicationRecords(v2Raw),
      source: "v2",
      shouldPersist: false,
      migratedCount: 0,
    };
  }

  const timestamp = isTimestamp(now) ? now : new Date().toISOString();
  const legacyKeys = parseLegacyApplied(legacyAppliedRaw);
  const records: ApplicationRecords = {};
  for (const jobKey of legacyKeys) {
    records[jobKey] = {
      stage: "applied",
      updatedAt: timestamp,
      appliedAt: timestamp,
    };
  }

  return {
    records,
    source: legacyKeys.length > 0 ? "legacy" : "empty",
    // Persist even an empty map. Its existence is the one-time migration marker.
    shouldPersist: true,
    migratedCount: legacyKeys.length,
  };
}

export function getApplicationRecord(
  records: ApplicationRecords,
  jobKey: string,
): ApplicationRecord | undefined {
  return records[jobKey];
}

export function getApplicationStage(
  records: ApplicationRecords,
  jobKey: string,
): ApplicationStage {
  return records[jobKey]?.stage ?? "not_applied";
}

/** Return a new map with a stage applied, or delete the record for Not applied. */
export function setApplicationStage(
  records: ApplicationRecords,
  jobKey: string,
  stage: ApplicationStage,
  now = new Date().toISOString(),
): ApplicationRecords {
  if (!safeJobKey(jobKey)) return records;
  if (stage === "not_applied") return resetApplicationStage(records, jobKey);

  const previous = records[jobKey];
  if (previous?.stage === stage) return records;

  const timestamp = isTimestamp(now) ? now : new Date().toISOString();
  return {
    ...records,
    [jobKey]: {
      stage,
      updatedAt: timestamp,
      appliedAt: previous?.appliedAt ?? timestamp,
    },
  };
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

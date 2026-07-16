export const APPLICATION_STORAGE_KEY = "timley:applications:v3";
export const APPLICATION_V2_STORAGE_KEY = "timley:applications:v2";
export const LEGACY_APPLIED_STORAGE_KEY = "timley:applied";
export const APPLICATION_BROADCAST_CHANNEL = "timley:applications:v3";

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

export const APPLICATION_STORE_VERSION = 3 as const;
export const MAX_TRACKING_RECORDS = 10_000;
export const MAX_TRACKING_KEY_LENGTH = 2_048;
export const MAX_APPLICATION_NOTES_LENGTH = 20_000;
export const MAX_APPLICATION_CONTACT_LENGTH = 1_000;

export interface ApplicationRecord {
  stage: TrackedApplicationStage;
  updatedAt: string;
  appliedAt?: string;
  notes?: string;
  nextActionAt?: string;
  deadline?: string;
  recruiter?: string;
  contact?: string;
}

export type ApplicationRecords = Record<string, ApplicationRecord>;
export type ApplicationTombstones = Record<string, string>;

/**
 * Persisted v3 state. `unmatched` retains URL-keyed data that cannot yet be
 * associated with an immutable tracking key. Tombstones make cross-tab
 * deletion merges deterministic and prevent stale tabs from restoring data.
 */
export interface ApplicationStoreV3 {
  version: typeof APPLICATION_STORE_VERSION;
  records: ApplicationRecords;
  unmatched: ApplicationRecords;
  tombstones: ApplicationTombstones;
}

export type TrackingKeyAliasMap =
  | Readonly<Record<string, string>>
  | ReadonlyMap<string, string>;

export interface ApplicationMigrationResult {
  store: ApplicationStoreV3;
  /** Compatibility/convenience view consumed by filters and cards. */
  records: ApplicationRecords;
  unmatched: ApplicationRecords;
  source: "v3" | "v2" | "legacy" | "empty";
  shouldPersist: boolean;
  migratedCount: number;
  unmatchedCount: number;
}

export interface ApplicationRecordDetailsPatch {
  notes?: string | null;
  nextActionAt?: string | null;
  deadline?: string | null;
  recruiter?: string | null;
  contact?: string | null;
}

const trackedStageSet = new Set<string>(TRACKED_APPLICATION_STAGES);
const unsafeRecordKeys = new Set(["__proto__", "constructor", "prototype"]);
const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTrackedApplicationStage(
  value: unknown,
): value is TrackedApplicationStage {
  return typeof value === "string" && trackedStageSet.has(value);
}

export function isTrackingTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return false;
  }
  const match = isoTimestampPattern.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] ? Number(match[8]) : 0;
  const offsetMinute = match[9] ? Number(match[9]) : 0;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || offsetMinute === 0)
  );
}

export function isSafeTrackingKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TRACKING_KEY_LENGTH &&
    value.trim() === value &&
    !unsafeRecordKeys.has(value)
  );
}

function isOptionalText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}

export function parseApplicationRecord(
  candidate: unknown,
): ApplicationRecord | null {
  if (!isRecord(candidate)) return null;
  if (
    !isTrackedApplicationStage(candidate.stage) ||
    !isTrackingTimestamp(candidate.updatedAt)
  ) {
    return null;
  }

  const record: ApplicationRecord = {
    stage: candidate.stage,
    updatedAt: candidate.updatedAt,
  };
  if (isTrackingTimestamp(candidate.appliedAt)) {
    record.appliedAt = candidate.appliedAt;
  }
  if (isOptionalText(candidate.notes, MAX_APPLICATION_NOTES_LENGTH)) {
    record.notes = candidate.notes;
  }
  if (isTrackingTimestamp(candidate.nextActionAt)) {
    record.nextActionAt = candidate.nextActionAt;
  }
  if (isTrackingTimestamp(candidate.deadline)) {
    record.deadline = candidate.deadline;
  }
  if (isOptionalText(candidate.recruiter, MAX_APPLICATION_CONTACT_LENGTH)) {
    record.recruiter = candidate.recruiter;
  }
  if (isOptionalText(candidate.contact, MAX_APPLICATION_CONTACT_LENGTH)) {
    record.contact = candidate.contact;
  }
  return record;
}

/**
 * Parse a URL-keyed v2 map. Invalid entries are ignored so one corrupt record
 * cannot hide all otherwise recoverable browser-owned state.
 */
export function parseApplicationRecords(raw: string | null): ApplicationRecords {
  if (!raw) return {};

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {};

    const records: ApplicationRecords = {};
    for (const [jobKey, candidate] of Object.entries(value).slice(
      0,
      MAX_TRACKING_RECORDS,
    )) {
      if (!isSafeTrackingKey(jobKey)) continue;
      const record = parseApplicationRecord(candidate);
      if (record) records[jobKey] = record;
    }
    return records;
  } catch {
    return {};
  }
}

function parseTombstones(candidate: unknown): ApplicationTombstones {
  if (!isRecord(candidate)) return {};
  const tombstones: ApplicationTombstones = {};
  for (const [trackingKey, timestamp] of Object.entries(candidate).slice(
    0,
    MAX_TRACKING_RECORDS,
  )) {
    if (isSafeTrackingKey(trackingKey) && isTrackingTimestamp(timestamp)) {
      tombstones[trackingKey] = timestamp;
    }
  }
  return tombstones;
}

export function createEmptyApplicationStore(): ApplicationStoreV3 {
  return {
    version: APPLICATION_STORE_VERSION,
    records: {},
    unmatched: {},
    tombstones: {},
  };
}

/** Parse browser storage defensively. Invalid v3 data becomes an empty store. */
export function parseApplicationStore(raw: string | null): ApplicationStoreV3 {
  if (!raw) return createEmptyApplicationStore();
  try {
    const candidate: unknown = JSON.parse(raw);
    if (
      !isRecord(candidate) ||
      candidate.version !== APPLICATION_STORE_VERSION
    ) {
      return createEmptyApplicationStore();
    }
    return normalizeApplicationStore({
      version: APPLICATION_STORE_VERSION,
      records: parseApplicationRecordsValue(candidate.records),
      unmatched: parseApplicationRecordsValue(candidate.unmatched),
      tombstones: parseTombstones(candidate.tombstones),
    });
  } catch {
    return createEmptyApplicationStore();
  }
}

function parseApplicationRecordsValue(value: unknown): ApplicationRecords {
  if (!isRecord(value)) return {};
  const records: ApplicationRecords = {};
  for (const [key, candidate] of Object.entries(value).slice(
    0,
    MAX_TRACKING_RECORDS,
  )) {
    if (!isSafeTrackingKey(key)) continue;
    const record = parseApplicationRecord(candidate);
    if (record) records[key] = record;
  }
  return records;
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function serializeApplicationRecords(records: ApplicationRecords): string {
  return JSON.stringify(sortRecord(records));
}

export function serializeApplicationStore(store: ApplicationStoreV3): string {
  const normalized = normalizeApplicationStore(store);
  return JSON.stringify({
    version: APPLICATION_STORE_VERSION,
    records: sortRecord(normalized.records),
    unmatched: sortRecord(normalized.unmatched),
    tombstones: sortRecord(normalized.tombstones),
  });
}

export function applicationStoresEqual(
  left: ApplicationStoreV3,
  right: ApplicationStoreV3,
): boolean {
  return serializeApplicationStore(left) === serializeApplicationStore(right);
}

function aliasEntries(
  aliases: TrackingKeyAliasMap,
): ReadonlyArray<readonly [string, string]> {
  if (aliases instanceof Map) return [...aliases.entries()];
  return Object.entries(aliases);
}

function normalizeAliases(aliases: TrackingKeyAliasMap): {
  byLegacyKey: Map<string, string>;
  knownTrackingKeys: Set<string>;
} {
  const byLegacyKey = new Map<string, string>();
  const knownTrackingKeys = new Set<string>();
  for (const [legacyKey, trackingKey] of aliasEntries(aliases)) {
    if (!isSafeTrackingKey(legacyKey) || !isSafeTrackingKey(trackingKey)) {
      continue;
    }
    byLegacyKey.set(legacyKey, trackingKey);
    knownTrackingKeys.add(trackingKey);
  }
  return { byLegacyKey, knownTrackingKeys };
}

function resolveTrackingKey(
  legacyKey: string,
  aliases: ReturnType<typeof normalizeAliases>,
): string | null {
  return (
    aliases.byLegacyKey.get(legacyKey) ??
    (aliases.knownTrackingKeys.has(legacyKey) ? legacyKey : null)
  );
}

function parseLegacyApplied(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .slice(0, MAX_TRACKING_RECORDS)
          .filter(isSafeTrackingKey),
      ),
    ];
  } catch {
    return [];
  }
}

function timestampMillis(timestamp: string): number {
  return Date.parse(timestamp);
}

/** Last-write-wins with a deterministic tie break for equal timestamps. */
export function mergeApplicationRecord(
  left: ApplicationRecord,
  right: ApplicationRecord,
): ApplicationRecord {
  const timeDifference =
    timestampMillis(left.updatedAt) - timestampMillis(right.updatedAt);
  let winner: ApplicationRecord;
  if (timeDifference > 0) winner = left;
  else if (timeDifference < 0) winner = right;
  else {
    winner =
      JSON.stringify(left).localeCompare(JSON.stringify(right)) >= 0
        ? left
        : right;
  }
  return { ...winner };
}

function addMigratedRecord(
  records: ApplicationRecords,
  trackingKey: string,
  record: ApplicationRecord,
): void {
  const current = records[trackingKey];
  records[trackingKey] = current
    ? mergeApplicationRecord(current, record)
    : { ...record };
}

function addUnmatchedRecord(
  unmatched: ApplicationRecords,
  legacyKey: string,
  record: ApplicationRecord,
): void {
  const current = unmatched[legacyKey];
  unmatched[legacyKey] = current
    ? mergeApplicationRecord(current, record)
    : { ...record };
}

/**
 * Move newly resolvable recovery records into the tracking-key map. Calling
 * this repeatedly with the same alias map returns the original store.
 */
export function recoverUnmatchedApplicationRecords(
  store: ApplicationStoreV3,
  aliasMap: TrackingKeyAliasMap,
): { store: ApplicationStoreV3; recoveredCount: number } {
  const aliases = normalizeAliases(aliasMap);
  const records = { ...store.records };
  const unmatched = { ...store.unmatched };
  let recoveredCount = 0;

  for (const [legacyKey, record] of Object.entries(store.unmatched)) {
    const trackingKey = resolveTrackingKey(legacyKey, aliases);
    if (!trackingKey) continue;
    addMigratedRecord(records, trackingKey, record);
    delete unmatched[legacyKey];
    recoveredCount += 1;
  }

  if (recoveredCount === 0) return { store, recoveredCount };
  return {
    store: normalizeApplicationStore({ ...store, records, unmatched }),
    recoveredCount,
  };
}

/**
 * Idempotently migrate URL-keyed v2 records (or the older applied URL array)
 * into v3. A present v3 key is authoritative, including a corrupt/empty one,
 * but recovery aliases may still resolve records retained in `unmatched`.
 */
export function migrateApplicationRecords(
  v3Raw: string | null,
  v2Raw: string | null,
  legacyAppliedRaw: string | null,
  aliasMap: TrackingKeyAliasMap = {},
  now = new Date().toISOString(),
): ApplicationMigrationResult {
  if (v3Raw !== null) {
    const parsed = parseApplicationStore(v3Raw);
    const recovery = recoverUnmatchedApplicationRecords(parsed, aliasMap);
    return migrationResult(
      recovery.store,
      "v3",
      recovery.recoveredCount > 0,
      recovery.recoveredCount,
    );
  }

  const aliases = normalizeAliases(aliasMap);
  const records: ApplicationRecords = {};
  const unmatched: ApplicationRecords = {};
  let source: ApplicationMigrationResult["source"] = "empty";
  let processedCount = 0;

  if (v2Raw !== null) {
    source = "v2";
    const v2Records = parseApplicationRecords(v2Raw);
    processedCount = Object.keys(v2Records).length;
    for (const [legacyKey, record] of Object.entries(v2Records)) {
      const trackingKey = resolveTrackingKey(legacyKey, aliases);
      if (trackingKey) addMigratedRecord(records, trackingKey, record);
      else addUnmatchedRecord(unmatched, legacyKey, record);
    }
  } else {
    const timestamp = isTrackingTimestamp(now)
      ? now
      : new Date().toISOString();
    const legacyKeys = parseLegacyApplied(legacyAppliedRaw);
    processedCount = legacyKeys.length;
    if (legacyKeys.length > 0) source = "legacy";
    for (const legacyKey of legacyKeys) {
      const record: ApplicationRecord = {
        stage: "applied",
        updatedAt: timestamp,
        appliedAt: timestamp,
      };
      const trackingKey = resolveTrackingKey(legacyKey, aliases);
      if (trackingKey) addMigratedRecord(records, trackingKey, record);
      else addUnmatchedRecord(unmatched, legacyKey, record);
    }
  }

  const store = normalizeApplicationStore({
    version: APPLICATION_STORE_VERSION,
    records,
    unmatched,
    tombstones: {},
  });
  return migrationResult(
    store,
    source,
    // Persist an empty envelope as the one-time migration marker.
    true,
    processedCount,
  );
}

function migrationResult(
  store: ApplicationStoreV3,
  source: ApplicationMigrationResult["source"],
  shouldPersist: boolean,
  migratedCount: number,
): ApplicationMigrationResult {
  return {
    store,
    records: store.records,
    unmatched: store.unmatched,
    source,
    shouldPersist,
    migratedCount,
    unmatchedCount: Object.keys(store.unmatched).length,
  };
}

function normalizeApplicationStore(
  candidate: ApplicationStoreV3,
): ApplicationStoreV3 {
  const records = { ...candidate.records };
  const tombstones = { ...candidate.tombstones };

  for (const trackingKey of new Set([
    ...Object.keys(records),
    ...Object.keys(tombstones),
  ])) {
    const record = records[trackingKey];
    const deletedAt = tombstones[trackingKey];
    if (!record || !deletedAt) continue;
    if (timestampMillis(deletedAt) >= timestampMillis(record.updatedAt)) {
      delete records[trackingKey];
    } else {
      delete tombstones[trackingKey];
    }
  }

  return {
    version: APPLICATION_STORE_VERSION,
    records,
    unmatched: { ...candidate.unmatched },
    tombstones,
  };
}

/** Merge independently updated tabs without allowing stale deletions to win. */
export function mergeApplicationStores(
  left: ApplicationStoreV3,
  right: ApplicationStoreV3,
): ApplicationStoreV3 {
  const records: ApplicationRecords = {};
  const unmatched: ApplicationRecords = {};
  const tombstones: ApplicationTombstones = {};

  for (const trackingKey of new Set([
    ...Object.keys(left.records),
    ...Object.keys(right.records),
  ])) {
    const leftRecord = left.records[trackingKey];
    const rightRecord = right.records[trackingKey];
    if (leftRecord && rightRecord) {
      records[trackingKey] = mergeApplicationRecord(leftRecord, rightRecord);
    } else if (leftRecord) records[trackingKey] = { ...leftRecord };
    else if (rightRecord) records[trackingKey] = { ...rightRecord };
  }

  for (const legacyKey of new Set([
    ...Object.keys(left.unmatched),
    ...Object.keys(right.unmatched),
  ])) {
    const leftRecord = left.unmatched[legacyKey];
    const rightRecord = right.unmatched[legacyKey];
    if (leftRecord && rightRecord) {
      unmatched[legacyKey] = mergeApplicationRecord(leftRecord, rightRecord);
    } else if (leftRecord) unmatched[legacyKey] = { ...leftRecord };
    else if (rightRecord) unmatched[legacyKey] = { ...rightRecord };
  }

  for (const trackingKey of new Set([
    ...Object.keys(left.tombstones),
    ...Object.keys(right.tombstones),
  ])) {
    const leftTimestamp = left.tombstones[trackingKey];
    const rightTimestamp = right.tombstones[trackingKey];
    if (!leftTimestamp) tombstones[trackingKey] = rightTimestamp;
    else if (!rightTimestamp) tombstones[trackingKey] = leftTimestamp;
    else {
      tombstones[trackingKey] =
        timestampMillis(leftTimestamp) >= timestampMillis(rightTimestamp)
          ? leftTimestamp
          : rightTimestamp;
    }
  }

  return normalizeApplicationStore({
    version: APPLICATION_STORE_VERSION,
    records,
    unmatched,
    tombstones,
  });
}

export function getApplicationRecord(
  records: ApplicationRecords,
  trackingKey: string,
): ApplicationRecord | undefined {
  return records[trackingKey];
}

export function getApplicationStage(
  records: ApplicationRecords,
  trackingKey: string,
): ApplicationStage {
  return records[trackingKey]?.stage ?? "not_applied";
}

function usableTimestamp(now: string, previous?: string): string {
  const requested = isTrackingTimestamp(now) ? now : new Date().toISOString();
  if (!previous || timestampMillis(requested) > timestampMillis(previous)) {
    return requested;
  }
  return new Date(timestampMillis(previous) + 1).toISOString();
}

/** Return a new map with a stage applied, or delete for Not applied. */
export function setApplicationStage(
  records: ApplicationRecords,
  trackingKey: string,
  stage: ApplicationStage,
  now = new Date().toISOString(),
): ApplicationRecords {
  if (!isSafeTrackingKey(trackingKey)) return records;
  if (stage === "not_applied") return resetApplicationStage(records, trackingKey);

  const previous = records[trackingKey];
  if (previous?.stage === stage) return records;
  const timestamp = usableTimestamp(now, previous?.updatedAt);
  return {
    ...records,
    [trackingKey]: {
      ...previous,
      stage,
      updatedAt: timestamp,
      appliedAt: previous?.appliedAt ?? timestamp,
    },
  };
}

export function resetApplicationStage(
  records: ApplicationRecords,
  trackingKey: string,
): ApplicationRecords {
  if (!Object.hasOwn(records, trackingKey)) return records;
  const next = { ...records };
  delete next[trackingKey];
  return next;
}

export function setApplicationStoreStage(
  store: ApplicationStoreV3,
  trackingKey: string,
  stage: ApplicationStage,
  now = new Date().toISOString(),
): ApplicationStoreV3 {
  if (!isSafeTrackingKey(trackingKey)) return store;
  const previous = store.records[trackingKey];
  const deletedAt = store.tombstones[trackingKey];

  if (stage === "not_applied") {
    if (!previous) return store;
    const timestamp = usableTimestamp(now, previous.updatedAt);
    const records = { ...store.records };
    delete records[trackingKey];
    return {
      ...store,
      records,
      tombstones: { ...store.tombstones, [trackingKey]: timestamp },
    };
  }
  if (previous?.stage === stage) return store;

  const timestamp = usableTimestamp(
    now,
    [previous?.updatedAt, deletedAt]
      .filter(isTrackingTimestamp)
      .sort((left, right) => timestampMillis(right) - timestampMillis(left))[0],
  );
  const tombstones = { ...store.tombstones };
  delete tombstones[trackingKey];
  return {
    ...store,
    records: {
      ...store.records,
      [trackingKey]: {
        ...previous,
        stage,
        updatedAt: timestamp,
        appliedAt: previous?.appliedAt ?? timestamp,
      },
    },
    tombstones,
  };
}

function validateDetailsPatch(
  patch: ApplicationRecordDetailsPatch,
): ApplicationRecordDetailsPatch {
  const result: ApplicationRecordDetailsPatch = {};
  for (const field of ["nextActionAt", "deadline"] as const) {
    const value = patch[field];
    if (value === undefined || value === null || value === "") {
      if (value !== undefined) result[field] = null;
    } else if (isTrackingTimestamp(value)) result[field] = value;
    else throw new TypeError(`${field} must be a valid timestamp or null`);
  }
  for (const [field, maximumLength] of [
    ["notes", MAX_APPLICATION_NOTES_LENGTH],
    ["recruiter", MAX_APPLICATION_CONTACT_LENGTH],
    ["contact", MAX_APPLICATION_CONTACT_LENGTH],
  ] as const) {
    const value = patch[field];
    if (value === undefined || value === null || value === "") {
      if (value !== undefined) result[field] = null;
    } else if (typeof value === "string" && value.length <= maximumLength) {
      result[field] = value;
    } else throw new TypeError(`${field} is too long`);
  }
  return result;
}

export function updateApplicationRecordDetails(
  store: ApplicationStoreV3,
  trackingKey: string,
  patch: ApplicationRecordDetailsPatch,
  now = new Date().toISOString(),
): ApplicationStoreV3 {
  if (!isSafeTrackingKey(trackingKey)) return store;
  const previous = store.records[trackingKey];
  if (!previous) return store;
  const validated = validateDetailsPatch(patch);
  const next: ApplicationRecord = { ...previous };
  let changed = false;

  for (const field of [
    "notes",
    "nextActionAt",
    "deadline",
    "recruiter",
    "contact",
  ] as const) {
    const value = validated[field];
    if (value === undefined) continue;
    if (value === null) {
      if (next[field] !== undefined) {
        delete next[field];
        changed = true;
      }
    } else if (next[field] !== value) {
      next[field] = value;
      changed = true;
    }
  }
  if (!changed) return store;

  next.updatedAt = usableTimestamp(now, previous.updatedAt);
  return {
    ...store,
    records: { ...store.records, [trackingKey]: next },
  };
}

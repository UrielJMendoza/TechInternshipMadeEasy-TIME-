import {
  APPLICATION_STORAGE_KEY,
  LEGACY_SAVED_STORAGE_KEY,
  mergeApplicationRecords,
  parseApplicationRecord,
  parseApplicationRecords,
  serializeApplicationRecords,
  type ApplicationRecord,
  type ApplicationRecords,
} from "./applicationTracking";
import {
  BOARD_FILTER_STORAGE_KEY,
  DEFAULT_BOARD_FILTERS,
  parseStoredBoardFilters,
  type BoardFilters,
} from "./boardFilterState";
import {
  MAX_SAVED_SEARCHES,
  MAX_SAVED_SEARCH_STORAGE_LENGTH,
  MAX_SAVED_SEARCH_TOMBSTONES,
  SAVED_SEARCH_STORAGE_KEY,
  SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
  mergeSavedSearchStates,
  parseSavedSearch,
  parseSavedSearchTombstone,
  parseStoredSavedSearches,
  parseStoredSavedSearchTombstones,
  serializeSavedSearches,
  serializeSavedSearchTombstones,
  type SavedSearchState,
} from "./savedSearches";

export const CONTINUITY_SNAPSHOT_FORMAT = "timley-continuity-snapshot";
export const CONTINUITY_SNAPSHOT_VERSION = 1;
export const CONTINUITY_RECOVERY_FORMAT = "timley-continuity-recovery";
export const CONTINUITY_RECOVERY_VERSION = 1;

/**
 * Board filters predate continuity and therefore have no timestamp in their
 * original value. The UI can maintain this adjacent key whenever filters are
 * edited; first-time capture safely falls back to the capture time.
 */
export const BOARD_FILTER_UPDATED_AT_STORAGE_KEY =
  "timley:filters:updated-at:v1";
export const APPLICATION_TOMBSTONE_STORAGE_KEY =
  "timley:applications:tombstones:v1";
export const SAVED_JOB_UPDATED_AT_STORAGE_KEY =
  "timley:saved:updated-at:v1";
export const SAVED_JOB_TOMBSTONE_STORAGE_KEY =
  "timley:saved:tombstones:v1";

export const MAX_CONTINUITY_APPLICATIONS = 2_000;
export const MAX_CONTINUITY_SAVED_JOBS = 5_000;
export const MAX_CONTINUITY_APPLICATION_TOMBSTONES = 2_000;
export const MAX_CONTINUITY_SAVED_JOB_TOMBSTONES = 5_000;
export const MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH = 4_000_000;
export const MAX_CONTINUITY_RECOVERY_JSON_LENGTH = 8_100_000;

const MAX_APPLICATION_STORAGE_LENGTH = 3_000_000;
const MAX_FILTER_STORAGE_LENGTH = 64_000;
const MAX_TIMESTAMP_MAP_STORAGE_LENGTH = 1_000_000;
const MAX_JOB_KEY_LENGTH = 4_096;
const MAX_TIMESTAMP_LENGTH = 64;
const TIMESTAMP_MAP_VERSION = 1;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const APPLICATION_RECORD_KEYS = new Set([
  "stage",
  "updatedAt",
  "jobTitle",
  "company",
  "savedAt",
  "appliedAt",
  "nextAction",
  "nextActionAt",
  "interviewDates",
  "notes",
  "applicationUrl",
  "contact",
  "compensationNotes",
  "locationArrangement",
]);

const BOARD_FILTER_KEYS = new Set([
  "tab",
  "query",
  "major",
  "niche",
  "locationIds",
  "locationOrder",
  "freshness",
  "collection",
  "sort",
  "stages",
  "remoteOnly",
  "visaSponsorship",
  "minimumSalary",
]);

const SNAPSHOT_CATEGORY_KEYS = new Set([
  "savedJobs",
  "applications",
  "filters",
  "savedSearches",
]);

const SYNC_SELECTION_KEYS = new Set([
  "savedJobs",
  "applications",
  "filters",
  "savedSearches",
]);

export interface ContinuityStorageReader {
  getItem(key: string): string | null;
}

export interface ContinuityStorageWriter extends ContinuityStorageReader {
  setItem(key: string, value: string): void;
}

export interface SyncSelection {
  savedJobs: boolean;
  applications: boolean;
  filters: boolean;
  savedSearches: boolean;
}

/**
 * Application syncing is deliberately off until a user selects it because an
 * application can contain private notes, contact details, and compensation.
 */
export const DEFAULT_SYNC_SELECTION: Readonly<SyncSelection> = Object.freeze({
  savedJobs: true,
  applications: false,
  filters: true,
  savedSearches: true,
});

export interface ContinuityFilterState {
  filters: BoardFilters;
  updatedAt: string;
}

export type ContinuityTimestampMap = Record<string, string>;

export interface ContinuitySavedJobsState {
  urls: string[];
  updatedAt: ContinuityTimestampMap;
  tombstones: ContinuityTimestampMap;
}

export interface ContinuityApplicationsState {
  records: ApplicationRecords;
  tombstones: ContinuityTimestampMap;
}

export interface ContinuitySnapshotCategories {
  savedJobs?: ContinuitySavedJobsState;
  applications?: ContinuityApplicationsState;
  filters?: ContinuityFilterState;
  savedSearches?: SavedSearchState;
}

export interface ContinuitySnapshot {
  format: typeof CONTINUITY_SNAPSHOT_FORMAT;
  version: typeof CONTINUITY_SNAPSHOT_VERSION;
  capturedAt: string;
  categories: ContinuitySnapshotCategories;
}

export interface ContinuitySnapshotSummary {
  included: SyncSelection;
  savedJobCount: number;
  applicationCount: number;
  savedSearchCount: number;
  savedSearchTombstoneCount: number;
  applicationsWithNotes: number;
  applicationsWithContacts: number;
  applicationsWithCompensationNotes: number;
  applicationsWithSensitiveFields: number;
  containsSensitiveApplicationData: boolean;
}

export type ContinuitySnapshotParseResult =
  | { ok: true; snapshot: ContinuitySnapshot }
  | { ok: false; error: string };

export interface ContinuityRecoveryEnvelope {
  format: typeof CONTINUITY_RECOVERY_FORMAT;
  version: typeof CONTINUITY_RECOVERY_VERSION;
  createdAt: string;
  selection: SyncSelection;
  localBefore: ContinuitySnapshot;
  intendedMerged: ContinuitySnapshot;
}

export type ContinuityRecoveryParseResult =
  | { ok: true; recovery: ContinuityRecoveryEnvelope }
  | { ok: false; error: string };

export interface ContinuitySyncPlan {
  selection: SyncSelection;
  localBefore: ContinuitySnapshot;
  remoteBefore: ContinuitySnapshot;
  mergedLocal: ContinuitySnapshot;
  upload: ContinuitySnapshot;
  recovery: ContinuityRecoveryEnvelope;
}

export type ContinuitySyncPlanResult =
  | { ok: true; plan: ContinuitySyncPlan }
  | { ok: false; error: string };

export interface ContinuityStorageCommitResult {
  ok: boolean;
  written: Array<keyof SyncSelection>;
  error?: string;
}

interface StorageWriteGroup {
  category: keyof SyncSelection;
  entries: Array<[key: string, value: string]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.every((key) => allowed.has(key)) &&
    required.every((key) => Object.hasOwn(value, key))
  );
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_TIMESTAMP_LENGTH) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function optionTimestamp(
  value: string | Date | number | undefined,
): string {
  if (value === undefined) return new Date().toISOString();
  const milliseconds =
    typeof value === "string"
      ? Date.parse(value)
      : value instanceof Date
        ? value.getTime()
        : value;
  if (!Number.isFinite(milliseconds)) return new Date().toISOString();
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function safeJobKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_JOB_KEY_LENGTH &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !UNSAFE_KEYS.has(value)
  );
}

function safeSavedJobUrl(value: unknown): value is string {
  if (!safeJobKey(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function latestTimestamp(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

/**
 * Generates an ISO timestamp that is strictly newer than every supplied
 * timestamp. This keeps delete/undo ordering deterministic even when several
 * actions happen within the same millisecond.
 */
export function nextContinuityTimestamp(
  ...previousValues: Array<string | null | undefined>
): string {
  const now = Date.now();
  const previous = previousValues.reduce((latest, value) => {
    const normalized = normalizedTimestamp(value);
    return normalized
      ? Math.max(latest, Date.parse(normalized))
      : latest;
  }, Number.NEGATIVE_INFINITY);
  return new Date(Math.max(now, previous + 1)).toISOString();
}

function normalizeTimestampMapStrict(
  value: unknown,
  maximumEntries: number,
  isSafeKey: (candidate: unknown) => candidate is string,
): ContinuityTimestampMap | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > maximumEntries) return null;

  const normalized: ContinuityTimestampMap = {};
  for (const [key, timestamp] of entries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const parsedTimestamp = normalizedTimestamp(timestamp);
    if (!isSafeKey(key) || !parsedTimestamp) return null;
    normalized[key] = parsedTimestamp;
  }
  return normalized;
}

function parseTimestampMapStorage(
  raw: string | null,
  maximumEntries: number,
  isSafeKey: (candidate: unknown) => candidate is string,
): ContinuityTimestampMap {
  if (
    !raw ||
    raw.length > MAX_TIMESTAMP_MAP_STORAGE_LENGTH
  ) {
    return {};
  }
  try {
    const decoded: unknown = JSON.parse(raw);
    if (
      !isRecord(decoded) ||
      !hasOnlyKeys(
        decoded,
        new Set(["version", "timestamps"]),
        ["version", "timestamps"],
      ) ||
      decoded.version !== TIMESTAMP_MAP_VERSION
    ) {
      return {};
    }
    return (
      normalizeTimestampMapStrict(
        decoded.timestamps,
        maximumEntries,
        isSafeKey,
      ) ?? {}
    );
  } catch {
    return {};
  }
}

function serializeTimestampMapStorage(
  timestamps: ContinuityTimestampMap,
  maximumEntries: number,
  isSafeKey: (candidate: unknown) => candidate is string,
): string {
  const normalized = normalizeTimestampMapStrict(
    timestamps,
    maximumEntries,
    isSafeKey,
  );
  if (!normalized) throw new TypeError("Invalid continuity timestamps.");
  const raw = JSON.stringify({
    version: TIMESTAMP_MAP_VERSION,
    timestamps: normalized,
  });
  if (raw.length > MAX_TIMESTAMP_MAP_STORAGE_LENGTH) {
    throw new RangeError("Continuity timestamps are too large.");
  }
  return raw;
}

export function parseApplicationTombstones(
  raw: string | null,
): ContinuityTimestampMap {
  return parseTimestampMapStorage(
    raw,
    MAX_CONTINUITY_APPLICATION_TOMBSTONES,
    safeJobKey,
  );
}

export function serializeApplicationTombstones(
  tombstones: ContinuityTimestampMap,
): string {
  return serializeTimestampMapStorage(
    tombstones,
    MAX_CONTINUITY_APPLICATION_TOMBSTONES,
    safeJobKey,
  );
}

export function parseSavedJobUpdatedAt(
  raw: string | null,
): ContinuityTimestampMap {
  return parseTimestampMapStorage(
    raw,
    MAX_CONTINUITY_SAVED_JOBS,
    safeSavedJobUrl,
  );
}

export function serializeSavedJobUpdatedAt(
  timestamps: ContinuityTimestampMap,
): string {
  return serializeTimestampMapStorage(
    timestamps,
    MAX_CONTINUITY_SAVED_JOBS,
    safeSavedJobUrl,
  );
}

export function parseSavedJobTombstones(
  raw: string | null,
): ContinuityTimestampMap {
  return parseTimestampMapStorage(
    raw,
    MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
    safeSavedJobUrl,
  );
}

export function serializeSavedJobTombstones(
  tombstones: ContinuityTimestampMap,
): string {
  return serializeTimestampMapStorage(
    tombstones,
    MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
    safeSavedJobUrl,
  );
}

export function applyApplicationTombstones(
  records: ApplicationRecords,
  tombstones: ContinuityTimestampMap,
): ApplicationRecords {
  const next: ApplicationRecords = {};
  for (const [jobKey, record] of Object.entries(records).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const deletedAt = tombstones[jobKey];
    if (
      deletedAt &&
      Date.parse(deletedAt) >= Date.parse(record.updatedAt)
    ) {
      continue;
    }
    next[jobKey] = record;
  }
  return next;
}

export function resolveSavedJobContinuityState(
  urls: readonly string[],
  updatedAt: ContinuityTimestampMap,
  tombstones: ContinuityTimestampMap,
  fallbackTimestamp?: string,
): ContinuitySavedJobsState {
  const fallback =
    normalizedTimestamp(fallbackTimestamp) ?? new Date(0).toISOString();
  const normalizedUrls = [
    ...new Set(urls.filter(safeSavedJobUrl)),
  ]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_CONTINUITY_SAVED_JOBS);
  const resolvedUrls: string[] = [];
  const resolvedUpdatedAt: ContinuityTimestampMap = {};

  for (const url of normalizedUrls) {
    const liveAt = normalizedTimestamp(updatedAt[url]) ?? fallback;
    const deletedAt = normalizedTimestamp(tombstones[url]);
    if (deletedAt && Date.parse(deletedAt) >= Date.parse(liveAt)) {
      continue;
    }
    resolvedUrls.push(url);
    resolvedUpdatedAt[url] = liveAt;
  }

  return {
    urls: resolvedUrls,
    updatedAt: resolvedUpdatedAt,
    tombstones:
      normalizeTimestampMapStrict(
        tombstones,
        MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
        safeSavedJobUrl,
      ) ?? {},
  };
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => jsonEquivalent(item, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEquivalent(left[key], right[key]),
    )
  );
}

function normalizeSyncSelection(value: unknown): SyncSelection | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, SYNC_SELECTION_KEYS, [...SYNC_SELECTION_KEYS])
  ) {
    return null;
  }
  if (
    typeof value.savedJobs !== "boolean" ||
    typeof value.applications !== "boolean" ||
    typeof value.filters !== "boolean" ||
    typeof value.savedSearches !== "boolean"
  ) {
    return null;
  }
  return {
    savedJobs: value.savedJobs,
    applications: value.applications,
    filters: value.filters,
    savedSearches: value.savedSearches,
  };
}

export function isSyncSelection(value: unknown): value is SyncSelection {
  return normalizeSyncSelection(value) !== null;
}

function normalizeSavedJobsStrict(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_CONTINUITY_SAVED_JOBS
  ) {
    return null;
  }
  if (!value.every(safeSavedJobUrl)) return null;
  return [...new Set(value)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizeSavedJobsStateStrict(
  value: unknown,
  legacyTimestamp: string,
): ContinuitySavedJobsState | null {
  if (Array.isArray(value)) {
    const urls = normalizeSavedJobsStrict(value);
    return urls
      ? resolveSavedJobContinuityState(
          urls,
          {},
          {},
          legacyTimestamp,
        )
      : null;
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(["urls", "updatedAt", "tombstones"]),
      ["urls", "updatedAt", "tombstones"],
    )
  ) {
    return null;
  }
  const urls = normalizeSavedJobsStrict(value.urls);
  const updatedAt = normalizeTimestampMapStrict(
    value.updatedAt,
    MAX_CONTINUITY_SAVED_JOBS,
    safeSavedJobUrl,
  );
  const tombstones = normalizeTimestampMapStrict(
    value.tombstones,
    MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
    safeSavedJobUrl,
  );
  return urls && updatedAt && tombstones
    ? resolveSavedJobContinuityState(
        urls,
        updatedAt,
        tombstones,
        legacyTimestamp,
      )
    : null;
}

function normalizeLocalSavedJobs(raw: string | null): string[] {
  if (!raw || raw.length > MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const jobs: string[] = [];
    const seen = new Set<string>();
    for (const candidate of parsed) {
      if (
        !safeSavedJobUrl(candidate) ||
        seen.has(candidate) ||
        jobs.length >= MAX_CONTINUITY_SAVED_JOBS
      ) {
        continue;
      }
      seen.add(candidate);
      jobs.push(candidate);
    }
    return jobs.sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function sameApplicationRecord(
  value: Record<string, unknown>,
  normalized: ApplicationRecord,
): boolean {
  return (
    hasOnlyKeys(value, APPLICATION_RECORD_KEYS, ["stage", "updatedAt"]) &&
    jsonEquivalent(value, normalized)
  );
}

function normalizeApplicationRecordsStrict(
  value: unknown,
): ApplicationRecords | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_CONTINUITY_APPLICATIONS) return null;

  const records: ApplicationRecords = {};
  for (const [jobKey, candidate] of entries.sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!safeJobKey(jobKey) || !isRecord(candidate)) return null;
    const normalized = parseApplicationRecord(candidate);
    if (!normalized || !sameApplicationRecord(candidate, normalized)) {
      return null;
    }
    records[jobKey] = normalized;
  }
  return records;
}

function normalizeApplicationsStateStrict(
  value: unknown,
): ContinuityApplicationsState | null {
  if (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      new Set(["records", "tombstones"]),
      ["records", "tombstones"],
    )
  ) {
    const records = normalizeApplicationRecordsStrict(value.records);
    const tombstones = normalizeTimestampMapStrict(
      value.tombstones,
      MAX_CONTINUITY_APPLICATION_TOMBSTONES,
      safeJobKey,
    );
    return records && tombstones
      ? {
          records: applyApplicationTombstones(records, tombstones),
          tombstones,
        }
      : null;
  }

  const records = normalizeApplicationRecordsStrict(value);
  return records ? { records, tombstones: {} } : null;
}

function normalizeLocalApplicationRecords(raw: string | null): ApplicationRecords {
  if (!raw || raw.length > MAX_APPLICATION_STORAGE_LENGTH) return {};
  const parsed = parseApplicationRecords(raw);
  const records: ApplicationRecords = {};
  for (const [jobKey, record] of Object.entries(parsed)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_CONTINUITY_APPLICATIONS)) {
    const normalized = parseApplicationRecord(record);
    if (safeJobKey(jobKey) && normalized) records[jobKey] = normalized;
  }
  return records;
}

function sameBoardFilters(
  value: Record<string, unknown>,
  normalized: BoardFilters,
): boolean {
  return (
    hasOnlyKeys(value, BOARD_FILTER_KEYS, [...BOARD_FILTER_KEYS]) &&
    jsonEquivalent(value, normalized)
  );
}

function normalizeBoardFiltersStrict(value: unknown): BoardFilters | null {
  if (!isRecord(value)) return null;
  try {
    const raw = JSON.stringify(value);
    if (!raw || raw.length > MAX_FILTER_STORAGE_LENGTH) return null;
    const normalized = parseStoredBoardFilters(raw);
    return sameBoardFilters(value, normalized) ? normalized : null;
  } catch {
    return null;
  }
}

function normalizeFilterStateStrict(
  value: unknown,
): ContinuityFilterState | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(["filters", "updatedAt"]),
      ["filters", "updatedAt"],
    )
  ) {
    return null;
  }
  const filters = normalizeBoardFiltersStrict(value.filters);
  const updatedAt = normalizedTimestamp(value.updatedAt);
  return filters && updatedAt ? { filters, updatedAt } : null;
}

function normalizeSavedSearchStateStrict(
  value: unknown,
): SavedSearchState | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(["searches", "tombstones"]),
      ["searches", "tombstones"],
    ) ||
    !Array.isArray(value.searches) ||
    !Array.isArray(value.tombstones) ||
    value.searches.length > MAX_SAVED_SEARCHES ||
    value.tombstones.length > MAX_SAVED_SEARCH_TOMBSTONES
  ) {
    return null;
  }

  const searches = value.searches.map((candidate) => {
    const parsed = parseSavedSearch(candidate);
    return parsed && jsonEquivalent(candidate, parsed) ? parsed : null;
  });
  const tombstones = value.tombstones.map((candidate) => {
    const parsed = parseSavedSearchTombstone(candidate);
    return parsed && jsonEquivalent(candidate, parsed) ? parsed : null;
  });
  if (
    searches.some((search) => search === null) ||
    tombstones.some((tombstone) => tombstone === null)
  ) {
    return null;
  }
  return mergeSavedSearchStates({
    searches: searches as SavedSearchState["searches"],
    tombstones: tombstones as SavedSearchState["tombstones"],
  });
}

function normalizeCategoriesStrict(
  value: unknown,
  legacyTimestamp: string,
): ContinuitySnapshotCategories | null {
  if (!isRecord(value) || !hasOnlyKeys(value, SNAPSHOT_CATEGORY_KEYS)) {
    return null;
  }
  const categories: ContinuitySnapshotCategories = {};

  if (Object.hasOwn(value, "savedJobs")) {
    const savedJobs = normalizeSavedJobsStateStrict(
      value.savedJobs,
      legacyTimestamp,
    );
    if (!savedJobs) return null;
    categories.savedJobs = savedJobs;
  }
  if (Object.hasOwn(value, "applications")) {
    const applications = normalizeApplicationsStateStrict(
      value.applications,
    );
    if (!applications) return null;
    categories.applications = applications;
  }
  if (Object.hasOwn(value, "filters")) {
    const filters = normalizeFilterStateStrict(value.filters);
    if (!filters) return null;
    categories.filters = filters;
  }
  if (Object.hasOwn(value, "savedSearches")) {
    const savedSearches = normalizeSavedSearchStateStrict(
      value.savedSearches,
    );
    if (!savedSearches) return null;
    categories.savedSearches = savedSearches;
  }
  return categories;
}

function normalizeSnapshotStrict(value: unknown): ContinuitySnapshot | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set(["format", "version", "capturedAt", "categories"]),
      ["format", "version", "capturedAt", "categories"],
    ) ||
    value.format !== CONTINUITY_SNAPSHOT_FORMAT ||
    value.version !== CONTINUITY_SNAPSHOT_VERSION
  ) {
    return null;
  }
  const capturedAt = normalizedTimestamp(value.capturedAt);
  const categories = capturedAt
    ? normalizeCategoriesStrict(value.categories, capturedAt)
    : null;
  return capturedAt && categories
    ? {
        format: CONTINUITY_SNAPSHOT_FORMAT,
        version: CONTINUITY_SNAPSHOT_VERSION,
        capturedAt,
        categories,
      }
    : null;
}

function decodeJsonLike(
  value: unknown,
  maximumLength: number,
): unknown | null {
  try {
    const raw =
      typeof value === "string" ? value : JSON.stringify(value);
    if (
      typeof raw !== "string" ||
      raw.length === 0 ||
      raw.length > maximumLength
    ) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function parseContinuitySnapshot(
  value: unknown,
): ContinuitySnapshotParseResult {
  const decoded = decodeJsonLike(
    value,
    MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH,
  );
  if (!decoded) {
    return { ok: false, error: "The continuity snapshot is not valid JSON." };
  }
  if (!isRecord(decoded) || decoded.format !== CONTINUITY_SNAPSHOT_FORMAT) {
    return {
      ok: false,
      error: "The data is not a Timley continuity snapshot.",
    };
  }
  if (decoded.version !== CONTINUITY_SNAPSHOT_VERSION) {
    return {
      ok: false,
      error: `Continuity snapshot version ${String(decoded.version)} is not supported.`,
    };
  }
  const snapshot = normalizeSnapshotStrict(decoded);
  return snapshot
    ? { ok: true, snapshot }
    : {
        ok: false,
        error: "The continuity snapshot contains invalid or unsafe data.",
      };
}

export function serializeContinuitySnapshot(
  snapshot: ContinuitySnapshot,
): string {
  const normalized = normalizeSnapshotStrict(snapshot);
  if (!normalized) throw new TypeError("Invalid continuity snapshot.");
  const raw = JSON.stringify(normalized);
  if (raw.length > MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH) {
    throw new RangeError("Continuity snapshot is too large.");
  }
  return raw;
}

function safeStorageRead(
  storage: ContinuityStorageReader,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Capture only categories the user selected. In particular, application
 * storage is not even read when applications is false.
 */
export function captureContinuitySnapshot(
  storage: ContinuityStorageReader,
  selection: SyncSelection,
  capturedAt?: string | Date | number,
): ContinuitySnapshot {
  const normalizedSelection = normalizeSyncSelection(selection);
  if (!normalizedSelection) throw new TypeError("Invalid sync selection.");
  const timestamp = optionTimestamp(capturedAt);
  const categories: ContinuitySnapshotCategories = {};

  if (normalizedSelection.savedJobs) {
    categories.savedJobs = resolveSavedJobContinuityState(
      normalizeLocalSavedJobs(
        safeStorageRead(storage, LEGACY_SAVED_STORAGE_KEY),
      ),
      parseSavedJobUpdatedAt(
        safeStorageRead(storage, SAVED_JOB_UPDATED_AT_STORAGE_KEY),
      ),
      parseSavedJobTombstones(
        safeStorageRead(storage, SAVED_JOB_TOMBSTONE_STORAGE_KEY),
      ),
      timestamp,
    );
  }
  if (normalizedSelection.applications) {
    const tombstones = parseApplicationTombstones(
      safeStorageRead(storage, APPLICATION_TOMBSTONE_STORAGE_KEY),
    );
    categories.applications = {
      records: applyApplicationTombstones(
        normalizeLocalApplicationRecords(
          safeStorageRead(storage, APPLICATION_STORAGE_KEY),
        ),
        tombstones,
      ),
      tombstones,
    };
  }
  if (normalizedSelection.filters) {
    const raw = safeStorageRead(storage, BOARD_FILTER_STORAGE_KEY);
    if (raw && raw.length <= MAX_FILTER_STORAGE_LENGTH) {
      try {
        const decoded: unknown = JSON.parse(raw);
        if (isRecord(decoded)) {
          const storedTimestamp = normalizedTimestamp(
            safeStorageRead(
              storage,
              BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
            ),
          );
          const filters = parseStoredBoardFilters(raw);
          if (
            storedTimestamp ||
            !jsonEquivalent(filters, DEFAULT_BOARD_FILTERS)
          ) {
            categories.filters = {
              filters,
              updatedAt: storedTimestamp ?? timestamp,
            };
          }
        }
      } catch {
        // Missing or malformed local filters remain absent so a valid remote
        // category can restore a fresh browser without a fabricated tie.
      }
    }
  }
  if (normalizedSelection.savedSearches) {
    categories.savedSearches = mergeSavedSearchStates({
      searches: parseStoredSavedSearches(
        safeStorageRead(storage, SAVED_SEARCH_STORAGE_KEY),
      ),
      tombstones: parseStoredSavedSearchTombstones(
        safeStorageRead(storage, SAVED_SEARCH_TOMBSTONE_STORAGE_KEY),
      ),
    });
  }

  return {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt: timestamp,
    categories,
  };
}

export function summarizeContinuitySnapshot(
  snapshot: ContinuitySnapshot,
): ContinuitySnapshotSummary {
  const normalized = normalizeSnapshotStrict(snapshot);
  if (!normalized) throw new TypeError("Invalid continuity snapshot.");
  const applications = Object.values(
    normalized.categories.applications?.records ?? {},
  );
  const applicationsWithNotes = applications.filter(
    (application) => Boolean(application.notes),
  ).length;
  const applicationsWithContacts = applications.filter(
    (application) => Boolean(application.contact),
  ).length;
  const applicationsWithCompensationNotes = applications.filter(
    (application) => Boolean(application.compensationNotes),
  ).length;
  const applicationsWithSensitiveFields = applications.filter(
    (application) =>
      Boolean(
        application.notes ||
          application.contact ||
          application.compensationNotes,
      ),
  ).length;

  return {
    included: {
      savedJobs: Object.hasOwn(normalized.categories, "savedJobs"),
      applications: Object.hasOwn(normalized.categories, "applications"),
      filters: Object.hasOwn(normalized.categories, "filters"),
      savedSearches: Object.hasOwn(
        normalized.categories,
        "savedSearches",
      ),
    },
    savedJobCount: normalized.categories.savedJobs?.urls.length ?? 0,
    applicationCount: applications.length,
    savedSearchCount:
      normalized.categories.savedSearches?.searches.length ?? 0,
    savedSearchTombstoneCount:
      normalized.categories.savedSearches?.tombstones.length ?? 0,
    applicationsWithNotes,
    applicationsWithContacts,
    applicationsWithCompensationNotes,
    applicationsWithSensitiveFields,
    containsSensitiveApplicationData:
      applicationsWithSensitiveFields > 0,
  };
}

function cloneSnapshot(snapshot: ContinuitySnapshot): ContinuitySnapshot {
  const normalized = normalizeSnapshotStrict(snapshot);
  if (!normalized) throw new TypeError("Invalid continuity snapshot.");
  return normalized;
}

function boundedTimestampMap(
  timestamps: ContinuityTimestampMap,
  maximumEntries: number,
): ContinuityTimestampMap {
  const entries = Object.entries(timestamps)
    .sort(
      ([leftKey, leftTimestamp], [rightKey, rightTimestamp]) =>
        Date.parse(rightTimestamp) - Date.parse(leftTimestamp) ||
        leftKey.localeCompare(rightKey),
    )
    .slice(0, maximumEntries)
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

export function recordApplicationTombstone(
  tombstones: ContinuityTimestampMap,
  jobKey: string,
  deletedAt: string,
): ContinuityTimestampMap {
  const normalized = normalizedTimestamp(deletedAt);
  if (!safeJobKey(jobKey) || !normalized) return { ...tombstones };
  return boundedTimestampMap(
    {
      ...tombstones,
      [jobKey]: latestTimestamp(tombstones[jobKey], normalized) as string,
    },
    MAX_CONTINUITY_APPLICATION_TOMBSTONES,
  );
}

export function recordSavedJobTimestamp(
  timestamps: ContinuityTimestampMap,
  url: string,
  changedAt: string,
): ContinuityTimestampMap {
  const normalized = normalizedTimestamp(changedAt);
  if (!safeSavedJobUrl(url) || !normalized) return { ...timestamps };
  return boundedTimestampMap(
    {
      ...timestamps,
      [url]: latestTimestamp(timestamps[url], normalized) as string,
    },
    MAX_CONTINUITY_SAVED_JOBS,
  );
}

export function recordSavedJobTombstone(
  tombstones: ContinuityTimestampMap,
  url: string,
  deletedAt: string,
): ContinuityTimestampMap {
  const normalized = normalizedTimestamp(deletedAt);
  if (!safeSavedJobUrl(url) || !normalized) return { ...tombstones };
  return boundedTimestampMap(
    {
      ...tombstones,
      [url]: latestTimestamp(tombstones[url], normalized) as string,
    },
    MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
  );
}

function mergeSavedJobs(
  local: ContinuitySavedJobsState,
  remote: ContinuitySavedJobsState,
): ContinuitySavedJobsState | null {
  const tombstoneCandidates: ContinuityTimestampMap = {
    ...remote.tombstones,
  };
  for (const [url, deletedAt] of Object.entries(local.tombstones)) {
    tombstoneCandidates[url] =
      latestTimestamp(tombstoneCandidates[url], deletedAt) as string;
  }
  const tombstones = boundedTimestampMap(
    tombstoneCandidates,
    MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
  );
  const liveCandidates = new Set([...local.urls, ...remote.urls]);
  const urls: string[] = [];
  const updatedAt: ContinuityTimestampMap = {};
  for (const url of [...liveCandidates].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const localUpdatedAt = local.urls.includes(url)
      ? local.updatedAt[url]
      : undefined;
    const remoteUpdatedAt = remote.urls.includes(url)
      ? remote.updatedAt[url]
      : undefined;
    const liveAt = latestTimestamp(localUpdatedAt, remoteUpdatedAt);
    const deletedAt = tombstones[url];
    if (
      !liveAt ||
      (deletedAt &&
        Date.parse(deletedAt) >= Date.parse(liveAt))
    ) {
      continue;
    }
    urls.push(url);
    updatedAt[url] = liveAt;
  }
  return urls.length <= MAX_CONTINUITY_SAVED_JOBS
    ? { urls, updatedAt, tombstones }
    : null;
}

function mergeApplications(
  local: ContinuityApplicationsState,
  remote: ContinuityApplicationsState,
): ContinuityApplicationsState | null {
  const tombstoneCandidates: ContinuityTimestampMap = {
    ...remote.tombstones,
  };
  for (const [jobKey, deletedAt] of Object.entries(local.tombstones)) {
    tombstoneCandidates[jobKey] =
      latestTimestamp(tombstoneCandidates[jobKey], deletedAt) as string;
  }
  const tombstones = boundedTimestampMap(
    tombstoneCandidates,
    MAX_CONTINUITY_APPLICATION_TOMBSTONES,
  );
  // Incoming wins equal timestamps, so passing local second preserves a local
  // edit on a tie without changing either stable record key.
  const merged = applyApplicationTombstones(
    mergeApplicationRecords(remote.records, local.records),
    tombstones,
  );
  if (Object.keys(merged).length > MAX_CONTINUITY_APPLICATIONS) return null;
  const records = normalizeApplicationRecordsStrict(merged);
  return records ? { records, tombstones } : null;
}

function mergeFilters(
  local: ContinuityFilterState | undefined,
  remote: ContinuityFilterState | undefined,
): ContinuityFilterState | undefined {
  if (!local) return remote ? normalizeFilterStateStrict(remote) ?? undefined : undefined;
  if (!remote) return normalizeFilterStateStrict(local) ?? undefined;
  return Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt)
    ? normalizeFilterStateStrict(local) ?? undefined
    : normalizeFilterStateStrict(remote) ?? undefined;
}

function snapshotWithinLimit(snapshot: ContinuitySnapshot): boolean {
  try {
    return (
      serializeContinuitySnapshot(snapshot).length <=
      MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH
    );
  } catch {
    return false;
  }
}

export function createContinuityRecoveryEnvelope(
  localBefore: ContinuitySnapshot,
  intendedMerged: ContinuitySnapshot,
  selection: SyncSelection,
  createdAt?: string | Date | number,
): ContinuityRecoveryEnvelope | null {
  const local = normalizeSnapshotStrict(localBefore);
  const merged = normalizeSnapshotStrict(intendedMerged);
  const normalizedSelection = normalizeSyncSelection(selection);
  if (!local || !merged || !normalizedSelection) return null;
  const recovery: ContinuityRecoveryEnvelope = {
    format: CONTINUITY_RECOVERY_FORMAT,
    version: CONTINUITY_RECOVERY_VERSION,
    createdAt: optionTimestamp(createdAt),
    selection: normalizedSelection,
    localBefore: local,
    intendedMerged: merged,
  };
  try {
    return JSON.stringify(recovery).length <=
      MAX_CONTINUITY_RECOVERY_JSON_LENGTH
      ? recovery
      : null;
  } catch {
    return null;
  }
}

/**
 * Pure two-sided merge. The local result starts from local state while the
 * upload contains only selected category patches. A provider can therefore
 * keep unselected remote categories server-side without ever returning or
 * retransmitting them through the browser.
 */
export function prepareContinuitySync(
  localBefore: ContinuitySnapshot,
  remoteBefore: ContinuitySnapshot,
  selection: SyncSelection,
  mergedAt?: string | Date | number,
): ContinuitySyncPlanResult {
  let local: ContinuitySnapshot;
  let remote: ContinuitySnapshot;
  try {
    local = cloneSnapshot(localBefore);
    remote = cloneSnapshot(remoteBefore);
  } catch {
    return { ok: false, error: "A continuity snapshot is invalid." };
  }
  const normalizedSelection = normalizeSyncSelection(selection);
  if (!normalizedSelection) {
    return { ok: false, error: "The sync selection is invalid." };
  }

  const timestamp = optionTimestamp(mergedAt);
  const localCategories: ContinuitySnapshotCategories = {
    ...local.categories,
  };
  const uploadCategories: ContinuitySnapshotCategories = {};

  if (normalizedSelection.savedJobs) {
    const savedJobs = mergeSavedJobs(
      local.categories.savedJobs ?? {
        urls: [],
        updatedAt: {},
        tombstones: {},
      },
      remote.categories.savedJobs ?? {
        urls: [],
        updatedAt: {},
        tombstones: {},
      },
    );
    if (!savedJobs) {
      return {
        ok: false,
        error: "The merged saved-job list exceeds the safe limit.",
      };
    }
    localCategories.savedJobs = savedJobs;
    uploadCategories.savedJobs = savedJobs;
  }

  if (normalizedSelection.applications) {
    const applications = mergeApplications(
      local.categories.applications ?? {
        records: {},
        tombstones: {},
      },
      remote.categories.applications ?? {
        records: {},
        tombstones: {},
      },
    );
    if (!applications) {
      return {
        ok: false,
        error: "The merged application list exceeds the safe limit.",
      };
    }
    localCategories.applications = applications;
    uploadCategories.applications = normalizeApplicationsStateStrict(
      applications,
    ) as ContinuityApplicationsState;
  }

  if (normalizedSelection.filters) {
    const filters = mergeFilters(
      local.categories.filters,
      remote.categories.filters,
    );
    if (filters) {
      localCategories.filters = filters;
      uploadCategories.filters = normalizeFilterStateStrict(
        filters,
      ) as ContinuityFilterState;
    }
  }

  if (normalizedSelection.savedSearches) {
    const savedSearches = mergeSavedSearchStates(
      local.categories.savedSearches ?? {
        searches: [],
        tombstones: [],
      },
      remote.categories.savedSearches ?? {
        searches: [],
        tombstones: [],
      },
    );
    localCategories.savedSearches = savedSearches;
    uploadCategories.savedSearches = mergeSavedSearchStates(savedSearches);
  }

  const mergedLocal: ContinuitySnapshot = {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt: timestamp,
    categories: localCategories,
  };
  const upload: ContinuitySnapshot = {
    format: CONTINUITY_SNAPSHOT_FORMAT,
    version: CONTINUITY_SNAPSHOT_VERSION,
    capturedAt: timestamp,
    categories: uploadCategories,
  };
  if (!snapshotWithinLimit(mergedLocal) || !snapshotWithinLimit(upload)) {
    return {
      ok: false,
      error: "The merged continuity snapshot exceeds the safe limit.",
    };
  }
  const recovery = createContinuityRecoveryEnvelope(
    local,
    mergedLocal,
    normalizedSelection,
    timestamp,
  );
  if (!recovery) {
    return {
      ok: false,
      error: "The pre-sync recovery data exceeds the safe limit.",
    };
  }

  return {
    ok: true,
    plan: {
      selection: normalizedSelection,
      localBefore: local,
      remoteBefore: remote,
      mergedLocal: cloneSnapshot(mergedLocal),
      upload: cloneSnapshot(upload),
      recovery,
    },
  };
}

function normalizeRecoveryStrict(
  value: unknown,
): ContinuityRecoveryEnvelope | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      new Set([
        "format",
        "version",
        "createdAt",
        "selection",
        "localBefore",
        "intendedMerged",
      ]),
      [
        "format",
        "version",
        "createdAt",
        "selection",
        "localBefore",
        "intendedMerged",
      ],
    ) ||
    value.format !== CONTINUITY_RECOVERY_FORMAT ||
    value.version !== CONTINUITY_RECOVERY_VERSION
  ) {
    return null;
  }
  const createdAt = normalizedTimestamp(value.createdAt);
  const selection = normalizeSyncSelection(value.selection);
  const localBefore = normalizeSnapshotStrict(value.localBefore);
  const intendedMerged = normalizeSnapshotStrict(value.intendedMerged);
  return createdAt && selection && localBefore && intendedMerged
    ? {
        format: CONTINUITY_RECOVERY_FORMAT,
        version: CONTINUITY_RECOVERY_VERSION,
        createdAt,
        selection,
        localBefore,
        intendedMerged,
      }
    : null;
}

export function serializeContinuityRecovery(
  recovery: ContinuityRecoveryEnvelope,
): string {
  const normalized = normalizeRecoveryStrict(recovery);
  if (!normalized) throw new TypeError("Invalid continuity recovery data.");
  const raw = JSON.stringify(normalized);
  if (raw.length > MAX_CONTINUITY_RECOVERY_JSON_LENGTH) {
    throw new RangeError("Continuity recovery data is too large.");
  }
  return raw;
}

export function parseContinuityRecovery(
  value: unknown,
): ContinuityRecoveryParseResult {
  const decoded = decodeJsonLike(
    value,
    MAX_CONTINUITY_RECOVERY_JSON_LENGTH,
  );
  if (!decoded) {
    return { ok: false, error: "The recovery data is not valid JSON." };
  }
  if (!isRecord(decoded) || decoded.format !== CONTINUITY_RECOVERY_FORMAT) {
    return { ok: false, error: "The data is not Timley recovery data." };
  }
  if (decoded.version !== CONTINUITY_RECOVERY_VERSION) {
    return {
      ok: false,
      error: `Continuity recovery version ${String(decoded.version)} is not supported.`,
    };
  }
  const recovery = normalizeRecoveryStrict(decoded);
  return recovery
    ? { ok: true, recovery }
    : {
        ok: false,
        error: "The recovery data contains invalid or unsafe data.",
      };
}

/**
 * Persist selected categories only. Call this after the account snapshot has
 * saved successfully; failed/partial browser writes can be retried or repaired
 * from the sync plan's recovery envelope.
 */
export function commitContinuitySnapshotToStorage(
  storage: ContinuityStorageWriter,
  snapshot: ContinuitySnapshot,
  selection: SyncSelection,
): ContinuityStorageCommitResult {
  const normalized = normalizeSnapshotStrict(snapshot);
  const normalizedSelection = normalizeSyncSelection(selection);
  if (!normalized || !normalizedSelection) {
    return {
      ok: false,
      written: [],
      error: "The merged continuity data is invalid.",
    };
  }

  const groups: StorageWriteGroup[] = [];
  if (
    normalizedSelection.savedJobs &&
    normalized.categories.savedJobs
  ) {
    groups.push({
      category: "savedJobs",
      entries: [
        [
          SAVED_JOB_TOMBSTONE_STORAGE_KEY,
          serializeSavedJobTombstones(
            normalized.categories.savedJobs.tombstones,
          ),
        ],
        [
          SAVED_JOB_UPDATED_AT_STORAGE_KEY,
          serializeSavedJobUpdatedAt(
            normalized.categories.savedJobs.updatedAt,
          ),
        ],
        [
          LEGACY_SAVED_STORAGE_KEY,
          JSON.stringify(normalized.categories.savedJobs.urls),
        ],
      ],
    });
  }
  if (
    normalizedSelection.applications &&
    normalized.categories.applications
  ) {
    groups.push({
      category: "applications",
      entries: [
        [
          APPLICATION_TOMBSTONE_STORAGE_KEY,
          serializeApplicationTombstones(
            normalized.categories.applications.tombstones,
          ),
        ],
        [
          APPLICATION_STORAGE_KEY,
          serializeApplicationRecords(
            normalized.categories.applications.records,
          ),
        ],
      ],
    });
  }
  if (normalizedSelection.filters && normalized.categories.filters) {
    groups.push({
      category: "filters",
      entries: [
        [
          BOARD_FILTER_STORAGE_KEY,
          JSON.stringify(normalized.categories.filters.filters),
        ],
        [
          BOARD_FILTER_UPDATED_AT_STORAGE_KEY,
          normalized.categories.filters.updatedAt,
        ],
      ],
    });
  }
  if (
    normalizedSelection.savedSearches &&
    normalized.categories.savedSearches
  ) {
    groups.push({
      category: "savedSearches",
      entries: [
        [
          SAVED_SEARCH_TOMBSTONE_STORAGE_KEY,
          serializeSavedSearchTombstones(
            normalized.categories.savedSearches.tombstones,
          ),
        ],
        [
          SAVED_SEARCH_STORAGE_KEY,
          serializeSavedSearches(
            normalized.categories.savedSearches.searches,
          ),
        ],
      ],
    });
  }

  const written: Array<keyof SyncSelection> = [];
  try {
    for (const group of groups) {
      for (const [key, value] of group.entries) {
        storage.setItem(key, value);
      }
      written.push(group.category);
    }
    return { ok: true, written };
  } catch {
    return {
      ok: false,
      written,
      error:
        "Browser storage could not save every selected continuity category.",
    };
  }
}

/**
 * Exposed for diagnostics and UI copy without leaking the actual stored data.
 */
export const CONTINUITY_STORAGE_LIMITS = Object.freeze({
  applications: MAX_CONTINUITY_APPLICATIONS,
  applicationTombstones: MAX_CONTINUITY_APPLICATION_TOMBSTONES,
  savedJobs: MAX_CONTINUITY_SAVED_JOBS,
  savedJobTombstones: MAX_CONTINUITY_SAVED_JOB_TOMBSTONES,
  savedSearches: MAX_SAVED_SEARCHES,
  savedSearchTombstones: MAX_SAVED_SEARCH_TOMBSTONES,
  savedSearchStorageLength: MAX_SAVED_SEARCH_STORAGE_LENGTH,
  snapshotJsonLength: MAX_CONTINUITY_SNAPSHOT_JSON_LENGTH,
  recoveryJsonLength: MAX_CONTINUITY_RECOVERY_JSON_LENGTH,
});

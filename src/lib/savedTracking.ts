import {
  MAX_TRACKING_RECORDS,
  isSafeTrackingKey,
  isTrackingTimestamp,
  type TrackingKeyAliasMap,
} from "./applicationTracking";

export const SAVED_STORAGE_KEY = "timley:saved:v2";
export const LEGACY_SAVED_STORAGE_KEY = "timley:saved";
export const SAVED_BROADCAST_CHANNEL = "timley:saved:v2";
export const SAVED_STORE_VERSION = 2 as const;

export interface SavedRecord {
  saved: boolean;
  updatedAt: string;
}

export type SavedRecords = Record<string, SavedRecord>;

/** False records are intentional tombstones used during cross-tab merges. */
export interface SavedStoreV2 {
  version: typeof SAVED_STORE_VERSION;
  records: SavedRecords;
  unmatched: SavedRecords;
}

export interface SavedMigrationResult {
  store: SavedStoreV2;
  saved: Set<string>;
  unmatched: Set<string>;
  source: "v2" | "legacy" | "empty";
  shouldPersist: boolean;
  migratedCount: number;
  unmatchedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSavedRecords(candidate: unknown): SavedRecords {
  if (!isRecord(candidate)) return {};
  const records: SavedRecords = {};
  for (const [key, value] of Object.entries(candidate).slice(
    0,
    MAX_TRACKING_RECORDS,
  )) {
    if (
      isSafeTrackingKey(key) &&
      isRecord(value) &&
      typeof value.saved === "boolean" &&
      isTrackingTimestamp(value.updatedAt)
    ) {
      records[key] = { saved: value.saved, updatedAt: value.updatedAt };
    }
  }
  return records;
}

export function createEmptySavedStore(): SavedStoreV2 {
  return { version: SAVED_STORE_VERSION, records: {}, unmatched: {} };
}

export function parseSavedStore(raw: string | null): SavedStoreV2 {
  if (!raw) return createEmptySavedStore();
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!isRecord(candidate) || candidate.version !== SAVED_STORE_VERSION) {
      return createEmptySavedStore();
    }
    return {
      version: SAVED_STORE_VERSION,
      records: parseSavedRecords(candidate.records),
      unmatched: parseSavedRecords(candidate.unmatched),
    };
  } catch {
    return createEmptySavedStore();
  }
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function serializeSavedStore(store: SavedStoreV2): string {
  return JSON.stringify({
    version: SAVED_STORE_VERSION,
    records: sortRecord(store.records),
    unmatched: sortRecord(store.unmatched),
  });
}

export function savedStoresEqual(
  left: SavedStoreV2,
  right: SavedStoreV2,
): boolean {
  return serializeSavedStore(left) === serializeSavedStore(right);
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
    if (isSafeTrackingKey(legacyKey) && isSafeTrackingKey(trackingKey)) {
      byLegacyKey.set(legacyKey, trackingKey);
      knownTrackingKeys.add(trackingKey);
    }
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

function parseLegacySaved(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!Array.isArray(candidate)) return [];
    return [
      ...new Set(
        candidate
          .slice(0, MAX_TRACKING_RECORDS)
          .filter(isSafeTrackingKey),
      ),
    ];
  } catch {
    return [];
  }
}

function mergeSavedRecord(left: SavedRecord, right: SavedRecord): SavedRecord {
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (leftTime > rightTime) return { ...left };
  if (rightTime > leftTime) return { ...right };
  // A same-time removal wins so an old tab cannot resurrect a save.
  return left.saved && !right.saved ? { ...right } : { ...left };
}

function mergeInto(
  records: SavedRecords,
  key: string,
  record: SavedRecord,
): void {
  records[key] = records[key]
    ? mergeSavedRecord(records[key], record)
    : { ...record };
}

export function savedTrackingKeys(store: SavedStoreV2): Set<string> {
  return new Set(
    Object.entries(store.records)
      .filter(([, record]) => record.saved)
      .map(([trackingKey]) => trackingKey),
  );
}

export function unmatchedSavedKeys(store: SavedStoreV2): Set<string> {
  return new Set(
    Object.entries(store.unmatched)
      .filter(([, record]) => record.saved)
      .map(([legacyKey]) => legacyKey),
  );
}

export function recoverUnmatchedSavedRecords(
  store: SavedStoreV2,
  aliasMap: TrackingKeyAliasMap,
): { store: SavedStoreV2; recoveredCount: number } {
  const aliases = normalizeAliases(aliasMap);
  const records = { ...store.records };
  const unmatched = { ...store.unmatched };
  let recoveredCount = 0;
  for (const [legacyKey, record] of Object.entries(store.unmatched)) {
    const trackingKey = resolveTrackingKey(legacyKey, aliases);
    if (!trackingKey) continue;
    mergeInto(records, trackingKey, record);
    delete unmatched[legacyKey];
    recoveredCount += 1;
  }
  if (recoveredCount === 0) return { store, recoveredCount };
  return {
    store: { version: SAVED_STORE_VERSION, records, unmatched },
    recoveredCount,
  };
}

/** Idempotent migration from the URL-keyed `timley:saved` string array. */
export function migrateSavedTracking(
  v2Raw: string | null,
  legacyRaw: string | null,
  aliasMap: TrackingKeyAliasMap = {},
  now = new Date().toISOString(),
): SavedMigrationResult {
  if (v2Raw !== null) {
    const recovery = recoverUnmatchedSavedRecords(
      parseSavedStore(v2Raw),
      aliasMap,
    );
    return savedMigrationResult(
      recovery.store,
      "v2",
      recovery.recoveredCount > 0,
      recovery.recoveredCount,
    );
  }

  const timestamp = isTrackingTimestamp(now) ? now : new Date().toISOString();
  const aliases = normalizeAliases(aliasMap);
  const records: SavedRecords = {};
  const unmatched: SavedRecords = {};
  const legacyKeys = parseLegacySaved(legacyRaw);
  for (const legacyKey of legacyKeys) {
    const trackingKey = resolveTrackingKey(legacyKey, aliases);
    const record = { saved: true, updatedAt: timestamp };
    if (trackingKey) mergeInto(records, trackingKey, record);
    else mergeInto(unmatched, legacyKey, record);
  }
  const store: SavedStoreV2 = {
    version: SAVED_STORE_VERSION,
    records,
    unmatched,
  };
  return savedMigrationResult(
    store,
    legacyKeys.length > 0 ? "legacy" : "empty",
    true,
    legacyKeys.length,
  );
}

function savedMigrationResult(
  store: SavedStoreV2,
  source: SavedMigrationResult["source"],
  shouldPersist: boolean,
  migratedCount: number,
): SavedMigrationResult {
  const saved = savedTrackingKeys(store);
  const unmatched = unmatchedSavedKeys(store);
  return {
    store,
    saved,
    unmatched,
    source,
    shouldPersist,
    migratedCount,
    unmatchedCount: unmatched.size,
  };
}

export function mergeSavedStores(
  left: SavedStoreV2,
  right: SavedStoreV2,
): SavedStoreV2 {
  const records: SavedRecords = {};
  const unmatched: SavedRecords = {};
  for (const key of new Set([
    ...Object.keys(left.records),
    ...Object.keys(right.records),
  ])) {
    const leftRecord = left.records[key];
    const rightRecord = right.records[key];
    if (leftRecord && rightRecord) records[key] = mergeSavedRecord(leftRecord, rightRecord);
    else if (leftRecord) records[key] = { ...leftRecord };
    else if (rightRecord) records[key] = { ...rightRecord };
  }
  for (const key of new Set([
    ...Object.keys(left.unmatched),
    ...Object.keys(right.unmatched),
  ])) {
    const leftRecord = left.unmatched[key];
    const rightRecord = right.unmatched[key];
    if (leftRecord && rightRecord) unmatched[key] = mergeSavedRecord(leftRecord, rightRecord);
    else if (leftRecord) unmatched[key] = { ...leftRecord };
    else if (rightRecord) unmatched[key] = { ...rightRecord };
  }
  return { version: SAVED_STORE_VERSION, records, unmatched };
}

function usableTimestamp(now: string, previous?: string): string {
  const requested = isTrackingTimestamp(now) ? now : new Date().toISOString();
  if (!previous || Date.parse(requested) > Date.parse(previous)) return requested;
  return new Date(Date.parse(previous) + 1).toISOString();
}

export function setSavedState(
  store: SavedStoreV2,
  trackingKey: string,
  saved: boolean,
  now = new Date().toISOString(),
): SavedStoreV2 {
  if (!isSafeTrackingKey(trackingKey)) return store;
  const previous = store.records[trackingKey];
  if (previous?.saved === saved) return store;
  return {
    ...store,
    records: {
      ...store.records,
      [trackingKey]: {
        saved,
        updatedAt: usableTimestamp(now, previous?.updatedAt),
      },
    },
  };
}

export function toggleSavedState(
  store: SavedStoreV2,
  trackingKey: string,
  now = new Date().toISOString(),
): SavedStoreV2 {
  return setSavedState(store, trackingKey, !store.records[trackingKey]?.saved, now);
}

export const migrateSavedRecords = migrateSavedTracking;

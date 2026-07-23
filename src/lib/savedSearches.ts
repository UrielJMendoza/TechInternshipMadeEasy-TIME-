import {
  parseStoredBoardFilters,
  type BoardFilters,
} from "./boardFilterState";

export const SAVED_SEARCH_STORAGE_KEY = "timley:saved-searches:v1";
export const SAVED_SEARCH_TOMBSTONE_STORAGE_KEY =
  "timley:saved-searches:tombstones:v1";
export const SAVED_SEARCH_CHANGE_EVENT = "timley:saved-searches:change";

export const MAX_SAVED_SEARCHES = 50;
export const MAX_SAVED_SEARCH_TOMBSTONES = 500;
export const MAX_SAVED_SEARCH_NAME_LENGTH = 80;
export const MAX_SAVED_SEARCH_STORAGE_LENGTH = 512_000;

const MAX_ID_LENGTH = 128;
const MAX_FILTER_STORAGE_LENGTH = 32_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FREQUENCIES = new Set<SavedSearchFrequency>([
  "instant",
  "daily",
  "weekly",
  "paused",
]);

export type SavedSearchFrequency =
  | "instant"
  | "daily"
  | "weekly"
  | "paused";

export interface SavedSearchChannels {
  inApp: boolean;
  browser: boolean;
  email: boolean;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: BoardFilters;
  frequency: SavedSearchFrequency;
  channels: SavedSearchChannels;
  createdAt: string;
  updatedAt: string;
}

export interface SavedSearchTombstone {
  id: string;
  deletedAt: string;
}

export interface SavedSearchState {
  searches: SavedSearch[];
  tombstones: SavedSearchTombstone[];
}

export interface CreateSavedSearchInput {
  name: string;
  filters: BoardFilters;
  frequency?: SavedSearchFrequency;
  channels?: Partial<SavedSearchChannels>;
}

interface CreateSavedSearchOptions {
  id?: string;
  now?: string | Date | number;
}

interface SavedSearchStorageEnvelope {
  version: 1;
  searches: SavedSearch[];
}

interface SavedSearchTombstoneStorageEnvelope {
  version: 1;
  tombstones: SavedSearchTombstone[];
}

const DEFAULT_CHANNELS: SavedSearchChannels = {
  inApp: true,
  browser: false,
  email: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (
    !id ||
    id.length > MAX_ID_LENGTH ||
    !ID_PATTERN.test(id) ||
    ["__proto__", "constructor", "prototype"].includes(id)
  ) {
    return null;
  }
  return id;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (
    !name ||
    name.length > MAX_SAVED_SEARCH_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    return null;
  }
  return name;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function normalizeFrequency(value: unknown): SavedSearchFrequency | null {
  return FREQUENCIES.has(value as SavedSearchFrequency)
    ? (value as SavedSearchFrequency)
    : null;
}

function normalizeChannels(value: unknown): SavedSearchChannels | null {
  if (
    !isRecord(value) ||
    typeof value.inApp !== "boolean" ||
    typeof value.browser !== "boolean" ||
    typeof value.email !== "boolean"
  ) {
    return null;
  }
  return {
    inApp: value.inApp,
    browser: value.browser,
    email: value.email,
  };
}

function normalizeFilters(value: unknown): BoardFilters | null {
  if (!isRecord(value)) return null;
  try {
    const raw = JSON.stringify(value);
    if (!raw || raw.length > MAX_FILTER_STORAGE_LENGTH) return null;
    // Keep this as a whole-snapshot parse. New BoardFilters fields, including
    // minimumSalary, are retained automatically when the canonical parser
    // learns about them instead of being manually copied here.
    return parseStoredBoardFilters(raw);
  } catch {
    return null;
  }
}

export function parseSavedSearch(value: unknown): SavedSearch | null {
  if (!isRecord(value)) return null;
  const id = normalizeId(value.id);
  const name = normalizeName(value.name);
  const filters = normalizeFilters(value.filters);
  const frequency = normalizeFrequency(value.frequency);
  const channels = normalizeChannels(value.channels);
  const createdAt = normalizeTimestamp(value.createdAt);
  const updatedAt = normalizeTimestamp(value.updatedAt);

  if (
    !id ||
    !name ||
    !filters ||
    !frequency ||
    !channels ||
    !createdAt ||
    !updatedAt ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    return null;
  }

  return {
    id,
    name,
    filters,
    frequency,
    channels,
    createdAt,
    updatedAt,
  };
}

export function parseSavedSearchTombstone(
  value: unknown,
): SavedSearchTombstone | null {
  if (!isRecord(value)) return null;
  const id = normalizeId(value.id);
  const deletedAt = normalizeTimestamp(value.deletedAt);
  return id && deletedAt ? { id, deletedAt } : null;
}

function searchTieBreaker(search: SavedSearch): string {
  return JSON.stringify(search);
}

function newerSearch(
  left: SavedSearch,
  right: SavedSearch,
): SavedSearch {
  const difference = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
  if (difference !== 0) return difference > 0 ? left : right;
  return searchTieBreaker(left) >= searchTieBreaker(right) ? left : right;
}

function sortSearches(searches: SavedSearch[]): SavedSearch[] {
  return searches.sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

function sortTombstones(
  tombstones: SavedSearchTombstone[],
): SavedSearchTombstone[] {
  return tombstones.sort(
    (left, right) =>
      Date.parse(right.deletedAt) - Date.parse(left.deletedAt) ||
      left.id.localeCompare(right.id),
  );
}

/**
 * Merge local/synced snapshots without allowing an older write to replace a
 * newer record. A tombstone at the same time as a record wins deliberately:
 * deletion is safer than resurrecting an alert on another device.
 */
export function mergeSavedSearchStates(
  ...states: readonly SavedSearchState[]
): SavedSearchState {
  const searchesById = new Map<string, SavedSearch>();
  const tombstonesById = new Map<string, SavedSearchTombstone>();

  for (const state of states) {
    if (!state) continue;
    if (Array.isArray(state.searches)) {
      for (const candidate of state.searches) {
        const search = parseSavedSearch(candidate);
        if (!search) continue;
        const existing = searchesById.get(search.id);
        searchesById.set(
          search.id,
          existing ? newerSearch(existing, search) : search,
        );
      }
    }

    if (Array.isArray(state.tombstones)) {
      for (const candidate of state.tombstones) {
        const tombstone = parseSavedSearchTombstone(candidate);
        if (!tombstone) continue;
        const existing = tombstonesById.get(tombstone.id);
        if (
          !existing ||
          Date.parse(tombstone.deletedAt) > Date.parse(existing.deletedAt)
        ) {
          tombstonesById.set(tombstone.id, tombstone);
        }
      }
    }
  }

  const searches = sortSearches(
    [...searchesById.values()].filter((search) => {
      const tombstone = tombstonesById.get(search.id);
      return (
        !tombstone ||
        Date.parse(search.updatedAt) > Date.parse(tombstone.deletedAt)
      );
    }),
  ).slice(0, MAX_SAVED_SEARCHES);

  const tombstones = sortTombstones([...tombstonesById.values()]).slice(
    0,
    MAX_SAVED_SEARCH_TOMBSTONES,
  );

  return { searches, tombstones };
}

function storageItems(
  raw: string | null,
  key: "searches" | "tombstones",
): unknown[] {
  if (!raw || raw.length > MAX_SAVED_SEARCH_STORAGE_LENGTH) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (
      isRecord(parsed) &&
      parsed.version === 1 &&
      Array.isArray(parsed[key])
    ) {
      return parsed[key];
    }
  } catch {
    // Corrupt or partially written storage is treated as empty.
  }
  return [];
}

export function parseStoredSavedSearches(raw: string | null): SavedSearch[] {
  return mergeSavedSearchStates({
    searches: storageItems(raw, "searches") as SavedSearch[],
    tombstones: [],
  }).searches;
}

export function parseStoredSavedSearchTombstones(
  raw: string | null,
): SavedSearchTombstone[] {
  return mergeSavedSearchStates({
    searches: [],
    tombstones: storageItems(raw, "tombstones") as SavedSearchTombstone[],
  }).tombstones;
}

export function serializeSavedSearches(
  searches: readonly SavedSearch[],
): string {
  const normalized = mergeSavedSearchStates({
    searches: [...searches],
    tombstones: [],
  }).searches;
  const envelope: SavedSearchStorageEnvelope = {
    version: 1,
    searches: normalized,
  };
  return JSON.stringify(envelope);
}

export function serializeSavedSearchTombstones(
  tombstones: readonly SavedSearchTombstone[],
): string {
  const normalized = mergeSavedSearchStates({
    searches: [],
    tombstones: [...tombstones],
  }).tombstones;
  const envelope: SavedSearchTombstoneStorageEnvelope = {
    version: 1,
    tombstones: normalized,
  };
  return JSON.stringify(envelope);
}

export function generateSavedSearchId(): string {
  const cryptoApi =
    typeof globalThis.crypto === "undefined" ? null : globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10).join(""),
    ].join("-");
  }

  return `saved-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

function optionTimestamp(value: string | Date | number | undefined): string {
  if (value === undefined) return new Date().toISOString();
  if (typeof value === "string") {
    return normalizeTimestamp(value) ?? new Date().toISOString();
  }
  const milliseconds = value instanceof Date ? value.getTime() : value;
  try {
    return Number.isFinite(milliseconds)
      ? new Date(milliseconds).toISOString()
      : new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function createSavedSearchRecord(
  input: CreateSavedSearchInput,
  options: CreateSavedSearchOptions = {},
): SavedSearch | null {
  const timestamp = optionTimestamp(options.now);
  return parseSavedSearch({
    id: options.id ?? generateSavedSearchId(),
    name: input.name,
    filters: input.filters,
    frequency: input.frequency ?? "daily",
    channels: {
      ...DEFAULT_CHANNELS,
      ...input.channels,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function timestampAfter(...timestamps: readonly string[]): string {
  const latest = timestamps.reduce((maximum, timestamp) => {
    const milliseconds = Date.parse(timestamp);
    return Number.isFinite(milliseconds)
      ? Math.max(maximum, milliseconds)
      : maximum;
  }, Date.now());
  try {
    return new Date(latest + 1).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

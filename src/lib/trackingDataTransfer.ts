import {
  APPLICATION_EXPORT_FORMAT,
  MAX_APPLICATION_IMPORT_BYTES,
  exportApplicationTrackingCsv,
  exportApplicationTrackingJson,
  importApplicationTrackingCsv,
  importApplicationTrackingJson,
  parseTrackingCsvRows,
  quoteTrackingCsvCell,
} from "./applicationTrackingTransfer";
import {
  MAX_TRACKING_RECORDS,
  isSafeTrackingKey,
  isTrackingTimestamp,
  type ApplicationStoreV3,
} from "./applicationTracking";
import {
  SAVED_STORE_VERSION,
  createEmptySavedStore,
  type SavedRecord,
  type SavedRecords,
  type SavedStoreV2,
} from "./savedTracking";

export const TRACKING_DATA_EXPORT_FORMAT = "timley-tracking-data";
export const TRACKING_DATA_EXPORT_VERSION = 1 as const;

const LEGACY_APPLICATION_CSV_HEADER =
  "record_type,key,stage,updated_at,applied_at,notes,next_action_at,deadline,recruiter,contact";
const CSV_HEADERS = [
  "data_type",
  "collection",
  "key",
  "saved",
  "stage",
  "updated_at",
  "applied_at",
  "notes",
  "next_action_at",
  "deadline",
  "recruiter",
  "contact",
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];
type Collection = "records" | "unmatched";

interface SavedTransferRow extends SavedRecord {
  key: string;
}

interface SavedTransferV2 {
  version: typeof SAVED_STORE_VERSION;
  records: SavedTransferRow[];
  unmatched: SavedTransferRow[];
}

interface TrackingDataTransferV1 {
  format: typeof TRACKING_DATA_EXPORT_FORMAT;
  version: typeof TRACKING_DATA_EXPORT_VERSION;
  exportedAt: string;
  applications: unknown;
  saved: SavedTransferV2;
}

export interface TrackingDataStore {
  applications: ApplicationStoreV3;
  saved: SavedStoreV2;
}

export interface ImportedTrackingData {
  applications: ApplicationStoreV3;
  /** Null means a legacy application-only backup was imported. */
  saved: SavedStoreV2 | null;
  source: "tracking-data" | "application-only";
}

export class TrackingDataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackingDataImportError";
  }
}

function fail(message: string): never {
  throw new TrackingDataImportError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertImportSize(raw: string): void {
  if (raw.length === 0) fail("The import is empty");
  if (
    raw.length > MAX_APPLICATION_IMPORT_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_APPLICATION_IMPORT_BYTES
  ) {
    fail("The import exceeds the 5 MB limit");
  }
}

function assertExactKeys(
  candidate: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(candidate)) {
    if (!allowedSet.has(key)) fail(`${context} contains an unknown field: ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(candidate, key)) fail(`${context} is missing ${key}`);
  }
}

function sortedSavedRows(records: SavedRecords): SavedTransferRow[] {
  return Object.entries(records)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, record]) => ({ key, ...record }));
}

function exportSavedStore(store: SavedStoreV2): SavedTransferV2 {
  return {
    version: SAVED_STORE_VERSION,
    records: sortedSavedRows(store.records),
    unmatched: sortedSavedRows(store.unmatched),
  };
}

function parseSavedRows(candidate: unknown, context: string): SavedRecords {
  if (!Array.isArray(candidate)) fail(`${context} must be an array`);
  if (candidate.length > MAX_TRACKING_RECORDS) {
    fail(`${context} contains too many records`);
  }
  const records: SavedRecords = {};
  for (const [index, value] of candidate.entries()) {
    const rowContext = `${context}[${index}]`;
    if (!isRecord(value)) fail(`${rowContext} must be an object`);
    assertExactKeys(value, ["key", "saved", "updatedAt"], rowContext);
    if (!isSafeTrackingKey(value.key)) fail(`${rowContext}.key is invalid`);
    if (typeof value.saved !== "boolean") fail(`${rowContext}.saved must be a boolean`);
    if (!isTrackingTimestamp(value.updatedAt)) {
      fail(`${rowContext}.updatedAt must be a valid ISO timestamp`);
    }
    if (Object.hasOwn(records, value.key)) {
      fail(`${context} contains a duplicate key: ${value.key}`);
    }
    records[value.key] = { saved: value.saved, updatedAt: value.updatedAt };
  }
  return records;
}

function importSavedStore(candidate: unknown): SavedStoreV2 {
  if (!isRecord(candidate)) fail("saved must be an object");
  assertExactKeys(candidate, ["version", "records", "unmatched"], "saved");
  if (candidate.version !== SAVED_STORE_VERSION) {
    fail("saved has an unsupported version");
  }
  const records = parseSavedRows(candidate.records, "saved.records");
  const unmatched = parseSavedRows(candidate.unmatched, "saved.unmatched");
  for (const key of Object.keys(unmatched)) {
    if (Object.hasOwn(records, key)) {
      fail(`saved uses key ${key} in both record collections`);
    }
  }
  if (Object.keys(records).length + Object.keys(unmatched).length > MAX_TRACKING_RECORDS) {
    fail("saved contains too many total records");
  }
  return { ...createEmptySavedStore(), records, unmatched };
}

function safeExportTimestamp(exportedAt: string): string {
  return isTrackingTimestamp(exportedAt) ? exportedAt : new Date().toISOString();
}

export function exportTrackingDataJson(
  store: TrackingDataStore,
  exportedAt = new Date().toISOString(),
): string {
  const timestamp = safeExportTimestamp(exportedAt);
  const transfer: TrackingDataTransferV1 = {
    format: TRACKING_DATA_EXPORT_FORMAT,
    version: TRACKING_DATA_EXPORT_VERSION,
    exportedAt: timestamp,
    applications: JSON.parse(
      exportApplicationTrackingJson(store.applications, timestamp),
    ) as unknown,
    saved: exportSavedStore(store.saved),
  };
  return JSON.stringify(transfer, null, 2);
}

export function importTrackingDataJson(raw: string): ImportedTrackingData {
  assertImportSize(raw);
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return fail("The JSON import is malformed");
  }
  if (!isRecord(candidate)) fail("The JSON import must be an object");

  if (candidate.format === APPLICATION_EXPORT_FORMAT) {
    return {
      applications: importApplicationTrackingJson(raw),
      saved: null,
      source: "application-only",
    };
  }

  assertExactKeys(
    candidate,
    ["format", "version", "exportedAt", "applications", "saved"],
    "The JSON import",
  );
  if (candidate.format !== TRACKING_DATA_EXPORT_FORMAT) {
    fail("The JSON import has an unsupported format");
  }
  if (candidate.version !== TRACKING_DATA_EXPORT_VERSION) {
    fail("The JSON import has an unsupported version");
  }
  if (!isTrackingTimestamp(candidate.exportedAt)) {
    fail("The JSON import has an invalid exportedAt timestamp");
  }
  if (!isRecord(candidate.applications)) {
    fail("applications must be an object");
  }

  return {
    applications: importApplicationTrackingJson(
      JSON.stringify(candidate.applications),
    ),
    saved: importSavedStore(candidate.saved),
    source: "tracking-data",
  };
}

function appCsvRows(store: ApplicationStoreV3): string[][] {
  return parseTrackingCsvRows(exportApplicationTrackingCsv(store).trimEnd()).slice(1);
}

function combinedApplicationRow(row: string[]): string[] {
  const [recordType, key, stage, updatedAt, appliedAt, notes, nextActionAt, deadline, recruiter, contact] = row;
  return [
    "application",
    recordType === "application" ? "records" : "unmatched",
    key,
    "",
    stage,
    updatedAt,
    appliedAt,
    notes,
    nextActionAt,
    deadline,
    recruiter,
    contact,
  ];
}

function combinedSavedRow(
  collection: Collection,
  key: string,
  record: SavedRecord,
): string[] {
  return [
    "saved",
    collection,
    key,
    String(record.saved),
    "",
    record.updatedAt,
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

export function exportTrackingDataCsv(store: TrackingDataStore): string {
  const rows: string[][] = [CSV_HEADERS.slice()];
  rows.push(...appCsvRows(store.applications).map(combinedApplicationRow));
  for (const collection of ["records", "unmatched"] as const) {
    for (const [key, record] of Object.entries(store.saved[collection]).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      rows.push(combinedSavedRow(collection, key, record));
    }
  }
  return `${rows.map((row) => row.map(quoteTrackingCsvCell).join(",")).join("\r\n")}\r\n`;
}

function rowValues(row: string[]): Record<CsvHeader, string> {
  return Object.fromEntries(
    CSV_HEADERS.map((header, index) => [header, row[index]]),
  ) as Record<CsvHeader, string>;
}

function legacyApplicationCsv(rows: Array<Record<CsvHeader, string>>): string {
  const legacyRows = rows.map((values) => [
    values.collection === "records" ? "application" : "unmatched",
    values.key,
    values.stage,
    values.updated_at,
    values.applied_at,
    values.notes,
    values.next_action_at,
    values.deadline,
    values.recruiter,
    values.contact,
  ]);
  return `${[
    LEGACY_APPLICATION_CSV_HEADER.split(","),
    ...legacyRows,
  ].map((row) => row.map(quoteTrackingCsvCell).join(",")).join("\r\n")}\r\n`;
}

export function importTrackingDataCsv(raw: string): ImportedTrackingData {
  assertImportSize(raw);
  const rows = parseTrackingCsvRows(raw.replace(/^\uFEFF/, ""));
  if (rows.length === 0) fail("The CSV import is empty");
  const header = rows[0];
  if (header.join(",") === LEGACY_APPLICATION_CSV_HEADER) {
    return {
      applications: importApplicationTrackingCsv(raw),
      saved: null,
      source: "application-only",
    };
  }
  if (
    header.length !== CSV_HEADERS.length ||
    header.some((value, index) => value !== CSV_HEADERS[index])
  ) {
    fail(`CSV headers must be exactly: ${CSV_HEADERS.join(",")}`);
  }

  const applicationRows: Array<Record<CsvHeader, string>> = [];
  const savedRecords: SavedRecords = {};
  const savedUnmatched: SavedRecords = {};
  let savedCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => cell === "")) continue;
    const rowNumber = index + 1;
    if (row.length !== CSV_HEADERS.length) {
      fail(`CSV row ${rowNumber} has ${row.length} columns; expected ${CSV_HEADERS.length}`);
    }
    const values = rowValues(row);
    if (values.collection !== "records" && values.collection !== "unmatched") {
      fail(`CSV row ${rowNumber} has an invalid collection`);
    }
    if (!isSafeTrackingKey(values.key)) fail(`CSV row ${rowNumber} has an invalid key`);

    if (values.data_type === "application") {
      if (values.saved !== "") fail(`CSV row ${rowNumber} must leave saved empty`);
      applicationRows.push(values);
      continue;
    }
    if (values.data_type !== "saved") {
      fail(`CSV row ${rowNumber} has an invalid data_type`);
    }
    if (
      values.stage !== "" ||
      values.applied_at !== "" ||
      values.notes !== "" ||
      values.next_action_at !== "" ||
      values.deadline !== "" ||
      values.recruiter !== "" ||
      values.contact !== ""
    ) {
      fail(`CSV row ${rowNumber} contains application fields for saved data`);
    }
    if (values.saved !== "true" && values.saved !== "false") {
      fail(`CSV row ${rowNumber} has an invalid saved value`);
    }
    if (!isTrackingTimestamp(values.updated_at)) {
      fail(`CSV row ${rowNumber} has an invalid updated_at timestamp`);
    }
    const target = values.collection === "records" ? savedRecords : savedUnmatched;
    if (Object.hasOwn(savedRecords, values.key) || Object.hasOwn(savedUnmatched, values.key)) {
      fail(`CSV row ${rowNumber} duplicates saved key ${values.key}`);
    }
    target[values.key] = {
      saved: values.saved === "true",
      updatedAt: values.updated_at,
    };
    savedCount += 1;
    if (savedCount > MAX_TRACKING_RECORDS) fail("The CSV import has too many saved records");
  }

  return {
    applications: importApplicationTrackingCsv(legacyApplicationCsv(applicationRows)),
    saved: {
      ...createEmptySavedStore(),
      records: savedRecords,
      unmatched: savedUnmatched,
    },
    source: "tracking-data",
  };
}

import {
  APPLICATION_STORE_VERSION,
  MAX_APPLICATION_CONTACT_LENGTH,
  MAX_APPLICATION_NOTES_LENGTH,
  MAX_TRACKING_RECORDS,
  createEmptyApplicationStore,
  isSafeTrackingKey,
  isTrackingTimestamp,
  parseApplicationRecord,
  type ApplicationRecord,
  type ApplicationRecords,
  type ApplicationStoreV3,
} from "./applicationTracking";

export const APPLICATION_EXPORT_FORMAT = "timley-application-tracking";
export const MAX_APPLICATION_IMPORT_BYTES = 5 * 1024 * 1024;

const CSV_HEADERS = [
  "record_type",
  "key",
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
type RecordType = "application" | "unmatched";

interface ApplicationTransferRow extends ApplicationRecord {
  key: string;
}

interface ApplicationTransferV3 {
  format: typeof APPLICATION_EXPORT_FORMAT;
  version: typeof APPLICATION_STORE_VERSION;
  exportedAt: string;
  applications: ApplicationTransferRow[];
  unmatched: ApplicationTransferRow[];
}

export class ApplicationTrackingImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationTrackingImportError";
  }
}

function fail(message: string): never {
  throw new ApplicationTrackingImportError(message);
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
  allowed: ReadonlySet<string>,
  required: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(candidate)) {
    if (!allowed.has(key)) fail(`${context} contains an unknown field: ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(candidate, key)) {
      fail(`${context} is missing the required ${key} field`);
    }
  }
}

const rootFields = new Set([
  "format",
  "version",
  "exportedAt",
  "applications",
  "unmatched",
]);
const rowFields = new Set([
  "key",
  "stage",
  "updatedAt",
  "appliedAt",
  "notes",
  "nextActionAt",
  "deadline",
  "recruiter",
  "contact",
]);

function toTransferRow(
  key: string,
  record: ApplicationRecord,
): ApplicationTransferRow {
  return { key, ...record };
}

function sortedRows(records: ApplicationRecords): ApplicationTransferRow[] {
  return Object.entries(records)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, record]) => toTransferRow(key, record));
}

function parseStrictApplicationRecord(
  candidate: Record<string, unknown>,
  context: string,
): ApplicationRecord {
  for (const field of ["appliedAt", "nextActionAt", "deadline"] as const) {
    if (
      Object.hasOwn(candidate, field) &&
      !isTrackingTimestamp(candidate[field])
    ) {
      fail(`${context}.${field} must be a valid ISO timestamp`);
    }
  }
  for (const [field, maximumLength] of [
    ["notes", MAX_APPLICATION_NOTES_LENGTH],
    ["recruiter", MAX_APPLICATION_CONTACT_LENGTH],
    ["contact", MAX_APPLICATION_CONTACT_LENGTH],
  ] as const) {
    if (
      Object.hasOwn(candidate, field) &&
      (typeof candidate[field] !== "string" ||
        candidate[field].length === 0 ||
        candidate[field].length > maximumLength)
    ) {
      fail(`${context}.${field} is invalid`);
    }
  }
  if (
    isTrackingTimestamp(candidate.appliedAt) &&
    isTrackingTimestamp(candidate.updatedAt) &&
    Date.parse(candidate.appliedAt) > Date.parse(candidate.updatedAt)
  ) {
    fail(`${context}.appliedAt cannot be later than updatedAt`);
  }
  const record = parseApplicationRecord(candidate);
  if (!record) fail(`${context} contains an invalid application record`);
  return record;
}

export function exportApplicationTrackingJson(
  store: ApplicationStoreV3,
  exportedAt = new Date().toISOString(),
): string {
  const safeExportedAt = isTrackingTimestamp(exportedAt)
    ? exportedAt
    : new Date().toISOString();
  const transfer: ApplicationTransferV3 = {
    format: APPLICATION_EXPORT_FORMAT,
    version: APPLICATION_STORE_VERSION,
    exportedAt: safeExportedAt,
    applications: sortedRows(store.records),
    unmatched: sortedRows(store.unmatched),
  };
  return JSON.stringify(transfer, null, 2);
}

function parseTransferRows(
  candidate: unknown,
  context: string,
): ApplicationRecords {
  if (!Array.isArray(candidate)) fail(`${context} must be an array`);
  if (candidate.length > MAX_TRACKING_RECORDS) {
    fail(`${context} contains too many records`);
  }

  const records: ApplicationRecords = {};
  for (const [index, value] of candidate.entries()) {
    const rowContext = `${context}[${index}]`;
    if (!isRecord(value)) fail(`${rowContext} must be an object`);
    assertExactKeys(value, rowFields, ["key", "stage", "updatedAt"], rowContext);
    if (!isSafeTrackingKey(value.key)) fail(`${rowContext}.key is invalid`);
    if (Object.hasOwn(records, value.key)) {
      fail(`${context} contains a duplicate key: ${value.key}`);
    }
    const record = parseStrictApplicationRecord(value, rowContext);
    records[value.key] = record;
  }
  return records;
}

/**
 * Strictly validate the complete JSON transfer schema. Storage parsing is
 * intentionally tolerant; user-initiated imports are rejected as a unit.
 */
export function importApplicationTrackingJson(raw: string): ApplicationStoreV3 {
  assertImportSize(raw);
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return fail("The JSON import is malformed");
  }
  if (!isRecord(candidate)) fail("The JSON import must be an object");
  assertExactKeys(
    candidate,
    rootFields,
    ["format", "version", "exportedAt", "applications", "unmatched"],
    "The JSON import",
  );
  if (candidate.format !== APPLICATION_EXPORT_FORMAT) {
    fail("The JSON import has an unsupported format");
  }
  if (candidate.version !== APPLICATION_STORE_VERSION) {
    fail("The JSON import has an unsupported version");
  }
  if (!isTrackingTimestamp(candidate.exportedAt)) {
    fail("The JSON import has an invalid exportedAt timestamp");
  }

  const records = parseTransferRows(candidate.applications, "applications");
  const unmatched = parseTransferRows(candidate.unmatched, "unmatched");
  for (const key of Object.keys(unmatched)) {
    if (Object.hasOwn(records, key)) {
      fail(`The JSON import uses key ${key} in both record collections`);
    }
  }
  if (Object.keys(records).length + Object.keys(unmatched).length > MAX_TRACKING_RECORDS) {
    fail("The JSON import contains too many total records");
  }
  return {
    ...createEmptyApplicationStore(),
    records,
    unmatched,
  };
}

const formulaPrefix = /^[\s\u0000-\u001f\uFEFF]*[=+\-@]/u;

/** Neutralize spreadsheet formulas without altering the in-app value. */
export function makeSpreadsheetSafe(value: string): string {
  return formulaPrefix.test(value) ? `'${value}` : value;
}

function removeSpreadsheetGuard(value: string): string {
  return value.startsWith("'") && formulaPrefix.test(value.slice(1))
    ? value.slice(1)
    : value;
}

export function quoteTrackingCsvCell(value: string): string {
  const safe = makeSpreadsheetSafe(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

function recordToCsvRow(
  type: RecordType,
  key: string,
  record: ApplicationRecord,
): string {
  return [
    type,
    key,
    record.stage,
    record.updatedAt,
    record.appliedAt ?? "",
    record.notes ?? "",
    record.nextActionAt ?? "",
    record.deadline ?? "",
    record.recruiter ?? "",
    record.contact ?? "",
  ]
    .map(quoteTrackingCsvCell)
    .join(",");
}

export function exportApplicationTrackingCsv(store: ApplicationStoreV3): string {
  const rows = [CSV_HEADERS.join(",")];
  for (const [key, record] of Object.entries(store.records).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    rows.push(recordToCsvRow("application", key, record));
  }
  for (const [key, record] of Object.entries(store.unmatched).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    rows.push(recordToCsvRow("unmatched", key, record));
  }
  return `${rows.join("\r\n")}\r\n`;
}

/** RFC 4180-style parser with strict quote placement and bounded input. */
export function parseTrackingCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;

  const finishCell = () => {
    row.push(removeSpreadsheetGuard(cell));
    cell = "";
    closedQuote = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (character === '"') {
        if (raw[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      fail("CSV contains characters after a closing quote");
    }
    if (character === '"') {
      if (cell.length > 0 || closedQuote) fail("CSV contains a misplaced quote");
      quoted = true;
    } else if (character === ",") {
      finishCell();
    } else if (character === "\n") {
      finishRow();
    } else if (character === "\r") {
      if (raw[index + 1] === "\n") index += 1;
      finishRow();
    } else {
      cell += character;
    }
  }
  if (quoted) fail("CSV contains an unterminated quoted field");
  if (cell.length > 0 || row.length > 0 || closedQuote) finishRow();
  return rows;
}

function csvRowRecord(
  values: Record<CsvHeader, string>,
  rowNumber: number,
): ApplicationRecord {
  const candidate: Record<string, string> = {
    stage: values.stage,
    updatedAt: values.updated_at,
  };
  if (values.applied_at) candidate.appliedAt = values.applied_at;
  if (values.notes) candidate.notes = values.notes;
  if (values.next_action_at) candidate.nextActionAt = values.next_action_at;
  if (values.deadline) candidate.deadline = values.deadline;
  if (values.recruiter) candidate.recruiter = values.recruiter;
  if (values.contact) candidate.contact = values.contact;
  return parseStrictApplicationRecord(candidate, `CSV row ${rowNumber}`);
}

export function importApplicationTrackingCsv(raw: string): ApplicationStoreV3 {
  assertImportSize(raw);
  const rows = parseTrackingCsvRows(raw.replace(/^\uFEFF/, ""));
  if (rows.length === 0) fail("The CSV import is empty");
  const header = rows[0];
  if (
    header.length !== CSV_HEADERS.length ||
    header.some((value, index) => value !== CSV_HEADERS[index])
  ) {
    fail(`CSV headers must be exactly: ${CSV_HEADERS.join(",")}`);
  }

  const records: ApplicationRecords = {};
  const unmatched: ApplicationRecords = {};
  let importedCount = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => cell === "")) continue;
    const rowNumber = index + 1;
    if (row.length !== CSV_HEADERS.length) {
      fail(`CSV row ${rowNumber} has ${row.length} columns; expected ${CSV_HEADERS.length}`);
    }
    const values = Object.fromEntries(
      CSV_HEADERS.map((headerName, column) => [headerName, row[column]]),
    ) as Record<CsvHeader, string>;
    if (values.record_type !== "application" && values.record_type !== "unmatched") {
      fail(`CSV row ${rowNumber} has an invalid record_type`);
    }
    if (!isSafeTrackingKey(values.key)) fail(`CSV row ${rowNumber} has an invalid key`);
    const target = values.record_type === "application" ? records : unmatched;
    if (Object.hasOwn(records, values.key) || Object.hasOwn(unmatched, values.key)) {
      fail(`CSV row ${rowNumber} duplicates key ${values.key}`);
    }
    target[values.key] = csvRowRecord(values, rowNumber);
    importedCount += 1;
    if (importedCount > MAX_TRACKING_RECORDS) fail("The CSV import has too many records");
  }

  return {
    ...createEmptyApplicationStore(),
    records,
    unmatched,
  };
}

// Concise aliases for call sites that already establish tracking context.
export const exportApplicationsJson = exportApplicationTrackingJson;
export const importApplicationsJson = importApplicationTrackingJson;
export const exportApplicationsCsv = exportApplicationTrackingCsv;
export const importApplicationsCsv = importApplicationTrackingCsv;

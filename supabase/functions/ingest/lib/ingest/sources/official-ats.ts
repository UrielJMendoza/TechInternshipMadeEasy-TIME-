import type {
  NormalizedJob,
  RoleType,
  SourceId,
} from "../../types.ts";
import {
  createSnapshot,
  type SnapshotIssue,
  type SourceSnapshot,
} from "../contracts.ts";
import {
  fetchFeedText,
  type FetchFeedOptions,
} from "../fetch.ts";
import {
  applyPostFilters,
  categorize,
  cleanLink,
  cleanText,
  dedupeKey,
  normalizePostedDate,
  requisitionIdFrom,
} from "../normalize.ts";
import { normalizeStructuredLocation } from "../location.ts";
import { parseJson } from "../schemas.ts";

type AtsProvider = "greenhouse" | "ashby" | "lever";

interface OfficialAtsBoard {
  source: SourceId;
  provider: AtsProvider;
  company: string;
  homepage: string;
  endpoint: string;
  parser_version: string;
}

/**
 * The employer name is intentionally configured here rather than trusted from
 * a shared ATS response. Each board remains an independently auditable source.
 */
export const OFFICIAL_ATS_BOARDS = {
  greenhouseTenstorrentUniversity: {
    source: "gh:tenstorrentuniversity",
    provider: "greenhouse",
    company: "Tenstorrent",
    homepage: "https://job-boards.greenhouse.io/tenstorrentuniversity",
    endpoint:
      "https://boards-api.greenhouse.io/v1/boards/tenstorrentuniversity/jobs",
    parser_version: "greenhouse-job-board-v1",
  },
  ashbyNotion: {
    source: "ashby:notion",
    provider: "ashby",
    company: "Notion",
    homepage: "https://jobs.ashbyhq.com/notion",
    endpoint:
      "https://api.ashbyhq.com/posting-api/job-board/notion?includeCompensation=true",
    parser_version: "ashby-job-posting-v1",
  },
  leverHermeus: {
    source: "lever:hermeus",
    provider: "lever",
    company: "Hermeus",
    homepage: "https://jobs.lever.co/hermeus",
    endpoint: "https://api.lever.co/v0/postings/hermeus",
    parser_version: "lever-postings-v1",
  },
} as const satisfies Record<string, OfficialAtsBoard>;

const JSON_CONTENT_TYPES = ["application/json", "text/plain"] as const;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const LEVER_PAGE_SIZE = 100;
const LEVER_MAX_PAGES = 20;
const MAX_TEXT_LENGTH = 10_000;

type FetchOptions = Pick<
  FetchFeedOptions,
  "fetchImpl" | "maxRetries" | "signal" | "timeoutMs"
>;

export interface LeverFetchOptions extends FetchOptions {
  /**
   * Smaller values are useful for deterministic fixture tests. Production is
   * capped at Lever's supported 100-row page size.
   */
  pageSize?: number;
  /** A hard completeness guard; production never exceeds 20 pages. */
  maxPages?: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

function nonemptyString(value: unknown): value is string {
  return boundedString(value) && value.trim().length > 0;
}

function optionalText(
  record: UnknownRecord,
  key: string,
): string | null {
  return boundedString(record[key]) ? record[key] : null;
}

function stableId(value: unknown): string | null {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return String(value);
  }
  if (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9._-]{2,127}$/i.test(value)
  ) {
    return value;
  }
  return null;
}

function issue(
  code: SnapshotIssue["code"],
  message: string,
  path?: string,
  row?: number,
): SnapshotIssue {
  return { code, message, path, row };
}

function invalidJsonSnapshot(
  board: OfficialAtsBoard,
  parseIssue: SnapshotIssue,
): SourceSnapshot {
  return createSnapshot(
    board.source,
    board.parser_version,
    [],
    {
      raw_count: 0,
      parsed_count: 0,
      accepted_count: 0,
      rejected_count: 0,
    },
    [parseIssue],
  );
}

/**
 * Classify from a provider's explicit employment type or the title only.
 * Descriptions are deliberately not accepted as an input.
 */
export function classifyEarlyCareerRole(
  title: string,
  providerRole: string | null | undefined = null,
): RoleType | null {
  if (/^intern(?:ship)?$/i.test(cleanText(providerRole ?? ""))) {
    return "internship";
  }

  const normalizedTitle = cleanText(title);
  if (/\b(?:intern(?:ship)?|co(?:-|\s)?op)\b/i.test(normalizedTitle)) {
    return "internship";
  }
  const isRecruitingLeadership =
    /\b(?:head|director|recruit(?:er|ing|ment)?|talent)\b/i.test(
      normalizedTitle,
    );
  if (isRecruitingLeadership) return null;
  if (
    /\b(?:new|recent)\s*[-/]\s*grad(?:uate)?\b/i.test(normalizedTitle) ||
    /\b(?:new|recent)\s+grad(?:uate)?\b/i.test(normalizedTitle) ||
    /\buniversity\s+graduate\b/i.test(normalizedTitle) ||
    /\bearly\s+career\b/i.test(normalizedTitle) ||
    /\bentry\s*[- ]\s*level\b/i.test(normalizedTitle) ||
    /\bgraduate\s+(?:engineer|developer|analyst|associate|program(?:me)?)\b/i
      .test(normalizedTitle)
  ) {
    return "new_grad";
  }
  return null;
}

function seasonFromTitle(title: string): string | null {
  const match = title.match(
    /\b(Spring|Summer|Fall|Autumn|Winter)\s+(20\d{2})\b/i,
  );
  if (!match) return null;
  const season = match[1].toLowerCase() === "autumn"
    ? "Fall"
    : `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
  return `${season} ${match[2]}`;
}

function finiteCompensationValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1_000_000_000
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function structuredSalary(
  currency: unknown,
  interval: unknown,
  minimum: unknown,
  maximum: unknown,
  intervalMap: Readonly<Record<string, string>>,
): string | null {
  if (
    currency !== "USD" ||
    typeof interval !== "string" ||
    !finiteCompensationValue(minimum) ||
    !finiteCompensationValue(maximum) ||
    maximum < minimum
  ) {
    return null;
  }
  const cadence = intervalMap[interval];
  if (!cadence) return null;
  if (minimum === maximum) return `$${money(minimum)}/${cadence}`;
  return `$${money(minimum)}–$${money(maximum)}/${cadence}`;
}

function joinLocations(values: readonly unknown[], remote = false): string {
  const seen = new Set<string>();
  for (const value of values) {
    if (!nonemptyString(value)) continue;
    const location = cleanText(value);
    if (location) seen.add(location);
  }
  if (seen.size > 0) return [...seen].join("; ");
  return remote ? "Remote" : "";
}

function eligibleUsLocation(rawLocation: string): {
  raw: string;
  display: string;
} | null {
  const normalized = normalizeStructuredLocation(rawLocation);
  if (!normalized.eligible) return null;
  return {
    raw: normalized.raw_location,
    display: normalized.display,
  };
}

/**
 * Align source-health accounting with the shared product policy. Expected
 * policy exclusions (for example an otherwise valid posting older than the
 * board's 120-day window) are removed from both the snapshot and its
 * denominator. Genuine candidate parse rejects remain visible in the counts.
 */
function createPolicyAlignedSnapshot(
  board: OfficialAtsBoard,
  jobs: NormalizedJob[],
  candidateCount: number,
  issues: SnapshotIssue[],
  now: number,
): SourceSnapshot {
  const parserRejectedCount = Math.max(candidateCount - jobs.length, 0);
  const policyAcceptedJobs = applyPostFilters(jobs, now);
  const healthCount = policyAcceptedJobs.length + parserRejectedCount;
  return createSnapshot(
    board.source,
    board.parser_version,
    policyAcceptedJobs,
    {
      raw_count: healthCount,
      parsed_count: healthCount,
      accepted_count: policyAcceptedJobs.length,
      rejected_count: parserRejectedCount,
    },
    issues,
  );
}

function sourceCategoryFromGreenhouse(metadata: unknown): string | null {
  if (!Array.isArray(metadata)) return null;
  for (const entry of metadata) {
    if (!isRecord(entry) || !boundedString(entry.name)) continue;
    if (!/career(?:s)? page tile|department|team/i.test(entry.name)) continue;
    if (nonemptyString(entry.value)) return cleanText(entry.value);
    if (Array.isArray(entry.value)) {
      const value = entry.value.find(nonemptyString);
      if (value) return cleanText(value);
    }
  }
  return null;
}

interface GreenhouseRow {
  id: string;
  internalJobId: string | null;
  title: string;
  location: string;
  link: string;
  firstPublished: string | null;
  requisitionId: string | null;
  metadata: unknown;
}

function greenhouseRow(
  value: unknown,
  rowNumber: number,
  issues: SnapshotIssue[],
): GreenhouseRow | null {
  if (!isRecord(value)) {
    issues.push(
      issue("invalid_row", "Expected a Greenhouse job object", undefined, rowNumber),
    );
    return null;
  }
  const id = stableId(value.id);
  const internalJobId = value.internal_job_id === null
    ? null
    : stableId(value.internal_job_id);
  const location = isRecord(value.location) && nonemptyString(value.location.name)
    ? value.location.name
    : null;
  if (
    !id ||
    internalJobId === null && value.internal_job_id !== null ||
    !nonemptyString(value.title) ||
    !location ||
    !nonemptyString(value.absolute_url)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Greenhouse row is missing a stable id, internal job id, title, location, or URL",
        undefined,
        rowNumber,
      ),
    );
    return null;
  }
  if (
    value.first_published !== undefined &&
    value.first_published !== null &&
    !boundedString(value.first_published)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Greenhouse first_published must be a string or null",
        "first_published",
        rowNumber,
      ),
    );
    return null;
  }
  if (
    value.requisition_id !== undefined &&
    value.requisition_id !== null &&
    stableId(value.requisition_id) === null
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Greenhouse requisition_id is invalid",
        "requisition_id",
        rowNumber,
      ),
    );
    return null;
  }
  if (
    value.metadata !== undefined &&
    value.metadata !== null &&
    !Array.isArray(value.metadata)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Greenhouse metadata must be an array or null",
        "metadata",
        rowNumber,
      ),
    );
    return null;
  }
  return {
    id,
    internalJobId,
    title: value.title,
    location,
    link: value.absolute_url,
    firstPublished: value.first_published ?? null,
    requisitionId: value.requisition_id === undefined ||
        value.requisition_id === null
      ? null
      : String(value.requisition_id),
    metadata: value.metadata,
  };
}

export function parseGreenhouseTenstorrentSnapshot(
  text: string,
  now = Date.now(),
): SourceSnapshot {
  const board = OFFICIAL_ATS_BOARDS.greenhouseTenstorrentUniversity;
  const decoded = parseJson(text);
  if (!decoded.success) return invalidJsonSnapshot(board, decoded.issue);

  const issues: SnapshotIssue[] = [];
  if (!isRecord(decoded.data) || !Array.isArray(decoded.data.jobs)) {
    return createSnapshot(
      board.source,
      board.parser_version,
      [],
      {},
      [
        issue(
          "invalid_schema",
          "Expected a Greenhouse envelope with a jobs array",
          "jobs",
        ),
      ],
    );
  }
  const rows = decoded.data.jobs;
  const total = isRecord(decoded.data.meta) ? decoded.data.meta.total : null;
  if (!Number.isSafeInteger(total) || (total as number) < 0) {
    issues.push(
      issue(
        "invalid_schema",
        "Greenhouse meta.total must be a nonnegative integer",
        "meta.total",
      ),
    );
  } else if (total !== rows.length) {
    issues.push(
      issue(
        "invalid_schema",
        `Greenhouse meta.total reported ${total} jobs but returned ${rows.length}`,
        "meta.total",
      ),
    );
  }

  const jobs: NormalizedJob[] = [];
  let candidateCount = 0;
  rows.forEach((candidate, index) => {
    const row = greenhouseRow(candidate, index + 1, issues);
    if (!row) return;

    // Greenhouse documents a null internal_job_id as a prospect post.
    if (row.internalJobId === null) return;
    const title = cleanText(row.title);
    const roleType = classifyEarlyCareerRole(title);
    if (!roleType) return;
    const normalizedLocation = eligibleUsLocation(cleanText(row.location));
    if (!normalizedLocation) return;
    candidateCount += 1;
    const link = cleanLink(row.link);
    if (!link) {
      issues.push(
        issue(
          "invalid_url",
          "Greenhouse absolute_url is not a valid HTTPS URL",
          "absolute_url",
          index + 1,
        ),
      );
      return;
    }
    const postedDate = normalizePostedDate(row.firstPublished, now);
    if (row.firstPublished && !postedDate) {
      issues.push(
        issue(
          "invalid_date",
          "Greenhouse first_published is not a valid posting date",
          "first_published",
          index + 1,
        ),
      );
      return;
    }
    const location = normalizedLocation.display;
    jobs.push({
      title,
      company: board.company,
      location,
      raw_title: title,
      raw_location: normalizedLocation.raw,
      category: categorize(
        title,
        sourceCategoryFromGreenhouse(row.metadata),
      ),
      role_type: roleType,
      season: seasonFromTitle(title),
      salary: null,
      link,
      source: board.source,
      source_url: board.homepage,
      source_us_only: false,
      external_id: row.id,
      requisition_id: requisitionIdFrom(
        title,
        row.requisitionId,
        link,
      ),
      sponsorship: null,
      posted_date: postedDate,
      dedupe_key: dedupeKey(board.company, title, location),
    });
  });

  // The full board is validated above, but ordinary full-time, non-US, and
  // shared product-policy exclusions are not parser rejects.
  return createPolicyAlignedSnapshot(
    board,
    jobs,
    candidateCount,
    issues,
    now,
  );
}

interface AshbyRow {
  id: string;
  title: string;
  location: string;
  secondaryLocations: string[];
  jobUrl: string;
  isListed: boolean;
  employmentType: string | null;
  workplaceType: string | null;
  department: string | null;
  team: string | null;
  publishedAt: string | null;
  compensation: UnknownRecord | null;
}

function ashbyRow(
  value: unknown,
  rowNumber: number,
  issues: SnapshotIssue[],
): AshbyRow | null {
  if (!isRecord(value)) {
    issues.push(
      issue("invalid_row", "Expected an Ashby job object", undefined, rowNumber),
    );
    return null;
  }
  const id = stableId(value.id);
  if (
    !id ||
    !nonemptyString(value.title) ||
    !boundedString(value.location) ||
    !nonemptyString(value.jobUrl) ||
    typeof value.isListed !== "boolean"
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Ashby row is missing a stable id, title, location, URL, or listing flag",
        undefined,
        rowNumber,
      ),
    );
    return null;
  }
  const nullableStrings = [
    "employmentType",
    "workplaceType",
    "department",
    "team",
    "publishedAt",
  ] as const;
  if (
    nullableStrings.some((key) =>
      value[key] !== undefined &&
      value[key] !== null &&
      !boundedString(value[key])
    )
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Ashby optional text fields must be strings or null",
        undefined,
        rowNumber,
      ),
    );
    return null;
  }
  if (
    value.secondaryLocations !== undefined &&
    !Array.isArray(value.secondaryLocations)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Ashby secondaryLocations must be an array",
        "secondaryLocations",
        rowNumber,
      ),
    );
    return null;
  }
  const secondaryLocations: string[] = [];
  for (const secondary of value.secondaryLocations ?? []) {
    if (!isRecord(secondary) || !nonemptyString(secondary.location)) {
      issues.push(
        issue(
          "invalid_row",
          "Ashby secondary location is missing its location text",
          "secondaryLocations",
          rowNumber,
        ),
      );
      return null;
    }
    secondaryLocations.push(secondary.location);
  }
  if (
    value.compensation !== undefined &&
    value.compensation !== null &&
    !isRecord(value.compensation)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Ashby compensation must be an object or null",
        "compensation",
        rowNumber,
      ),
    );
    return null;
  }
  return {
    id,
    title: value.title,
    location: value.location,
    secondaryLocations,
    jobUrl: value.jobUrl,
    isListed: value.isListed,
    employmentType: optionalText(value, "employmentType"),
    workplaceType: optionalText(value, "workplaceType"),
    department: optionalText(value, "department"),
    team: optionalText(value, "team"),
    publishedAt: optionalText(value, "publishedAt"),
    compensation: value.compensation ?? null,
  };
}

function ashbySalary(compensation: UnknownRecord | null): string | null {
  if (!compensation) return null;
  const components = compensation.summaryComponents;
  if (!Array.isArray(components)) return null;
  const salaryComponents = components.filter(
    (component) =>
      isRecord(component) && component.compensationType === "Salary",
  );
  if (salaryComponents.length !== 1) return null;
  const salary = salaryComponents[0];
  return structuredSalary(
    salary.currencyCode,
    salary.interval,
    salary.minValue,
    salary.maxValue,
    {
      "1 HOUR": "hr",
      "1 MONTH": "mo",
      "1 YEAR": "yr",
    },
  );
}

export function parseAshbyNotionSnapshot(
  text: string,
  now = Date.now(),
): SourceSnapshot {
  const board = OFFICIAL_ATS_BOARDS.ashbyNotion;
  const decoded = parseJson(text);
  if (!decoded.success) return invalidJsonSnapshot(board, decoded.issue);

  const issues: SnapshotIssue[] = [];
  if (!isRecord(decoded.data) || !Array.isArray(decoded.data.jobs)) {
    return createSnapshot(
      board.source,
      board.parser_version,
      [],
      {},
      [
        issue(
          "invalid_schema",
          "Expected an Ashby envelope with a jobs array",
          "jobs",
        ),
      ],
    );
  }
  if (decoded.data.apiVersion !== "1") {
    issues.push(
      issue(
        "invalid_schema",
        "Ashby apiVersion must be exactly \"1\"",
        "apiVersion",
      ),
    );
  }

  const rows = decoded.data.jobs;
  const jobs: NormalizedJob[] = [];
  let candidateCount = 0;
  rows.forEach((candidate, index) => {
    const row = ashbyRow(candidate, index + 1, issues);
    if (!row) return;
    if (!row.isListed) return;

    const title = cleanText(row.title);
    const roleType = classifyEarlyCareerRole(title, row.employmentType);
    if (!roleType) return;
    const rawLocation = joinLocations(
      [row.location, ...row.secondaryLocations],
      row.workplaceType?.toLowerCase() === "remote",
    );
    const normalizedLocation = eligibleUsLocation(rawLocation);
    if (!normalizedLocation) return;
    candidateCount += 1;
    const link = cleanLink(row.jobUrl);
    if (!link) {
      issues.push(
        issue(
          "invalid_url",
          "Ashby jobUrl is not a valid HTTPS URL",
          "jobUrl",
          index + 1,
        ),
      );
      return;
    }
    const postedDate = normalizePostedDate(row.publishedAt, now);
    if (row.publishedAt && !postedDate) {
      issues.push(
        issue(
          "invalid_date",
          "Ashby publishedAt is not a valid posting date",
          "publishedAt",
          index + 1,
        ),
      );
      return;
    }
    const location = normalizedLocation.display;
    const salary = ashbySalary(row.compensation);
    jobs.push({
      title,
      company: board.company,
      location,
      raw_title: title,
      raw_location: normalizedLocation.raw,
      category: categorize(title, row.department ?? row.team),
      role_type: roleType,
      season: seasonFromTitle(title),
      salary,
      link,
      source: board.source,
      source_url: board.homepage,
      source_us_only: false,
      external_id: row.id,
      requisition_id: null,
      sponsorship: null,
      posted_date: postedDate,
      dedupe_key: dedupeKey(board.company, title, location),
    });
  });

  return createPolicyAlignedSnapshot(
    board,
    jobs,
    candidateCount,
    issues,
    now,
  );
}

interface LeverRow {
  id: string;
  title: string;
  link: string;
  commitment: string | null;
  department: string | null;
  team: string | null;
  location: string;
  workplaceType: string | null;
  salaryRange: UnknownRecord | null;
}

function leverRow(
  value: unknown,
  rowNumber: number,
  issues: SnapshotIssue[],
): LeverRow | null {
  if (!isRecord(value)) {
    issues.push(
      issue("invalid_row", "Expected a Lever posting object", undefined, rowNumber),
    );
    return null;
  }
  const id = stableId(value.id);
  if (
    !id ||
    !nonemptyString(value.text) ||
    !nonemptyString(value.hostedUrl) ||
    !isRecord(value.categories)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Lever row is missing a stable id, title, hosted URL, or categories",
        undefined,
        rowNumber,
      ),
    );
    return null;
  }
  const categories = value.categories;
  const optionalCategoryStrings = [
    "commitment",
    "department",
    "team",
    "location",
  ] as const;
  if (
    optionalCategoryStrings.some((key) =>
      categories[key] !== undefined &&
      categories[key] !== null &&
      !boundedString(categories[key])
    )
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Lever category fields must be strings or null",
        "categories",
        rowNumber,
      ),
    );
    return null;
  }
  if (
    categories.allLocations !== undefined &&
    (!Array.isArray(categories.allLocations) ||
      categories.allLocations.some((location) => !nonemptyString(location)))
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Lever allLocations must contain location strings",
        "categories.allLocations",
        rowNumber,
      ),
    );
    return null;
  }
  if (
    value.workplaceType !== undefined &&
    value.workplaceType !== null &&
    !boundedString(value.workplaceType)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Lever workplaceType must be a string or null",
        "workplaceType",
        rowNumber,
      ),
    );
    return null;
  }
  if (
    value.salaryRange !== undefined &&
    value.salaryRange !== null &&
    !isRecord(value.salaryRange)
  ) {
    issues.push(
      issue(
        "invalid_row",
        "Lever salaryRange must be an object or null",
        "salaryRange",
        rowNumber,
      ),
    );
    return null;
  }
  const locations = Array.isArray(categories.allLocations)
    ? categories.allLocations
    : [categories.location];
  return {
    id,
    title: value.text,
    link: value.hostedUrl,
    commitment: optionalText(categories, "commitment"),
    department: optionalText(categories, "department"),
    team: optionalText(categories, "team"),
    location: joinLocations(
      locations,
      value.workplaceType?.toLowerCase() === "remote",
    ),
    workplaceType: optionalText(value, "workplaceType"),
    salaryRange: value.salaryRange ?? null,
  };
}

function leverSalary(salaryRange: UnknownRecord | null): string | null {
  if (!salaryRange) return null;
  return structuredSalary(
    salaryRange.currency,
    salaryRange.interval,
    salaryRange.min,
    salaryRange.max,
    {
      "per-hour-wage": "hr",
      "per-month-salary": "mo",
      "per-year-salary": "yr",
    },
  );
}

function decodedLeverPage(
  text: string,
  pageNumber: number,
  issues: SnapshotIssue[],
): unknown[] | null {
  const decoded = parseJson(text);
  if (!decoded.success) {
    issues.push({
      ...decoded.issue,
      path: `pages.${pageNumber}`,
    });
    return null;
  }
  if (!Array.isArray(decoded.data)) {
    issues.push(
      issue(
        "invalid_schema",
        "Expected a Lever page to be an array",
        `pages.${pageNumber}`,
      ),
    );
    return null;
  }
  return decoded.data;
}

export function parseLeverHermeusSnapshot(
  pageTexts: readonly string[],
  now = Date.now(),
): SourceSnapshot {
  const board = OFFICIAL_ATS_BOARDS.leverHermeus;
  const issues: SnapshotIssue[] = [];
  const jobs: NormalizedJob[] = [];
  const seenIds = new Set<string>();
  let candidateCount = 0;
  let globalRow = 0;

  pageTexts.forEach((text, pageIndex) => {
    const rows = decodedLeverPage(text, pageIndex + 1, issues);
    if (!rows) return;
    rows.forEach((candidate) => {
      globalRow += 1;
      const row = leverRow(candidate, globalRow, issues);
      if (!row) return;
      if (seenIds.has(row.id)) {
        issues.push(
          issue(
            "invalid_schema",
            `Lever pagination repeated posting id ${row.id}`,
            "id",
            globalRow,
          ),
        );
        return;
      }
      seenIds.add(row.id);

      const title = cleanText(row.title);
      const roleType = classifyEarlyCareerRole(title, row.commitment);
      if (!roleType) return;
      const normalizedLocation = eligibleUsLocation(row.location);
      if (!normalizedLocation) return;
      candidateCount += 1;
      const link = cleanLink(row.link);
      if (!link) {
        issues.push(
          issue(
            "invalid_url",
            "Lever hostedUrl is not a valid HTTPS URL",
            "hostedUrl",
            globalRow,
          ),
        );
        return;
      }
      const salary = leverSalary(row.salaryRange);
      jobs.push({
        title,
        company: board.company,
        location: normalizedLocation.display,
        raw_title: title,
        raw_location: normalizedLocation.raw,
        category: categorize(title, row.department ?? row.team),
        role_type: roleType,
        season: seasonFromTitle(title),
        salary,
        link,
        source: board.source,
        source_url: board.homepage,
        source_us_only: false,
        external_id: row.id,
        requisition_id: null,
        sponsorship: null,
        // Lever's createdAt is not documented as the publication timestamp.
        posted_date: null,
        dedupe_key: dedupeKey(
          board.company,
          title,
          normalizedLocation.display,
        ),
      });
    });
  });

  return createPolicyAlignedSnapshot(
    board,
    jobs,
    candidateCount,
    issues,
    now,
  );
}

function boundedFetchOptions(
  options: FetchOptions,
): FetchFeedOptions {
  return {
    ...options,
    maxBytes: MAX_RESPONSE_BYTES,
    expectedContentTypes: JSON_CONTENT_TYPES,
  };
}

export async function fetchGreenhouseTenstorrentSnapshot(
  options: FetchOptions = {},
): Promise<SourceSnapshot> {
  const board = OFFICIAL_ATS_BOARDS.greenhouseTenstorrentUniversity;
  const response = await fetchFeedText(
    board.endpoint,
    boundedFetchOptions(options),
  );
  return parseGreenhouseTenstorrentSnapshot(response.text);
}

export async function fetchAshbyNotionSnapshot(
  options: FetchOptions = {},
): Promise<SourceSnapshot> {
  const board = OFFICIAL_ATS_BOARDS.ashbyNotion;
  const response = await fetchFeedText(
    board.endpoint,
    boundedFetchOptions(options),
  );
  return parseAshbyNotionSnapshot(response.text);
}

function positiveBoundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(value)));
}

function leverPageUrl(skip: number, limit: number): string {
  const url = new URL(OFFICIAL_ATS_BOARDS.leverHermeus.endpoint);
  url.searchParams.set("mode", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("skip", String(skip));
  return url.toString();
}

/**
 * Lever does not return a total count, so a complete snapshot must walk pages
 * until a short page. Repeated IDs and a run of full pages through the hard cap
 * are treated as completeness failures rather than valid snapshots.
 */
export async function fetchLeverHermeusSnapshot(
  options: LeverFetchOptions = {},
): Promise<SourceSnapshot> {
  const pageSize = positiveBoundedInteger(
    options.pageSize,
    LEVER_PAGE_SIZE,
    LEVER_PAGE_SIZE,
  );
  const maxPages = positiveBoundedInteger(
    options.maxPages,
    LEVER_MAX_PAGES,
    LEVER_MAX_PAGES,
  );
  const { pageSize: _pageSize, maxPages: _maxPages, ...fetchOptions } = options;
  void _pageSize;
  void _maxPages;

  const pageTexts: string[] = [];
  const seenIds = new Set<string>();
  for (let page = 0; page < maxPages; page += 1) {
    const skip = page * pageSize;
    const response = await fetchFeedText(
      leverPageUrl(skip, pageSize),
      boundedFetchOptions(fetchOptions),
    );
    pageTexts.push(response.text);

    const validationIssues: SnapshotIssue[] = [];
    const rows = decodedLeverPage(response.text, page + 1, validationIssues);
    if (!rows) return parseLeverHermeusSnapshot(pageTexts);
    if (rows.length > pageSize) {
      throw new Error(
        `Lever returned ${rows.length} rows for a ${pageSize}-row page`,
      );
    }
    for (const candidate of rows) {
      if (!isRecord(candidate)) continue;
      const id = stableId(candidate.id);
      if (!id) continue;
      if (seenIds.has(id)) {
        throw new Error(`Lever pagination repeated posting id ${id}`);
      }
      seenIds.add(id);
    }
    if (rows.length < pageSize) {
      return parseLeverHermeusSnapshot(pageTexts);
    }
  }
  throw new Error(
    `Lever pagination reached the ${maxPages}-page safety limit without a short page`,
  );
}

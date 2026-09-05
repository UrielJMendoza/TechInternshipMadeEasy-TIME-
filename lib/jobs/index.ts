/**
 * Timley's demo jobs domain.
 *
 * The original nine-source ingestion catalog was not present in the supplied
 * starter. The catalog and records in this file are representative demo data,
 * deliberately labelled as such so they are not mistaken for production crawl
 * history. The public query surface mirrors a server-side repository and can be
 * replaced by a database-backed implementation without changing UI callers.
 */

export type SourceId =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "smartrecruiters"
  | "icims"
  | "jobvite"
  | "simplify"
  | "github-new-grad";

export type SourceKind = "official-ats" | "community-feed";

export type SourceCatalogEntry = {
  id: SourceId;
  name: string;
  type: SourceKind;
  typeLabel: "Official employer ATS" | "Community feed";
  description: string;
  authorityRank: number;
  expectedCadenceHours: number;
  isDemo: true;
};

export const DEMO_SOURCE_CATALOG_NOTICE =
  "Representative demo sources. Replace these entries with Timley’s verified production source catalog before launch.";

/** Shared by mock ingestion, source preference, health reporting, and the UI. */
export const SOURCE_CATALOG: readonly SourceCatalogEntry[] = Object.freeze([
  {
    id: "greenhouse",
    name: "Greenhouse",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer boards powered by Greenhouse.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "lever",
    name: "Lever",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer boards powered by Lever.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "ashby",
    name: "Ashby",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer boards powered by Ashby.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "workday",
    name: "Workday",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer career sites powered by Workday.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "smartrecruiters",
    name: "SmartRecruiters",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer boards powered by SmartRecruiters.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "icims",
    name: "iCIMS",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer career sites powered by iCIMS.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "jobvite",
    name: "Jobvite",
    type: "official-ats",
    typeLabel: "Official employer ATS",
    description: "Representative public employer boards powered by Jobvite.",
    authorityRank: 0,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "simplify",
    name: "Simplify community feed",
    type: "community-feed",
    typeLabel: "Community feed",
    description: "Representative community-discovered links that resolve to employer applications.",
    authorityRank: 1,
    expectedCadenceHours: 24,
    isDemo: true,
  },
  {
    id: "github-new-grad",
    name: "GitHub new-grad community list",
    type: "community-feed",
    typeLabel: "Community feed",
    description: "Representative community-maintained internship and new-grad links.",
    authorityRank: 1,
    expectedCadenceHours: 24,
    isDemo: true,
  },
]);

const SOURCE_BY_ID = new Map<SourceId, SourceCatalogEntry>(
  SOURCE_CATALOG.map((source) => [source.id, source]),
);
const SOURCE_ORDER = new Map<SourceId, number>(
  SOURCE_CATALOG.map((source, index) => [source.id, index]),
);

export type JobLevelFilter = "all" | "internship" | "new-grad";

export type JobMajorFilter =
  | "all"
  | "computer-science"
  | "engineering"
  | "business";

export type JobMajorOption = {
  id: JobMajorFilter;
  label: string;
  niches: Array<{ id: string; label: string }>;
};

/** The familiar Timley major groups, adapted to the current job taxonomy. */
export const JOB_MAJOR_OPTIONS: readonly JobMajorOption[] = Object.freeze([
  {
    id: "all",
    label: "All majors",
    niches: [{ id: "all", label: "All roles" }],
  },
  {
    id: "computer-science",
    label: "Computer Science",
    niches: [
      { id: "all", label: "All CS roles" },
      { id: "software-engineering", label: "Software Engineering" },
      { id: "cloud-infra", label: "Cloud / Infra" },
      { id: "site-reliability", label: "Site Reliability" },
      { id: "security", label: "Security" },
      { id: "data-ml", label: "Data / ML" },
      { id: "quant", label: "Quant" },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    niches: [
      { id: "all", label: "All engineering" },
      { id: "hardware-firmware", label: "Hardware / Firmware" },
      { id: "electrical", label: "Electrical" },
      { id: "mechanical", label: "Mechanical" },
      { id: "civil", label: "Civil" },
      { id: "aerospace", label: "Aerospace" },
      { id: "manufacturing", label: "Manufacturing" },
      { id: "industrial", label: "Industrial" },
      { id: "materials", label: "Materials" },
    ],
  },
  {
    id: "business",
    label: "Business",
    niches: [
      { id: "all", label: "All business" },
      { id: "finance", label: "Finance" },
      { id: "consulting", label: "Consulting" },
      { id: "accounting", label: "Accounting" },
      { id: "operations", label: "Operations" },
      { id: "product", label: "Product" },
      { id: "marketing", label: "Marketing" },
      { id: "supply-chain", label: "Supply Chain" },
    ],
  },
]);

const JOB_MAJOR_BY_ID = new Map(
  JOB_MAJOR_OPTIONS.map((major) => [major.id, major]),
);

/** Structurally matches app/components/job-types.ts. */
export type JobFilters = {
  q: string;
  /** Exact employer filter used by shareable company links. */
  company: string;
  level: JobLevelFilter;
  major: JobMajorFilter;
  niche: string;
  location: string;
  remote: boolean;
  sponsorship: boolean;
  source: string;
};

export const DEFAULT_FILTERS: Readonly<JobFilters> = Object.freeze({
  q: "",
  company: "",
  level: "all",
  major: "all",
  niche: "all",
  location: "",
  remote: false,
  sponsorship: false,
  source: "",
});

export type RawJobRecord = {
  sourceRecordId: string;
  sourceId: SourceId;
  companyName: string;
  canonicalEmployerId?: string;
  title: string;
  location: string;
  roleLevel: "Internship" | "New grad";
  workplace: "Remote" | "Hybrid" | "On-site" | "Not confirmed";
  category: string;
  team?: string;
  summary?: string;
  compensation?: string;
  sponsorship?: "Confirmed" | "Not offered";
  logoText: string;
  logoTone: string;
  applicationUrl: string;
  sourceUrl?: string;
  atsHostname?: string | null;
  requisitionId?: string | null;
  employerPostedAt?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  active: boolean;
};

export type CanonicalJob = {
  id: string;
  /** Compatibility alias for a prior public ID; never used when ambiguous. */
  legacyId?: string;
  /** Exact prior URL-derived IDs retained when provider canonicalization wins. */
  legacyIds?: readonly string[];
  dedupeKey: string | null;
  normalizedAtsHostname: string | null;
  normalizedEmployer: string;
  normalizedRequisitionId: string | null;
  primarySourceId: SourceId;
  contributingSourceIds: SourceId[];
  sourceRecordIds: string[];
  companyName: string;
  title: string;
  titleQuality?: "complete" | "truncated";
  eligibilityStatus?: "accepted" | "review" | "quarantined";
  location: string;
  roleLevel: "Internship" | "New grad";
  workplace: "Remote" | "Hybrid" | "On-site" | "Not confirmed";
  category: string;
  /** Exact taxonomy supplied by the production jobs repository, when present. */
  majorIds?: readonly string[];
  nicheIds?: readonly string[];
  team?: string;
  summary?: string;
  compensation?: string;
  sponsorship?: "Confirmed" | "Not offered";
  logoText: string;
  logoTone: string;
  companyDomain?: string;
  applicationUrl: string;
  employerPostedAt: string | null;
  dateProvenance?: "employer-verified" | "source-reported";
  /** Date-only employer values must not be presented with invented hour precision. */
  employerPostedPrecision?: "date" | "timestamp";
  firstSeenAt: string;
  lastSeenAt: string;
  lastCheckedAt?: string;
  sourceLabels?: readonly string[];
  evidenceUrl?: string;
  evidenceCheckedAt?: string;
  deadline?: string;
  degrees?: readonly string[];
  requirements?: readonly string[];
  active: boolean;
};

/** Structurally matches the UI's JobCardData type. */
export type JobListItem = {
  id: string;
  eligibilityNeedsReview?: boolean;
  evidenceUrl?: string;
  evidenceCheckedAt?: string;
  deadline?: string;
  degrees?: readonly string[];
  requirements?: readonly string[];
  legacyIds?: readonly string[];

  company: string;
  title: string;
  location: string;
  freshnessLabel: string;
  freshnessKind: "posted" | "reported" | "found";
  roleLevel: "Internship" | "New grad";
  workplace: "Remote" | "Hybrid" | "On-site" | "Not confirmed";
  compensation?: string;
  sponsorship?: "Confirmed" | "Not offered";
  logoText: string;
  logoTone: string;
  companyDomain?: string;
  applyUrl: string;
  sourceNames: string[];
  team?: string;
  summary?: string;
  titleIncomplete?: boolean;
  dateProvenance?: "employer-verified" | "source-reported";
  possibleRepost?: boolean;
  postedAt?: string | null;
  postedAtPrecision?: "date" | "timestamp";
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastCheckedAt?: string;
};

export type PopularCompany = {
  name: string;
  domain?: string;
  recentPostings: number;
};

export type Freshness = {
  kind: "posted" | "reported" | "found";
  at: string;
  label: string;
  precision: "date" | "timestamp";
  semanticLabel: "Verified employer posting date" | "Source-reported date" | "First observed by Timley";
};

export type SourceHealth = {
  id: SourceId;
  name: string;
  type: SourceKind;
  typeLabel: SourceCatalogEntry["typeLabel"];
  lastSuccessfulUpdateAt: string;
  healthy: boolean;
  isDemo: true;
};

export type FeedStats = {
  activeJobs: number;
  addedToday: number;
  addedThisWeek: number;
  newThisWeek: number;
  currentSources: number;
  healthySources: number;
  totalSources: number;
  lastCompleteUpdateAt: string;
  sourceHealth: SourceHealth[];
  catalogNotice: string;
};

export type JobPage = {
  items: JobListItem[];
  nextCursor: string | null;
  total: number;
  asOf: string;
  evaluatedAt: string;
  filters: JobFilters;
};

export const DEMO_CANONICAL_JOB_COUNT = 4_416;
export const DEFAULT_PAGE_SIZE = 36;
export const MAX_PAGE_SIZE = 60;
const CURSOR_VERSION = 5;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const FUTURE_DATE_TOLERANCE_MS = 6 * HOUR_MS;

function sourceFor(id: SourceId): SourceCatalogEntry {
  const source = SOURCE_BY_ID.get(id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  return source;
}

function isSourceId(value: string): value is SourceId {
  return SOURCE_BY_ID.has(value as SourceId);
}

function asDate(value: string | Date, fieldName: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${fieldName} must be a valid date`);
  }
  return date;
}

function canonicalTimestamp(value: string | Date, fieldName: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00.000Z`;
  }
  if (
    typeof value === "string" &&
    !/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)
  ) {
    throw new TypeError(`${fieldName} must include a timezone`);
  }
  return asDate(value, fieldName).toISOString();
}

function optionalCanonicalTimestamp(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  if (!value) return null;
  try {
    return canonicalTimestamp(value, fieldName);
  } catch {
    return null;
  }
}

/**
 * Normalizes known ATS aliases while retaining a Workday/iCIMS tenant when it
 * is present. Unknown valid hosts remain host-specific; they are not guessed.
 */
export function normalizeAtsHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  let hostname: string;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    hostname = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  hostname = hostname.replace(/^www\./, "");

  if (/^(?:boards|job-boards|job-boards\.eu)\.greenhouse\.io$/.test(hostname)) {
    return "greenhouse.io";
  }
  if (/^(?:jobs|api)\.lever\.co$/.test(hostname)) return "lever.co";
  if (/^(?:jobs|api)\.ashbyhq\.com$/.test(hostname)) return "ashbyhq.com";
  if (/^(?:jobs|careers)\.smartrecruiters\.com$/.test(hostname)) {
    return "smartrecruiters.com";
  }
  if (/^(?:jobs|hire)\.jobvite\.com$/.test(hostname)) return "jobvite.com";

  const workday = hostname.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workday) return `${workday[1]}.myworkdayjobs.com`;

  const icims = hostname.match(/^(?:careers?|jobs)-([a-z0-9-]+)\.icims\.com$/);
  if (icims) return `${icims[1]}.icims.com`;

  return hostname || null;
}

/** Conservative normalization; explicit canonical employer IDs are preferred. */
export function normalizeEmployer(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+(?:incorporated|inc|limited|ltd|llc|corporation|corp|company|co|plc)$/i, "")
    .trim();
  return normalized || null;
}

/** Requisition punctuation is preserved to avoid broad, uncertain merging. */
export function normalizeRequisitionId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, "")
    .toLocaleUpperCase("en-US");
  return normalized || null;
}

export function isTruncatedJobTitle(value: string): boolean {
  return /(?:\.{3}|…)(?:\s*)$/u.test(value.normalize("NFKC").trim());
}

function hasExplicitEarlyCareerEvidence(title: string): boolean {
  return /\b(?:intern(?:ship)?|co(?:-|\s)?op|new\s*(?:-|\/|\s)\s*grad(?:uate)?|recent\s*(?:-|\/|\s)\s*grad(?:uate)?|university\s+graduate|early\s+career|entry\s*(?:-|\s)\s*level|graduate|student|trainee|apprentice|junior)\b/i.test(title);
}

/** Title signals request review; only employer evidence can exclude a discovered role. */
export function classifyEarlyCareerEligibility(
  title: string,
  roleLevel: CanonicalJob["roleLevel"],
): "accepted" | "review" | "quarantined" {
  const normalized = title.normalize("NFKC").trim();
  if (roleLevel === "Internship" || hasExplicitEarlyCareerEvidence(normalized)) return "accepted";
  if (/\b(?:senior|sr|principal|staff|lead|architect|director|manager|head|vice president|vp|postdoc|postdoctoral)\b/i.test(normalized) ||
      /\b(?:engineer|developer|scientist|analyst|level|grade)\s+(?:ii|iii|iv|[2-9])\b/i.test(normalized)) return "review";
  return "accepted";
}

function isPubliclyEligible(job: CanonicalJob): boolean {
  return job.eligibilityStatus !== "quarantined";
}

export type AtsIdentityInput = Pick<
  RawJobRecord,
  "atsHostname" | "applicationUrl" | "canonicalEmployerId" | "companyName" | "requisitionId"
>;

/** Returns null unless every high-confidence component is present. */
export function buildAtsDedupeKey(record: AtsIdentityInput): string | null {
  const hostname = normalizeAtsHostname(record.atsHostname ?? record.applicationUrl);
  const employer = normalizeEmployer(record.canonicalEmployerId ?? record.companyName);
  const requisition = normalizeRequisitionId(record.requisitionId);
  if (!hostname || !employer || !requisition) return null;
  return [hostname, employer, requisition].join("\u001f");
}

/** Genuine employer dates are nullable and are never replaced with discovery time. */
export function sanitizeEmployerPostedAt(
  value: string | null | undefined,
  now: string | Date,
): string | null {
  const canonical = optionalCanonicalTimestamp(value, "employerPostedAt");
  if (!canonical) return null;
  const futureBoundary = asDate(now, "now").getTime() + FUTURE_DATE_TOLERANCE_MS;
  return Date.parse(canonical) <= futureBoundary ? canonical : null;
}

type PreparedRecord = RawJobRecord & {
  dedupeKey: string | null;
  normalizedAtsHostname: string | null;
  normalizedEmployer: string;
  normalizedRequisitionId: string | null;
  employerPostedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function prepareRecord(record: RawJobRecord, now: string | Date): PreparedRecord {
  const source = sourceFor(record.sourceId);
  const normalizedEmployer = normalizeEmployer(
    record.canonicalEmployerId ?? record.companyName,
  );
  if (!normalizedEmployer) {
    throw new TypeError(`Record ${record.sourceRecordId} has no usable employer`);
  }
  const firstSeenAt = canonicalTimestamp(record.firstSeenAt, "firstSeenAt");
  const lastSeenAt = canonicalTimestamp(record.lastSeenAt, "lastSeenAt");
  if (Date.parse(lastSeenAt) < Date.parse(firstSeenAt)) {
    throw new TypeError(`Record ${record.sourceRecordId} was last seen before it was first seen`);
  }

  return {
    ...record,
    normalizedAtsHostname: normalizeAtsHostname(
      record.atsHostname ?? record.applicationUrl,
    ),
    normalizedEmployer,
    normalizedRequisitionId: normalizeRequisitionId(record.requisitionId),
    dedupeKey: buildAtsDedupeKey(record),
    // Community timestamps are discovery evidence, not genuine employer dates.
    employerPostedAt:
      source.type === "official-ats"
        ? sanitizeEmployerPostedAt(record.employerPostedAt, now)
        : null,
    firstSeenAt,
    lastSeenAt,
  };
}

function lexicalCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePrimaryRecords(a: PreparedRecord, b: PreparedRecord): number {
  const aSource = sourceFor(a.sourceId);
  const bSource = sourceFor(b.sourceId);
  return (
    aSource.authorityRank - bSource.authorityRank ||
    Number(!a.employerPostedAt) - Number(!b.employerPostedAt) ||
    (SOURCE_ORDER.get(a.sourceId) ?? 999) - (SOURCE_ORDER.get(b.sourceId) ?? 999) ||
    lexicalCompare(a.sourceRecordId, b.sourceRecordId)
  );
}

function fnv1a64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let high = 0x811c9dc5;
  let low = 0x9e3779b1;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    high = Math.imul(high ^ byte, 0x01000193) >>> 0;
    low = Math.imul(low ^ (byte + index), 0x01000193) >>> 0;
  }
  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}

function canonicalJobId(group: PreparedRecord[]): string {
  const key = group[0].dedupeKey;
  const identity = key ?? `${group[0].sourceId}\u001f${group[0].sourceRecordId}`;
  return `job_${fnv1a64(identity)}`;
}

/**
 * Merges only exact ATS/employer/requisition matches. Similar titles, locations,
 * or employers without the full key remain distinct by design.
 */
export function deduplicateJobs(
  records: readonly RawJobRecord[],
  options: { now?: string | Date } = {},
): CanonicalJob[] {
  const now = options.now ?? new Date();
  const groups = new Map<string, PreparedRecord[]>();

  for (const rawRecord of records) {
    const record = prepareRecord(rawRecord, now);
    const groupKey =
      record.dedupeKey ?? `source-record\u001f${record.sourceId}\u001f${record.sourceRecordId}`;
    const group = groups.get(groupKey);
    if (group) group.push(record);
    else groups.set(groupKey, [record]);
  }

  return [...groups.values()].map((unsortedGroup) => {
    const group = [...unsortedGroup].sort(comparePrimaryRecords);
    const primary = group[0];
    const officialRecords = group.filter(
      (record) => sourceFor(record.sourceId).type === "official-ats",
    );
    const datedOfficial = officialRecords.find((record) => record.employerPostedAt);
    const contributingSourceIds = [...new Set(group.map((record) => record.sourceId))].sort(
      (a, b) => (SOURCE_ORDER.get(a) ?? 999) - (SOURCE_ORDER.get(b) ?? 999),
    );
    const activeEvidence = officialRecords.length > 0 ? officialRecords : group;
    const titleRecord = [...group].sort((left, right) =>
      Number(isTruncatedJobTitle(left.title)) - Number(isTruncatedJobTitle(right.title)) ||
      comparePrimaryRecords(left, right) ||
      right.title.length - left.title.length
    )[0];
    const titleQuality = isTruncatedJobTitle(titleRecord.title) ? "truncated" : "complete";

    return {
      id: canonicalJobId(group),
      dedupeKey: primary.dedupeKey,
      normalizedAtsHostname: primary.normalizedAtsHostname,
      normalizedEmployer: primary.normalizedEmployer,
      normalizedRequisitionId: primary.normalizedRequisitionId,
      primarySourceId: primary.sourceId,
      contributingSourceIds,
      sourceRecordIds: group.map((record) => record.sourceRecordId).sort(lexicalCompare),
      companyName: primary.companyName,
      title: titleRecord.title,
      titleQuality,
      eligibilityStatus: classifyEarlyCareerEligibility(titleRecord.title, primary.roleLevel),
      location: primary.location,
      roleLevel: primary.roleLevel,
      workplace: primary.workplace,
      category: primary.category,
      team: primary.team,
      summary: primary.summary,
      compensation: primary.compensation,
      sponsorship: primary.sponsorship,
      logoText: primary.logoText,
      logoTone: primary.logoTone,
      applicationUrl: primary.applicationUrl,
      employerPostedAt: datedOfficial?.employerPostedAt ?? null,
      dateProvenance: datedOfficial ? "employer-verified" : undefined,
      employerPostedPrecision: datedOfficial ? "timestamp" : undefined,
      firstSeenAt: group
        .map((record) => record.firstSeenAt)
        .sort(lexicalCompare)[0],
      lastSeenAt: group
        .map((record) => record.lastSeenAt)
        .sort(lexicalCompare)
        .at(-1)!,
      lastCheckedAt: group
        .map((record) => record.lastSeenAt)
        .sort(lexicalCompare)
        .at(-1)!,
      sourceLabels: contributingSourceIds.map((sourceId) => sourceFor(sourceId).name),
      active: activeEvidence.some((record) => record.active),
    };
  });
}

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function relativeDateLabel(
  timestamp: string,
  now: string | Date,
): string {
  const nowDate = asDate(now, "now");
  const then = asDate(timestamp, "timestamp");
  const elapsedMs = Math.max(0, nowDate.getTime() - then.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(elapsedMs / HOUR_MS);
  const days = Math.floor(elapsedMs / DAY_MS);

  const plural = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? "" : "s"} ago`;

  if (minutes < 1) return "Just now";
  if (minutes < 60) return plural(minutes, "minute");
  if (hours < 24) return plural(hours, "hour");
  if (days < 30) return plural(days, "day");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}

function relativeCalendarDateLabel(timestamp: string, now: string | Date): string {
  const nowDate = asDate(now, "now");
  const then = asDate(timestamp, "timestamp");
  const calendarDays = Math.max(
    0,
    Math.floor((utcDayStart(nowDate) - utcDayStart(then)) / DAY_MS),
  );
  if (calendarDays === 0) return "today";
  if (calendarDays === 1) return "yesterday";
  if (calendarDays < 30) return `${calendarDays} days ago`;
  if (calendarDays < 365) {
    const months = Math.floor(calendarDays / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }
  const years = Math.floor(calendarDays / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function getFreshness(job: CanonicalJob, now: string | Date): Freshness {
  if (job.employerPostedAt) {
    const precision = job.employerPostedPrecision ?? "timestamp";
    const verified = job.dateProvenance === "employer-verified";
    return {
      kind: verified ? "posted" : "reported",
      at: job.employerPostedAt,
      label: precision === "date"
        ? relativeCalendarDateLabel(job.employerPostedAt, now)
        : relativeDateLabel(job.employerPostedAt, now),
      precision,
      semanticLabel: verified ? "Verified employer posting date" : "Source-reported date",
    };
  }
  return {
    kind: "found",
    at: job.firstSeenAt,
    label: relativeDateLabel(job.firstSeenAt, now),
    precision: "timestamp",
    semanticLabel: "First observed by Timley",
  };
}

export function isNewThisWeek(job: CanonicalJob, now: string | Date): boolean {
  if (!job.employerPostedAt || job.dateProvenance !== "employer-verified") return false;
  const elapsed = asDate(now, "now").getTime() - Date.parse(job.employerPostedAt);
  return elapsed >= 0 && elapsed <= 7 * DAY_MS;
}

export type JobSortTuple = {
  sortAt: string;
  freshnessKind: "posted" | "reported" | "found";
  id: string;
};

export function getJobSortTuple(job: CanonicalJob): JobSortTuple {
  const usesVerifiedDate = Boolean(
    job.employerPostedAt && job.dateProvenance === "employer-verified",
  );
  return {
    sortAt: usesVerifiedDate ? job.employerPostedAt! :
      job.employerPostedAt && Date.parse(job.employerPostedAt) < Date.parse(job.firstSeenAt)
        ? job.employerPostedAt : job.firstSeenAt,
    freshnessKind: usesVerifiedDate
      ? "posted"
      : job.employerPostedAt
        ? "reported"
        : "found",
    id: job.id,
  };
}

function compareSortTuples(a: JobSortTuple, b: JobSortTuple): number {
  if (a.sortAt !== b.sortAt) return a.sortAt > b.sortAt ? -1 : 1;
  if (a.freshnessKind !== b.freshnessKind) {
    const order = { posted: 0, found: 1, reported: 2 } as const;
    return order[a.freshnessKind] - order[b.freshnessKind];
  }
  return lexicalCompare(a.id, b.id);
}

export function compareJobsNewestFirst(a: CanonicalJob, b: CanonicalJob): number {
  return compareSortTuples(getJobSortTuple(a), getJobSortTuple(b));
}

export function sortJobsNewestFirst(jobs: readonly CanonicalJob[]): CanonicalJob[] {
  return [...jobs].sort(compareJobsNewestFirst);
}

export type FeedSortTuple = JobSortTuple & {
  ageBucketMs: number;
  companyKey: string;
};

function relativeAgeBucketMs(timestamp: string, now: string | Date): number {
  const elapsedMs = Math.max(0, asDate(now, "now").getTime() - Date.parse(timestamp));
  const minutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(elapsedMs / HOUR_MS);
  const days = Math.floor(elapsedMs / DAY_MS);
  if (minutes < 1) return 0;
  if (minutes < 60) return minutes * 60_000;
  if (hours < 24) return hours * HOUR_MS;
  if (days < 30) return days * DAY_MS;
  if (days < 365) return Math.floor(days / 30) * 30 * DAY_MS;
  return Math.floor(days / 365) * 365 * DAY_MS;
}

export function getFeedSortTuple(
  job: CanonicalJob,
  now: string | Date,
): FeedSortTuple {
  const base = getJobSortTuple(job);
  return {
    ...base,
    ageBucketMs: relativeAgeBucketMs(base.sortAt, now),
    companyKey: job.normalizedEmployer || normalizeEmployer(job.companyName) || "",
  };
}

function compareFeedSortTuples(a: FeedSortTuple, b: FeedSortTuple): number {
  if (a.ageBucketMs !== b.ageBucketMs) return a.ageBucketMs - b.ageBucketMs;
  const companyOrder = lexicalCompare(a.companyKey, b.companyKey);
  if (companyOrder !== 0) return companyOrder;
  return compareSortTuples(a, b);
}

export function sortJobsForFeed(
  jobs: readonly CanonicalJob[],
  now: string | Date,
): CanonicalJob[] {
  return [...jobs].sort((a, b) =>
    compareFeedSortTuples(getFeedSortTuple(a, now), getFeedSortTuple(b, now))
  );
}

type SearchParamRecord = Record<string, string | string[] | undefined>;
type FilterInput = URLSearchParams | SearchParamRecord | Partial<JobFilters> | null | undefined;

function inputValue(input: FilterInput, key: string): string {
  if (!input) return "";
  if (input instanceof URLSearchParams) return input.get(key) ?? "";
  const value = input[key as keyof typeof input];
  if (Array.isArray(value)) return String(value[0] ?? "");
  if (typeof value === "boolean") return value ? "true" : "";
  return typeof value === "string" ? value : "";
}

function cleanText(value: string, maxLength: number): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function inputBoolean(value: string): boolean {
  return /^(?:1|true|on|yes)$/i.test(value);
}

/** Parses and validates all shareable feed filters. Unknown values fail closed. */
export function parseFilters(input: FilterInput = undefined): JobFilters {
  const q = cleanText(inputValue(input, "q"), 120);
  const company = cleanText(inputValue(input, "company"), 120);
  const location = cleanText(inputValue(input, "location"), 80);
  const levelValue = inputValue(input, "level");
  const level: JobLevelFilter =
    levelValue === "internship" || levelValue === "new-grad" ? levelValue : "all";
  const majorValue = inputValue(input, "major");
  const major: JobMajorFilter =
    majorValue === "computer-science" || majorValue === "engineering" || majorValue === "business"
      ? majorValue
      : "all";
  const requestedNiche = cleanText(inputValue(input, "niche"), 40);
  const majorDefinition = JOB_MAJOR_BY_ID.get(major) ?? JOB_MAJOR_OPTIONS[0];
  const niche = majorDefinition.niches.some((option) => option.id === requestedNiche)
    ? requestedNiche
    : "all";
  const sourceValue = inputValue(input, "source");

  return {
    q,
    company,
    level,
    major,
    niche,
    location,
    remote: inputBoolean(inputValue(input, "remote")),
    sponsorship: inputBoolean(inputValue(input, "sponsorship")),
    source: isSourceId(sourceValue) ? sourceValue : "",
  };
}

/** Stable parameter order makes URLs and cursor/filter binding deterministic. */
export function serializeFilters(filtersInput: FilterInput = undefined): string {
  const filters = parseFilters(filtersInput);
  const params = new URLSearchParams();
  if (filters.level !== "all") params.set("level", filters.level);
  if (filters.q) params.set("q", filters.q);
  if (filters.company) params.set("company", filters.company);
  if (filters.major !== "all") params.set("major", filters.major);
  if (filters.niche !== "all") params.set("niche", filters.niche);
  if (filters.location) params.set("location", filters.location);
  if (filters.remote) params.set("remote", "true");
  if (filters.sponsorship) params.set("sponsorship", "true");
  if (filters.source) params.set("source", filters.source);
  return params.toString();
}

export function buildJobsUrl(filters: FilterInput = undefined): string {
  const query = serializeFilters(filters);
  return query ? `/jobs?${query}` : "/jobs";
}

export const parseJobFilters = parseFilters;
export const serializeJobFilters = serializeFilters;

type CursorPayload = {
  version: 5;
  asOf: string;
  evaluatedAt: string;
  snapshotRevision: string;
  tuple: FeedSortTuple;
  filtersKey: string;
};

export class InvalidCursorError extends Error {
  constructor(message = "The jobs cursor is invalid") {
    super(message);
    this.name = "InvalidCursorError";
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 2_048) {
    throw new InvalidCursorError();
  }
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new InvalidCursorError();
  }
}

function validCanonicalIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function encodeJobCursor(payload: CursorPayload): string {
  const compact = [
    CURSOR_VERSION,
    payload.asOf,
    payload.evaluatedAt,
    payload.snapshotRevision,
    payload.tuple.ageBucketMs,
    payload.tuple.companyKey,
    payload.tuple.sortAt,
    payload.tuple.freshnessKind,
    payload.tuple.id,
    payload.filtersKey,
  ];
  return encodeBase64Url(JSON.stringify(compact));
}

export function decodeJobCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(cursor));
  } catch (error) {
    if (error instanceof InvalidCursorError) throw error;
    throw new InvalidCursorError();
  }
  if (!Array.isArray(parsed) || parsed.length !== 10) throw new InvalidCursorError();
  const [
    version,
    asOf,
    evaluatedAt,
    snapshotRevision,
    ageBucketMs,
    companyKey,
    sortAt,
    freshnessKind,
    id,
    filtersKey,
  ] = parsed;
  if (
    version !== CURSOR_VERSION ||
    !validCanonicalIso(asOf) ||
    !validCanonicalIso(evaluatedAt) ||
    typeof snapshotRevision !== "string" ||
    !/^[a-f0-9]{16}$/.test(snapshotRevision) ||
    !Number.isSafeInteger(ageBucketMs) ||
    ageBucketMs < 0 ||
    typeof companyKey !== "string" ||
    companyKey.length > 160 ||
    !validCanonicalIso(sortAt) ||
    (freshnessKind !== "posted" && freshnessKind !== "reported" && freshnessKind !== "found") ||
    typeof id !== "string" ||
    id.length < 1 ||
    id.length > 128 ||
    typeof filtersKey !== "string" ||
    filtersKey.length > 600
  ) {
    throw new InvalidCursorError();
  }
  return {
    version: 5,
    asOf,
    evaluatedAt,
    snapshotRevision,
    tuple: { ageBucketMs, companyKey, sortAt, freshnessKind, id },
    filtersKey,
  };
}

type DemoCompany = {
  name: string;
  slug: string;
  logoText: string;
  logoTone: string;
};

const DEMO_COMPANIES: readonly DemoCompany[] = [
  { name: "Stripe", slug: "stripe", logoText: "ST", logoTone: "lilac" },
  { name: "Figma", slug: "figma", logoText: "FI", logoTone: "mint" },
  { name: "Notion", slug: "notion", logoText: "NO", logoTone: "ink" },
  { name: "Linear", slug: "linear", logoText: "LI", logoTone: "sand" },
  { name: "Duolingo", slug: "duolingo", logoText: "DU", logoTone: "sky" },
  { name: "Aesop", slug: "aesop", logoText: "AE", logoTone: "rose" },
  { name: "Gensler", slug: "gensler", logoText: "GE", logoTone: "mint" },
  { name: "Hootsuite", slug: "hootsuite", logoText: "HO", logoTone: "lilac" },
  { name: "NVIDIA", slug: "nvidia", logoText: "NV", logoTone: "sand" },
  { name: "Google", slug: "google", logoText: "GO", logoTone: "ink" },
  { name: "Apple", slug: "apple", logoText: "AP", logoTone: "rose" },
  { name: "Amazon", slug: "amazon", logoText: "AM", logoTone: "sky" },
  { name: "Microsoft", slug: "microsoft", logoText: "MS", logoTone: "mint" },
  { name: "Meta", slug: "meta", logoText: "ME", logoTone: "sand" },
  { name: "TikTok", slug: "tiktok", logoText: "TT", logoTone: "ink" },
  { name: "Cloudflare", slug: "cloudflare", logoText: "CF", logoTone: "lilac" },
  { name: "Capital One", slug: "capital-one", logoText: "CO", logoTone: "rose" },
  { name: "Palantir", slug: "palantir", logoText: "PA", logoTone: "sky" },
  { name: "Cisco", slug: "cisco", logoText: "CI", logoTone: "mint" },
  { name: "Tesla", slug: "tesla", logoText: "TE", logoTone: "sand" },
  { name: "SpaceX", slug: "spacex", logoText: "SX", logoTone: "ink" },
  { name: "Anduril", slug: "anduril", logoText: "AN", logoTone: "lilac" },
  { name: "Zoox", slug: "zoox", logoText: "ZO", logoTone: "sky" },
  { name: "Handshake", slug: "handshake", logoText: "HA", logoTone: "rose" },
  { name: "Goldman Sachs", slug: "goldman-sachs", logoText: "GS", logoTone: "mint" },
  { name: "JPMorgan Chase", slug: "jpmorgan-chase", logoText: "JP", logoTone: "sand" },
  { name: "Jane Street", slug: "jane-street", logoText: "JS", logoTone: "ink" },
  { name: "Optiver", slug: "optiver", logoText: "OP", logoTone: "lilac" },
  { name: "Vanguard", slug: "vanguard", logoText: "VA", logoTone: "rose" },
  { name: "Boeing", slug: "boeing", logoText: "BO", logoTone: "sky" },
  { name: "Northrop Grumman", slug: "northrop-grumman", logoText: "NG", logoTone: "mint" },
  { name: "RTX", slug: "rtx", logoText: "RT", logoTone: "sand" },
  { name: "L3Harris", slug: "l3harris", logoText: "L3", logoTone: "ink" },
  { name: "Intel", slug: "intel", logoText: "IN", logoTone: "lilac" },
  { name: "ByteDance", slug: "bytedance", logoText: "BD", logoTone: "rose" },
  { name: "Tencent", slug: "tencent", logoText: "TC", logoTone: "sky" },
  { name: "Accenture", slug: "accenture", logoText: "AC", logoTone: "mint" },
  { name: "Lockheed Martin", slug: "lockheed-martin", logoText: "LM", logoTone: "sand" },
  { name: "The Trade Desk", slug: "the-trade-desk", logoText: "TD", logoTone: "ink" },
  { name: "Oracle", slug: "oracle", logoText: "OR", logoTone: "lilac" },
  { name: "LinkedIn", slug: "linkedin", logoText: "LK", logoTone: "rose" },
  { name: "ServiceNow", slug: "servicenow", logoText: "SN", logoTone: "sky" },
  { name: "Palo Alto Networks", slug: "palo-alto-networks", logoText: "PN", logoTone: "mint" },
  { name: "Anthropic", slug: "anthropic", logoText: "AT", logoTone: "sand" },
  { name: "Formlabs", slug: "formlabs", logoText: "FL", logoTone: "ink" },
  { name: "WHOOP", slug: "whoop", logoText: "WH", logoTone: "lilac" },
  { name: "Expedia Group", slug: "expedia-group", logoText: "EX", logoTone: "rose" },
  { name: "John Deere", slug: "john-deere", logoText: "JD", logoTone: "sky" },
];

const DEMO_ROLES = [
  ["Marketing Intern", "Marketing"],
  ["Financial Analyst, New Grad", "Finance"],
  ["Product Design Intern", "Design"],
  ["Software Engineer, New Grad", "Engineering"],
  ["Operations Associate", "Operations"],
  ["Data Science Intern", "Data"],
  ["Customer Success Associate", "Customer Success"],
  ["Hardware Engineering Intern", "Engineering"],
  ["Research Associate, New Grad", "Research"],
  ["Product Management Intern", "Product"],
  ["Supply Chain Analyst", "Operations"],
  ["Security Engineer, New Grad", "Security"],
  ["People Operations Intern", "People"],
  ["Business Development Associate", "Sales"],
  ["UX Research Intern", "Design"],
  ["Cloud Engineer, New Grad", "Engineering"],
  ["Site Reliability Intern", "Engineering"],
  ["Quantitative Analyst Intern", "Finance"],
  ["Electrical Engineering Intern", "Engineering"],
  ["Mechanical Engineering Intern", "Engineering"],
  ["Civil Engineering Intern", "Engineering"],
  ["Aerospace Engineering Intern", "Engineering"],
  ["Manufacturing Engineering Intern", "Engineering"],
  ["Industrial Engineering Intern", "Engineering"],
  ["Materials Engineering Intern", "Engineering"],
  ["Consulting Intern", "Operations"],
  ["Accounting Intern", "Finance"],
] as const;

const DEMO_LOCATIONS = [
  "Denver, CO",
  "New York, NY",
  "San Francisco, CA",
  "Austin, TX",
  "Chicago, IL",
  "Boston, MA",
  "Seattle, WA",
  "Atlanta, GA",
  "Los Angeles, CA",
  "Washington, DC",
  "Portland, OR",
  "Raleigh, NC",
] as const;

const OFFICIAL_HOSTS: Record<Exclude<SourceId, "simplify" | "github-new-grad">, string> = {
  greenhouse: "boards.greenhouse.io",
  lever: "jobs.lever.co",
  ashby: "jobs.ashbyhq.com",
  workday: "timley-demo.wd3.myworkdayjobs.com",
  smartrecruiters: "jobs.smartrecruiters.com",
  icims: "careers-timley-demo.icims.com",
  jobvite: "jobs.jobvite.com",
};
const OFFICIAL_SOURCE_IDS = SOURCE_CATALOG
  .filter((source) => source.type === "official-ats")
  .map((source) => source.id) as Array<Exclude<SourceId, "simplify" | "github-new-grad">>;

function subtractMinutes(timestamp: string, minutes: number): string {
  return new Date(Date.parse(timestamp) - minutes * 60_000).toISOString();
}

function demoRawRecord(index: number, asOf: string): RawJobRecord {
  const source = SOURCE_CATALOG[index % SOURCE_CATALOG.length];
  const companyIndex = (index * 5) % DEMO_COMPANIES.length;
  const roleIndex = Math.floor(index / DEMO_COMPANIES.length) % DEMO_ROLES.length;
  const listingVariant = Math.floor(
    index / (DEMO_COMPANIES.length * DEMO_ROLES.length),
  );
  const company = DEMO_COMPANIES[companyIndex];
  const [title, category] = DEMO_ROLES[roleIndex];
  const roleLevel = (companyIndex + roleIndex + listingVariant) % 2 === 0
    ? "Internship"
    : "New grad";
  const workplace = listingVariant === 0
    ? "Remote"
    : listingVariant === 2
      ? "Hybrid"
      : "On-site";
  const locationIndex = (
    companyIndex + roleIndex * 3 + listingVariant * 5
  ) % DEMO_LOCATIONS.length;
  const location = workplace === "Remote"
    ? "Remote · United States"
    : DEMO_LOCATIONS[locationIndex];
  const requisitionId = `TL-${String(index + 1).padStart(6, "0")}`;
  const targetSource = source.type === "official-ats"
    ? source.id as Exclude<SourceId, "simplify" | "github-new-grad">
    : OFFICIAL_SOURCE_IDS[index % OFFICIAL_SOURCE_IDS.length];
  const atsHostname = OFFICIAL_HOSTS[targetSource];
  const postedAgeMinutes = 35 + index * 43;
  const firstSeenAgeMinutes = 12 + index * 7.75;
  const isKnownOldBackfill = index === 41 || index === 887 || index === 2_441;
  const firstSeenAt = subtractMinutes(
    asOf,
    isKnownOldBackfill ? 35 + (index % 30) : firstSeenAgeMinutes,
  );
  const lastSeenAt = subtractMinutes(asOf, Math.min(8, index % 9));
  const employerPostedAt =
    source.type === "official-ats" && index % 19 !== 5
      ? subtractMinutes(
          asOf,
          isKnownOldBackfill ? 80 * 24 * 60 + index % 90 : postedAgeMinutes,
        )
      : null;
  const compensation = index % 4 === 0
    ? roleLevel === "Internship"
      ? `$${26 + index % 8} to $${34 + index % 10}/hr`
      : `$${76 + index % 24}k to $${98 + index % 28}k`
    : undefined;

  return {
    sourceRecordId: `${source.id}:${requisitionId}`,
    sourceId: source.id,
    companyName: company.name,
    canonicalEmployerId: company.slug,
    title: roleLevel === "Internship"
      ? title.replace(/, New Grad$/, "").replace(/Associate$/, "Intern")
      : title.replace(/ Intern$/, ", New Grad"),
    location,
    roleLevel,
    workplace,
    category,
    team: category,
    summary: `Join ${company.name} in an early-career ${category.toLowerCase()} role. This representative demo listing links out to an employer-style application page.`,
    compensation,
    sponsorship: index % 11 === 0 ? "Confirmed" : index % 7 === 0 ? "Not offered" : undefined,
    logoText: company.logoText,
    logoTone: company.logoTone,
    // example.com is intentionally used for this demo; its root is a stable
    // 200 response while the unique query keeps every application URL distinct.
    applicationUrl: `https://example.com/?job=${requisitionId.toLowerCase()}`,
    sourceUrl: `https://${atsHostname}/${company.slug}/jobs/${requisitionId}`,
    atsHostname,
    requisitionId,
    employerPostedAt,
    firstSeenAt,
    lastSeenAt,
    active: true,
  };
}

function aliasHostname(hostname: string): string {
  if (hostname === "boards.greenhouse.io") return "job-boards.greenhouse.io";
  if (hostname.includes(".wd3.myworkdayjobs.com")) {
    return hostname.replace(".wd3.", ".wd7.");
  }
  return `www.${hostname}`;
}

function duplicateCommunityRecord(
  original: RawJobRecord,
  index: number,
  asOf: string,
): RawJobRecord {
  const communityId: SourceId = index % 2 === 0 ? "simplify" : "github-new-grad";
  const mirroredApplicationUrl = new URL(original.applicationUrl);
  mirroredApplicationUrl.searchParams.set("utm_source", communityId);
  return {
    ...original,
    sourceRecordId: `${communityId}:mirror:${original.requisitionId}`,
    sourceId: communityId,
    companyName: `${original.companyName}, Inc.`,
    applicationUrl: mirroredApplicationUrl.toString(),
    atsHostname: aliasHostname(original.atsHostname ?? "boards.greenhouse.io"),
    // Even when a community record carries a date, dedupe treats it only as
    // discovery evidence and selects the official employer timestamp.
    employerPostedAt: subtractMinutes(asOf, 5),
    firstSeenAt: subtractMinutes(asOf, 20 + index),
    lastSeenAt: subtractMinutes(asOf, index % 4),
  };
}

export type DemoSnapshot = {
  asOf: string;
  /** Present when live reads fail and the feed is served from its last verified copy. */
  fallbackCapturedAt?: string;
  rawRecords: readonly RawJobRecord[];
  jobs: readonly CanonicalJob[];
};

const SNAPSHOT_CACHE = new Map<string, DemoSnapshot>();
const SNAPSHOT_REVISION_CACHE = new WeakMap<DemoSnapshot, string>();

function getSnapshotRevision(snapshot: DemoSnapshot): string {
  const cached = SNAPSHOT_REVISION_CACHE.get(snapshot);
  if (cached) return cached;
  const revisionMaterial = snapshot.jobs.map((job) => [
    job.id,
    job.active ? "1" : "0",
    job.normalizedEmployer,
    job.companyName,
    job.title,
    job.location,
    job.roleLevel,
    job.workplace,
    job.category,
    job.team ?? "",
    job.sponsorship ?? "",
    job.employerPostedAt ?? "",
    job.firstSeenAt,
    job.contributingSourceIds.join(","),
    job.majorIds?.join(",") ?? "",
    job.nicheIds?.join(",") ?? "",
  ].join("\u001f")).join("\u001e");
  const revision = fnv1a64(revisionMaterial);
  SNAPSHOT_REVISION_CACHE.set(snapshot, revision);
  return revision;
}

export function getDemoSnapshotAt(now: string | Date = new Date()): string {
  const date = asDate(now, "now");
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(date.getUTCHours() - 2);
  return date.toISOString();
}

/** Deterministic for a supplied asOf; no random data or request-time reordering. */
export function createDemoSnapshot(asOfInput: string | Date): DemoSnapshot {
  const asOf = canonicalTimestamp(asOfInput, "asOf");
  const cached = SNAPSHOT_CACHE.get(asOf);
  if (cached) return cached;

  const baseRecords = Array.from(
    { length: DEMO_CANONICAL_JOB_COUNT },
    (_, index) => demoRawRecord(index, asOf),
  );
  const duplicateIndexes = [0, 3, 14, 72, 311, 808, 1_207, 1_999, 2_407, 3_105, 4_004];
  const mirrorRecords = duplicateIndexes.map((index, mirrorIndex) =>
    duplicateCommunityRecord(baseRecords[index], mirrorIndex, asOf),
  );
  const rawRecords = [...baseRecords, ...mirrorRecords];
  const jobs = sortJobsNewestFirst(deduplicateJobs(rawRecords, { now: asOf }));
  if (jobs.length !== DEMO_CANONICAL_JOB_COUNT) {
    throw new Error(
      `Demo fixture expected ${DEMO_CANONICAL_JOB_COUNT} canonical jobs; received ${jobs.length}`,
    );
  }
  const snapshot: DemoSnapshot = Object.freeze({
    asOf,
    rawRecords: Object.freeze(rawRecords),
    jobs: Object.freeze(jobs),
  });
  SNAPSHOT_CACHE.set(asOf, snapshot);
  while (SNAPSHOT_CACHE.size > 4) {
    const oldestKey = SNAPSHOT_CACHE.keys().next().value;
    if (typeof oldestKey === "string") SNAPSHOT_CACHE.delete(oldestKey);
    else break;
  }
  return snapshot;
}

function resolveSnapshot(
  asOf: string | Date | undefined,
  now: string | Date,
): DemoSnapshot {
  return createDemoSnapshot(asOf ?? getDemoSnapshotAt(now));
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeTechnicalSearchText(value: string): string {
  return normalizeForSearch(
    value
      .replace(/\bc\+\+(?=\b|\s|$)/gi, " cplusplus ")
      .replace(/\bc#(?=\b|\s|$)/gi, " csharp ")
      .replace(/(?:^|\s)\.net(?=\b|\s|$)/gi, " dotnet ")
      .replace(/\bdot\s+net\b/gi, " dotnet "),
  );
}

const US_STATE_ALIASES = [
  ["alabama", "al"], ["alaska", "ak"], ["arizona", "az"], ["arkansas", "ar"],
  ["california", "ca"], ["colorado", "co"], ["connecticut", "ct"], ["delaware", "de"],
  ["florida", "fl"], ["georgia", "ga"], ["hawaii", "hi"], ["idaho", "id"],
  ["illinois", "il"], ["indiana", "in"], ["iowa", "ia"], ["kansas", "ks"],
  ["kentucky", "ky"], ["louisiana", "la"], ["maine", "me"], ["maryland", "md"],
  ["massachusetts", "ma"], ["michigan", "mi"], ["minnesota", "mn"], ["mississippi", "ms"],
  ["missouri", "mo"], ["montana", "mt"], ["nebraska", "ne"], ["nevada", "nv"],
  ["new hampshire", "nh"], ["new jersey", "nj"], ["new mexico", "nm"], ["new york", "ny"],
  ["north carolina", "nc"], ["north dakota", "nd"], ["ohio", "oh"], ["oklahoma", "ok"],
  ["oregon", "or"], ["pennsylvania", "pa"], ["rhode island", "ri"], ["south carolina", "sc"],
  ["south dakota", "sd"], ["tennessee", "tn"], ["texas", "tx"], ["utah", "ut"],
  ["vermont", "vt"], ["virginia", "va"], ["washington", "wa"], ["west virginia", "wv"],
  ["wisconsin", "wi"], ["wyoming", "wy"], ["district of columbia", "dc"],
] as const;
const US_STATE_ABBREVIATION_BY_NAME: ReadonlyMap<string, string> = new Map(US_STATE_ALIASES);
const US_STATE_NAME_BY_ABBREVIATION: ReadonlyMap<string, string> = new Map(
  US_STATE_ALIASES.map(([name, abbreviation]) => [abbreviation, name]),
);
const US_STATE_NAME_PATTERN = new RegExp(
  `\\b(?:${US_STATE_ALIASES
    .map(([name]) => name)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "g",
);

/** Normalizes common location aliases for duplicate detection without hiding the display value. */
export function normalizeLocationForIdentity(value: string): string {
  return normalizeForSearch(value)
    .replace(/\bunited states(?: of america)?\b/g, "us")
    .replace(/\bu s a?\b/g, "us")
    .replace(US_STATE_NAME_PATTERN, (name) =>
      US_STATE_ABBREVIATION_BY_NAME.get(name) ?? name
    )
    .trim()
    .replace(/\s+/g, " ");
}

function postalCodesInLocation(value: string): Set<string> {
  const postalCodes = new Set<string>();
  const delimitedCode = /(?:^|[,(/|])\s*([A-Z]{2})(?=\s*(?:$|[-,)/|]|\d{5}|\bor\s+[Rr]emote\b))/g;
  for (const match of value.matchAll(delimitedCode)) postalCodes.add(match[1].toLowerCase());
  const trailingCode = value.match(/\b([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if (trailingCode) postalCodes.add(trailingCode[1].toLowerCase());
  return postalCodes;
}

function locationSearchText(value: string): string {
  const original = normalizeForSearch(value);
  const canonical = normalizeLocationForIdentity(value);
  const expansions = new Set([original, canonical]);
  const postalCodes = postalCodesInLocation(value);
  for (const postalCode of postalCodes) {
    const stateName = US_STATE_NAME_BY_ABBREVIATION.get(postalCode);
    if (stateName) expansions.add(stateName);
  }
  return [...expansions].join(" ");
}

type SearchClause = { phrase: boolean; value: string };

function searchClauses(query: string): SearchClause[] {
  const clauses: SearchClause[] = [];
  const prepared = query
    .replace(/\bdot\s+net\b/gi, "dotnet")
    .replace(/\bon\s*(?:-|\s)\s*site\b/gi, "onsite");
  for (const match of prepared.matchAll(/"([^"]+)"|(\S+)/g)) {
    const value = normalizeTechnicalSearchText(match[1] ?? match[2] ?? "");
    if (value) clauses.push({ phrase: Boolean(match[1]), value });
  }
  return clauses;
}

function searchTermsMatch(query: string, fields: readonly string[]): boolean {
  const normalizedFields = fields.map(normalizeTechnicalSearchText);
  const available = normalizedFields.join(" ").split(" ").filter(Boolean);
  const exactTechnicalTerms = new Set(["cplusplus", "csharp", "dotnet", "sre"]);
  return searchClauses(query).every((clause) => {
    if (clause.phrase) {
      return normalizedFields.some((field) =>
        ` ${field} `.includes(` ${clause.value} `)
      );
    }
    return clause.value.split(" ").filter(Boolean).every((term) =>
      available.some((word) =>
        exactTechnicalTerms.has(term) || term.length <= 2
          ? word === term
          : word.startsWith(term)
      )
    );
  });
}

function locationTermsMatch(query: string, location: string): boolean {
  const original = normalizeForSearch(location);
  const available = normalizeForSearch(locationSearchText(location)).split(" ").filter(Boolean);
  const postalCodes = postalCodesInLocation(location);
  return normalizeForSearch(query).split(" ").filter(Boolean).every((term) => {
    const stateName = US_STATE_NAME_BY_ABBREVIATION.get(term);
    if (stateName) {
      const hasFullStateName = new RegExp(`(?:^| )${stateName}(?: |$)`).test(original);
      return postalCodes.has(term) || hasFullStateName;
    }
    return available.some((word) => term.length <= 2 ? word === term : word.startsWith(term));
  });
}

function matchesMajor(job: CanonicalJob, major: JobMajorFilter): boolean {
  if (major === "all") return true;
  if (job.majorIds) return job.majorIds.includes(major);

  const title = normalizeForSearch(job.title);
  const category = normalizeForSearch(job.category);

  if (major === "computer-science") {
    return (
      category === "data" ||
      category === "security" ||
      /\b(software|cloud|data|security|machine learning|site reliability|devops|quant|quantitative|trading)\b/.test(title)
    );
  }

  if (major === "engineering") {
    return /\b(hardware|firmware|embedded|electrical|electronics|mechanical|civil|structural|aerospace|aeronautical|manufacturing|industrial|materials|robotics|chemical|biomedical|construction|quality engineering|systems engineering)\b/.test(title);
  }

  return (
    ["finance", "marketing", "operations", "product", "sales"].includes(category) ||
    /\b(product management|product manager|product marketing|product strategy|business|finance|financial|marketing|sales|operations|supply chain|logistics|procurement|consulting|consultant|accounting|audit|investment banking|asset management|wealth management|private equity|venture capital|quant|quantitative|trading)\b/.test(title)
  );
}

function matchesNiche(job: CanonicalJob, niche: string): boolean {
  if (niche === "all") return true;
  if (job.nicheIds) return job.nicheIds.includes(niche);

  const title = normalizeForSearch(job.title);
  const category = normalizeForSearch(job.category);

  switch (niche) {
    case "software-engineering":
      return /\bsoftware\b/.test(title);
    case "cloud-infra":
      return /\b(cloud|infrastructure|platform|devops|site reliability)\b/.test(title);
    case "site-reliability":
      return /\b(site reliability|sre)\b/.test(title);
    case "data-ml":
      return category === "data" || /\b(data|machine learning|ml|ai)\b/.test(title);
    case "security":
      return category === "security" || /\bsecurity\b/.test(title);
    case "quant":
      return /\b(quant|quantitative|trading)\b/.test(title);
    case "hardware-firmware":
      return /\b(hardware|firmware|embedded|fpga|asic|silicon|semiconductor)\b/.test(title);
    case "electrical":
      return /\b(electrical|electronics|power systems|controls|embedded systems)\b/.test(title);
    case "mechanical":
      return /\b(mechanical|mechanic|hvac|thermal|fluid systems)\b/.test(title);
    case "civil":
      return /\b(civil|structural|geotechnical|construction|transportation engineering)\b/.test(title);
    case "aerospace":
      return /\b(aerospace|aeronautical|avionics|propulsion|flight systems|spacecraft)\b/.test(title);
    case "manufacturing":
      return /\b(manufacturing|manufacturability|production engineer|quality engineer|process engineer)\b/.test(title);
    case "industrial":
      return /\b(industrial|systems engineering|operations research)\b/.test(title);
    case "materials":
      return /\b(material|materials|metallurgy|polymer|electrochemistry)\b/.test(title);
    case "finance":
      return category === "finance" || /\b(finance|financial|investment banking|asset management|wealth management|private equity|venture capital|quant|trading)\b/.test(title);
    case "consulting":
      return /\b(consulting|consultant|advisory|strategy intern)\b/.test(title);
    case "accounting":
      return /\b(accounting|accountant|audit|auditor|tax)\b/.test(title);
    case "operations":
      return category === "operations" && !/\bsupply chain\b/.test(title);
    case "product":
      return category === "product" || /\bproduct management\b/.test(title);
    case "marketing":
      return category === "marketing" || /\b(marketing|brand|communications)\b/.test(title);
    case "supply-chain":
      return /\b(supply chain|logistics|procurement)\b/.test(title);
    default:
      return false;
  }
}

function matchesFilters(job: CanonicalJob, filters: JobFilters): boolean {
  if (
    filters.company &&
    normalizeEmployer(job.companyName) !== normalizeEmployer(filters.company)
  ) {
    return false;
  }
  if (
    filters.level === "internship" && job.roleLevel !== "Internship" ||
    filters.level === "new-grad" && job.roleLevel !== "New grad"
  ) {
    return false;
  }
  if (!matchesMajor(job, filters.major) || !matchesNiche(job, filters.niche)) {
    return false;
  }
  if (filters.remote && job.workplace !== "Remote") return false;
  if (filters.sponsorship && job.sponsorship !== "Confirmed") return false;
  if (
    filters.source &&
    !job.contributingSourceIds.includes(filters.source as SourceId)
  ) {
    return false;
  }
  if (filters.location) {
    if (!locationTermsMatch(filters.location, job.location)) return false;
  }
  if (filters.q) {
    const aliases = [
      job.roleLevel === "New grad" ? "new grad graduate entry level" : "intern internship",
      /\bsoftware\s+engineer/i.test(job.title) ? "swe" : "",
      /\bmachine\s+learning/i.test(job.title) ? "ml" : "",
      /\bsite\s+reliability/i.test(`${job.title} ${job.team ?? ""}`) ? "sre" : "",
    ];
    const searchableFields = [
      job.title,
      job.companyName,
      job.category,
      job.team ?? "",
      locationSearchText(job.location),
      ...aliases,
    ];
    for (const clause of searchClauses(filters.q)) {
      if (!clause.phrase && clause.value === "remote") {
        if (job.workplace !== "Remote") return false;
        continue;
      }
      if (!clause.phrase && clause.value === "hybrid") {
        if (job.workplace !== "Hybrid") return false;
        continue;
      }
      if (!clause.phrase && (clause.value === "onsite" || clause.value === "on site")) {
        if (job.workplace !== "On-site") return false;
        continue;
      }
      const serializedClause = clause.phrase ? `"${clause.value}"` : clause.value;
      if (!searchTermsMatch(serializedClause, searchableFields)) return false;
    }
  }
  return true;
}

function toListItem(job: CanonicalJob, now: string | Date): JobListItem {
  const freshness = getFreshness(job, now);
  const reportedAfterDiscovery = Boolean(
    job.dateProvenance === "source-reported" &&
    job.employerPostedAt &&
    Date.parse(job.employerPostedAt) - Date.parse(job.firstSeenAt) > DAY_MS,
  );
  return {
    id: job.id,
    company: job.companyName,
    title: job.title,
    location: job.location,
    freshnessLabel: freshness.label,
    freshnessKind: freshness.kind,
    roleLevel: job.roleLevel,
    workplace: job.workplace,
    compensation: job.compensation,
    sponsorship: job.sponsorship,
    logoText: job.logoText,
    logoTone: job.logoTone,
    companyDomain: job.companyDomain,
    applyUrl: job.applicationUrl,
    evidenceUrl: job.evidenceUrl,
    evidenceCheckedAt: job.evidenceCheckedAt,
    deadline: job.deadline,
    degrees: job.degrees,
    requirements: job.requirements,
    legacyIds: job.legacyIds,
    sourceNames: [...(job.sourceLabels ?? job.contributingSourceIds.map((sourceId) => sourceFor(sourceId).name))],
    team: job.team,
    summary: job.summary,
    titleIncomplete: job.titleQuality === "truncated" || isTruncatedJobTitle(job.title),
    eligibilityNeedsReview: job.eligibilityStatus === "review",
    dateProvenance: job.dateProvenance,
    possibleRepost: reportedAfterDiscovery,
    postedAt: job.employerPostedAt,
    postedAtPrecision: job.employerPostedAt ? freshness.precision : undefined,
    firstSeenAt: job.firstSeenAt,
    lastSeenAt: job.lastSeenAt,
    lastCheckedAt: job.lastCheckedAt,
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

export type QueryOptions = {
  cursor?: string | null;
  limit?: number;
  asOf?: string | Date;
  now?: string | Date;
  snapshot?: DemoSnapshot;
};

/**
 * Server-style, snapshot-stable keyset pagination. Filtering happens before
 * ordering and slicing; the complete job collection is never returned.
 */
export function queryJobs(
  filtersInput: FilterInput = undefined,
  options: QueryOptions = {},
): JobPage {
  const filters = parseFilters(filtersInput);
  const filtersKey = serializeFilters(filters);
  const limit = normalizeLimit(options.limit);
  const requestedNow = canonicalTimestamp(options.now ?? new Date(), "now");
  const decodedCursor = options.cursor ? decodeJobCursor(options.cursor) : null;
  if (decodedCursor && decodedCursor.filtersKey !== filtersKey) {
    throw new InvalidCursorError("The cursor does not belong to these filters");
  }
  if (
    decodedCursor &&
    options.asOf &&
    canonicalTimestamp(options.asOf, "asOf") !== decodedCursor.asOf
  ) {
    throw new InvalidCursorError("The cursor does not belong to this snapshot");
  }

  const asOf = decodedCursor?.asOf ?? canonicalTimestamp(
    options.asOf ?? options.snapshot?.asOf ?? getDemoSnapshotAt(requestedNow),
    "asOf",
  );
  const evaluatedAt = decodedCursor?.evaluatedAt ?? requestedNow;
  const snapshot = options.snapshot ?? resolveSnapshot(asOf, evaluatedAt);
  if (decodedCursor && snapshot.asOf !== decodedCursor.asOf) {
    throw new InvalidCursorError("The cursor does not belong to this snapshot");
  }
  const snapshotRevision = getSnapshotRevision(snapshot);
  if (decodedCursor && snapshotRevision !== decodedCursor.snapshotRevision) {
    throw new InvalidCursorError("The jobs changed since this page was loaded");
  }
  const filteredJobs = sortJobsForFeed(
    snapshot.jobs.filter(
      (job) =>
        job.active &&
        job.firstSeenAt <= asOf &&
        isPubliclyEligible(job) &&
        matchesFilters(job, filters),
    ),
    evaluatedAt,
  );
  const afterCursor = decodedCursor
    ? filteredJobs.filter(
        (job) => compareFeedSortTuples(
          getFeedSortTuple(job, evaluatedAt),
          decodedCursor.tuple,
        ) > 0,
      )
    : filteredJobs;
  const window = afterCursor.slice(0, limit + 1);
  const pageJobs = window.slice(0, limit);
  const hasMore = window.length > limit;
  const lastJob = pageJobs.at(-1);
  const nextCursor = hasMore && lastJob
      ? encodeJobCursor({
        version: 5,
        asOf,
        evaluatedAt,
        snapshotRevision,
        tuple: getFeedSortTuple(lastJob, evaluatedAt),
        filtersKey,
      })
    : null;

  return {
    items: pageJobs.map((job) => toListItem(job, evaluatedAt)),
    nextCursor,
    total: filteredJobs.length,
    asOf,
    evaluatedAt,
    filters,
  };
}

export type FeedStatsOptions = {
  asOf?: string | Date;
  now?: string | Date;
  snapshot?: DemoSnapshot;
};

export function getSourceHealth(options: FeedStatsOptions = {}): SourceHealth[] {
  const now = canonicalTimestamp(options.now ?? new Date(), "now");
  const snapshot = options.snapshot ?? resolveSnapshot(options.asOf, now);
  return SOURCE_CATALOG.map((source, index) => {
    const lastSuccessfulUpdateAt = snapshot.fallbackCapturedAt ??
      subtractMinutes(snapshot.asOf, index * 3);
    const healthy =
      Date.parse(now) - Date.parse(lastSuccessfulUpdateAt) <=
      (source.expectedCadenceHours + 6) * HOUR_MS;
    return {
      id: source.id,
      name: source.name,
      type: source.type,
      typeLabel: source.typeLabel,
      lastSuccessfulUpdateAt,
      healthy,
      isDemo: true,
    };
  });
}

export function getFeedStats(options: FeedStatsOptions = {}): FeedStats {
  const now = canonicalTimestamp(options.now ?? new Date(), "now");
  const nowDate = asDate(now, "now");
  const snapshot = options.snapshot ?? resolveSnapshot(options.asOf, now);
  const activeJobs = snapshot.jobs.filter((job) => job.active && isPubliclyEligible(job));
  const dayStart = utcDayStart(nowDate);
  const weekBoundary = nowDate.getTime() - 7 * DAY_MS;
  const sourceHealth = getSourceHealth({ asOf: snapshot.asOf, now, snapshot });

  return {
    activeJobs: activeJobs.length,
    addedToday: activeJobs.filter((job) => Date.parse(job.firstSeenAt) >= dayStart).length,
    addedThisWeek: activeJobs.filter(
      (job) => Date.parse(job.firstSeenAt) >= weekBoundary && Date.parse(job.firstSeenAt) <= nowDate.getTime(),
    ).length,
    newThisWeek: activeJobs.filter((job) => isNewThisWeek(job, now)).length,
    currentSources: SOURCE_CATALOG.length,
    healthySources: sourceHealth.filter((source) => source.healthy).length,
    totalSources: SOURCE_CATALOG.length,
    lastCompleteUpdateAt: snapshot.fallbackCapturedAt ?? snapshot.asOf,
    sourceHealth,
    catalogNotice: DEMO_SOURCE_CATALOG_NOTICE,
  };
}

export type GetJobOptions = {
  asOf?: string | Date;
  now?: string | Date;
  snapshot?: DemoSnapshot;
};

export function getJobById(
  id: string,
  options: GetJobOptions = {},
): JobListItem | null {
  const now = canonicalTimestamp(options.now ?? new Date(), "now");
  const snapshot = options.snapshot ?? resolveSnapshot(options.asOf, now);
  const direct = snapshot.jobs.find(
    (candidate) => candidate.id === id && candidate.active && isPubliclyEligible(candidate),
  );
  const legacyMatches = direct
    ? []
    : snapshot.jobs.filter(
        (candidate) =>
          candidate.active &&
          isPubliclyEligible(candidate) &&
          (candidate.legacyId === id || candidate.legacyIds?.includes(id)),
      );
  const job = direct ?? (legacyMatches.length === 1 ? legacyMatches[0] : null);
  return job ? toListItem(job, now) : null;
}

/** Homepage helper: supplied dates only, with their provenance kept explicit. */
export function getNewestPostedJobs(
  options: GetJobOptions & { limit?: number; todayOnly?: boolean } = {},
): JobListItem[] {
  const now = canonicalTimestamp(options.now ?? new Date(), "now");
  const snapshot = options.snapshot ?? resolveSnapshot(options.asOf, now);
  const dayStart = utcDayStart(asDate(now, "now"));
  const limit = normalizeLimit(options.limit ?? 6);
  return sortJobsForFeed(
    snapshot.jobs.filter((job) => {
      if (!job.active || !isPubliclyEligible(job) || !job.employerPostedAt) return false;
      return !options.todayOnly || Date.parse(job.employerPostedAt) >= dayStart;
    }),
    now,
  )
    .slice(0, limit)
    .map((job) => toListItem(job, now));
}

/**
 * Homepage company rail, ranked by Timley's own recent discovery evidence.
 * Employer-supplied dates are deliberately not used for this ranking.
 */
export function getPopularCompanies(
  options: GetJobOptions & { limit?: number; recentDays?: number } = {},
): PopularCompany[] {
  const now = canonicalTimestamp(options.now ?? new Date(), "now");
  const snapshot = options.snapshot ?? resolveSnapshot(options.asOf, now);
  const limit = normalizeLimit(options.limit ?? 30);
  const recentDays = options.recentDays ?? 30;
  if (!Number.isInteger(recentDays) || recentDays < 1 || recentDays > 365) {
    throw new RangeError("recentDays must be an integer between 1 and 365");
  }
  const nowMs = Date.parse(now);
  const cutoff = nowMs - recentDays * DAY_MS;
  const companies = new Map<
    string,
    PopularCompany & { latestDiscoveryAt: number }
  >();

  for (const job of snapshot.jobs) {
    const discoveredAt = Date.parse(job.firstSeenAt);
    if (
      !job.active ||
      !isPubliclyEligible(job) ||
      !Number.isFinite(discoveredAt) ||
      discoveredAt < cutoff ||
      discoveredAt > nowMs
    ) {
      continue;
    }
    const key = normalizeEmployer(job.companyName);
    if (!key) continue;
    const current = companies.get(key);
    if (current) {
      current.recentPostings += 1;
      current.latestDiscoveryAt = Math.max(current.latestDiscoveryAt, discoveredAt);
      if (!current.domain && job.companyDomain) current.domain = job.companyDomain;
      continue;
    }
    companies.set(key, {
      name: job.companyName,
      domain: job.companyDomain,
      recentPostings: 1,
      latestDiscoveryAt: discoveredAt,
    });
  }

  return [...companies.values()]
    .sort((a, b) =>
      b.recentPostings - a.recentPostings ||
      b.latestDiscoveryAt - a.latestDiscoveryAt ||
      a.name.localeCompare(b.name, "en-US"),
    )
    .slice(0, limit)
    .map((company) => ({
      name: company.name,
      domain: company.domain,
      recentPostings: company.recentPostings,
    }));
}

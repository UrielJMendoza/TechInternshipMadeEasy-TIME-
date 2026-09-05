import {
  classifyEarlyCareerEligibility,
  createDemoSnapshot,
  getDemoSnapshotAt,
  getJobById,
  InvalidCursorError,
  isTruncatedJobTitle,
  normalizeAtsHostname,
  normalizeEmployer,
  sanitizeEmployerPostedAt,
  sortJobsNewestFirst,
  type CanonicalJob,
  type DemoSnapshot,
  type SourceId,
} from "./index";
import {
  BUNDLED_FALLBACK_CAPTURED_AT,
  BUNDLED_FALLBACK_ROWS,
} from "./fallback-data";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://ogkocdharscqzdrnlpnq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ejWVjfUaEx5WAdrN72s7FQ_RwO7CDEh";

const PAGE_SIZE = 1_000;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1_000;
const MAX_CURSOR_AGE_MS = 10 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 15_000;
const FALLBACK_BASE_RETRY_MS = 60_000;
const FALLBACK_MAX_RETRY_MS = 30 * 60_000;
const MIN_VERIFIED_FEED_RATIO = 0.65;
const SELECT_FIELDS = [
  "id",
  "title",
  "company",
  "category",
  "role_type",
  "primary_apply_url",
  "display_location",
  "location_type",
  "major_ids",
  "niche_ids",
  "posted_date",
  "first_seen_at",
  "last_seen_at",
  "last_checked_at",
  "updated_at",
  "is_active",
  "salary_raw",
  "sponsorship",
  "company_domain",
  "company_domain_confidence",
  "primary_source",
  "employer_evidence",
  "employer_checked_at",
].join(",");

type LiveJobRow = Record<string, unknown>;

type JobsPage = {
  rows: LiveJobRow[];
  total: number | null;
};

export type PublicJobsFeedHealth = {
  status: "starting" | "healthy" | "degraded";
  mode: "uninitialized" | "live" | "verified-fallback";
  snapshotAt: string | null;
  fallbackCapturedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextRetryAt: string | null;
  consecutiveFailures: number;
  baselineRows: number;
  deltaRows: number;
  mergedRows: number;
  mappedRows: number;
  canonicalJobs: number;
  activeJobs: number;
  invalidRows: number;
  duplicateDeltaIds: number;
  refreshDurationMs: number | null;
};

type SnapshotBuildResult = {
  snapshot: DemoSnapshot;
  mappedRows: number;
  invalidRows: number;
};

let feedHealth: PublicJobsFeedHealth = {
  status: "starting",
  mode: "uninitialized",
  snapshotAt: null,
  fallbackCapturedAt: BUNDLED_FALLBACK_CAPTURED_AT,
  lastAttemptAt: null,
  lastSuccessAt: null,
  nextRetryAt: null,
  consecutiveFailures: 0,
  baselineRows: BUNDLED_FALLBACK_ROWS.length,
  deltaRows: 0,
  mergedRows: BUNDLED_FALLBACK_ROWS.length,
  mappedRows: 0,
  canonicalJobs: 0,
  activeJobs: 0,
  invalidRows: 0,
  duplicateDeltaIds: 0,
  refreshDurationMs: null,
};
let demoGuardLogged = false;

let cachedSnapshot: DemoSnapshot | null = null;
let cacheExpiresAt = 0;
const snapshotHistory = new Map<string, { snapshot: DemoSnapshot; expiresAt: number }>();
const inFlightSnapshots = new Map<string, Promise<DemoSnapshot>>();

function isoNow(): string {
  return new Date().toISOString();
}

function feedLog(
  level: "info" | "warn",
  event: string,
  details: Record<string, string | number | boolean | null> = {},
) {
  if (process.env.NODE_ENV === "test" || process.env.TIMLEY_FEED_LOGS === "false") return;
  const payload = JSON.stringify({ service: "timley-jobs", event, ...details });
  if (level === "warn") console.warn(payload);
  else console.info(payload);
}

function nextRetryDelayMs(failures: number): number {
  const exponent = Math.max(0, Math.min(failures - 1, 8));
  return Math.min(FALLBACK_BASE_RETRY_MS * 2 ** exponent, FALLBACK_MAX_RETRY_MS);
}

export function getPublicJobsFeedHealth(): PublicJobsFeedHealth {
  return { ...feedHealth };
}

function productionDemoJobsRequested(): boolean {
  const requested = process.env.TIMLEY_USE_DEMO_JOBS === "true";
  const production = process.env.VERCEL_ENV === "production";
  if (requested && production && !demoGuardLogged) {
    demoGuardLogged = true;
    feedLog("warn", "production_demo_flag_ignored");
  }
  return requested && !production;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function optionalText(value: unknown): string | null {
  return requiredText(value);
}

function timestamp(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00.000Z`
    : text;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function safeApplicationUrl(value: unknown): string | null {
  const text = optionalText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "example.com" ||
      hostname === "example.org" ||
      hostname === "example.net" ||
      hostname.endsWith(".example.com") ||
      hostname.endsWith(".example.org") ||
      hostname.endsWith(".example.net") ||
      /^(?:10|127|169\.254|192\.168)\./.test(hostname) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname) ||
      (hostname.includes(":") && (hostname === "::1" || /^f[cd]/.test(hostname)))
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function companyDomain(row: LiveJobRow): string | undefined {
  const domain = optionalText(row.company_domain)?.toLowerCase();
  const confidence = Number(row.company_domain_confidence ?? 0);
  if (!domain || confidence < 0.8) return undefined;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    return undefined;
  }
  return domain;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.some((item) => typeof item !== "string")) return undefined;
  const strings = value
    .map((item) => item.normalize("NFKC").trim())
    .filter(Boolean);
  return Object.freeze([...new Set(strings)]);
}

function sourceIdFor(row: LiveJobRow, applicationUrl: string): SourceId {
  const source = optionalText(row.primary_source)?.toLowerCase() ?? "";
  const host = new URL(applicationUrl).hostname.toLowerCase();
  if (host.includes("greenhouse.io")) return "greenhouse";
  if (host === "jobs.lever.co" || host.endsWith(".lever.co")) return "lever";
  if (host.includes("ashbyhq.com")) return "ashby";
  if (host.includes("myworkdayjobs.com")) return "workday";
  if (host.includes("smartrecruiters.com")) return "smartrecruiters";
  if (host.includes("icims.com")) return "icims";
  if (host.includes("jobvite.com")) return "jobvite";
  if (source.includes("github")) return "github-new-grad";
  return "simplify";
}

function rawSourceFor(row: LiveJobRow): string {
  return optionalText(row.primary_source)?.toLowerCase() ?? "";
}

function isOfficialConfiguredSource(source: string): boolean {
  return /^(?:gh|greenhouse|ashby|lever):/.test(source);
}

function sourceLabelFor(row: LiveJobRow, fallbackSourceId: SourceId): string {
  const source = rawSourceFor(row);
  if (/^(?:gh|greenhouse):/.test(source)) return "Greenhouse employer board";
  if (source.startsWith("ashby:")) return "Ashby employer board";
  if (source.startsWith("lever:")) return "Lever employer board";
  switch (source) {
    case "simplify":
      return "SimplifyJobs community list";
    case "speedyapply":
      return "SpeedyApply community list";
    case "zapplyjobs":
      return "ZApplyJobs community list";
    case "zshah101":
      return "zshah101 community list";
    case "vanshb03":
      return "Vansh internships community list";
    case "northwesternfintech":
      return "Northwestern Fintech community list";
    default:
      return fallbackSourceId === "github-new-grad"
        ? "GitHub community list"
        : "Community-discovered listing";
  }
}

function workplace(value: unknown): CanonicalJob["workplace"] {
  if (value === "remote") return "Remote";
  if (value === "hybrid") return "Hybrid";
  if (value === "onsite" || value === "on-site") return "On-site";
  return "Not confirmed";
}

function verifiedEvidence(row: LiveJobRow, asOf: string): Record<string, unknown> {
  const value = row.employer_evidence;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const evidence = value as Record<string, unknown>;
  const checkedAt = timestamp(evidence.checkedAt);
  const sourceUrl = safeApplicationUrl(evidence.sourceUrl);
  if (evidence.status !== "verified" || !checkedAt || !sourceUrl ||
    !/^[a-f0-9]{64}$/.test(String(evidence.contentHash ?? "")) ||
    Date.parse(checkedAt) > Date.parse(asOf) || Date.parse(asOf) - Date.parse(checkedAt) > 14 * 86_400_000) return {};
  const currentUrl = safeApplicationUrl(row.primary_apply_url);
  if (!currentUrl || canonicalApplicationKey(sourceUrl) !== canonicalApplicationKey(currentUrl)) return {};
  return evidence;
}

function categoryLabel(value: string): string {
  return value
    .split("-")
    .map((part) => part === "ml" ? "ML" : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function logoText(company: string): string {
  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || company.slice(0, 2).toUpperCase();
}

function rowToCanonicalJob(row: LiveJobRow, asOf: string): CanonicalJob | null {
  const id = requiredText(row.id);
  const evidence = verifiedEvidence(row, asOf);
  const title = requiredText(evidence.title) ?? requiredText(row.title);
  const companyName = requiredText(row.company);
  const location = requiredText(row.display_location);
  const category = requiredText(row.category);
  const applicationUrl = safeApplicationUrl(row.primary_apply_url);
  const firstSeenAt = timestamp(row.first_seen_at);
  const lastSeenAt = timestamp(row.last_seen_at) ?? firstSeenAt;
  const lastCheckedAt = timestamp(row.last_checked_at);
  const rawPostedAt = optionalText(evidence.postedAt) ?? optionalText(row.posted_date);
  const sanitizedEmployerPostedAt = sanitizeEmployerPostedAt(rawPostedAt, asOf);
  const employerPostedAt = sanitizedEmployerPostedAt &&
    Date.parse(sanitizedEmployerPostedAt) <= Date.parse(asOf)
    ? sanitizedEmployerPostedAt
    : null;
  const roleType = row.role_type;
  if (
    !id ||
    !title ||
    !companyName ||
    !location ||
    !category ||
    !applicationUrl ||
    !firstSeenAt ||
    !lastSeenAt ||
    (roleType !== "internship" && roleType !== "new_grad")
  ) {
    return null;
  }
  if (Date.parse(firstSeenAt) > Date.parse(asOf)) return null;
  if (Date.parse(lastSeenAt) < Date.parse(firstSeenAt)) return null;

  const primarySourceId = sourceIdFor(row, applicationUrl);
  const rawSource = rawSourceFor(row);
  const dateProvenance = employerPostedAt
    ? Boolean(evidence.postedAt) || isOfficialConfiguredSource(rawSource)
      ? "employer-verified" as const
      : "source-reported" as const
    : undefined;
  const normalizedEmployer = normalizeEmployer(companyName);
  if (!normalizedEmployer) return null;

  return {
    id,
    dedupeKey: canonicalApplicationKey(applicationUrl),
    normalizedAtsHostname: normalizeAtsHostname(applicationUrl),
    normalizedEmployer,
    normalizedRequisitionId: null,
    primarySourceId,
    contributingSourceIds: [primarySourceId],
    sourceRecordIds: [id],
    companyName,
    title,
    titleQuality: isTruncatedJobTitle(title) ? "truncated" : "complete",
    eligibilityStatus: evidence.eligibility === "quarantined" || evidence.eligibility === "accepted" || evidence.eligibility === "review" ? evidence.eligibility : classifyEarlyCareerEligibility(
      title,
      roleType === "internship" ? "Internship" : "New grad",
    ),
    location,
    roleLevel: roleType === "internship" ? "Internship" : "New grad",
    workplace: ["Remote", "Hybrid", "On-site"].includes(String(evidence.workplace))
      ? evidence.workplace as CanonicalJob["workplace"] : (workplace(row.location_type) === "On-site" && /\bremote\b/i.test(location)) ? "Not confirmed" : workplace(row.location_type),
    category,
    majorIds: stringArray(row.major_ids),
    nicheIds: stringArray(row.niche_ids),
    team: categoryLabel(category),
    summary: optionalText(evidence.summary) ?? undefined,
    compensation: optionalText(evidence.compensation) ?? optionalText(row.salary_raw) ?? undefined,
    sponsorship: evidence.sponsorship === "Confirmed" || evidence.sponsorship === "Not offered" ? evidence.sponsorship : undefined,
    evidenceUrl: optionalText(evidence.sourceUrl) ?? undefined,
    evidenceCheckedAt: optionalText(evidence.checkedAt) ?? undefined,
    deadline: optionalText(evidence.deadline) ?? undefined,
    degrees: stringArray(evidence.degrees),
    requirements: stringArray(evidence.requirements),
    logoText: logoText(companyName),
    logoTone: "ink",
    companyDomain: companyDomain(row),
    applicationUrl,
    employerPostedAt,
    dateProvenance,
    employerPostedPrecision: employerPostedAt
      ? /^\d{4}-\d{2}-\d{2}$/.test(rawPostedAt ?? "") ? "date" : "timestamp"
      : undefined,
    firstSeenAt,
    lastSeenAt,
    lastCheckedAt: lastCheckedAt ?? undefined,
    sourceLabels: [sourceLabelFor(row, primarySourceId)],
    active: row.is_active !== false,
  };
}

function canonicalApplicationKey(value: string): string {
  const url = new URL(value);
  const removableParameters = new Set([
    "gh_src",
    "lever-origin",
    "lever-source",
    "ref",
    "referrer",
    "referral",
    "source",
    "sourceid",
    "src",
    "trk",
    "trackingid",
  ]);
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("utm_") || removableParameters.has(normalizedKey)) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (url.protocol === "https:" && url.port === "443") url.port = "";
  const atsHostname = normalizeAtsHostname(url.toString());
  if (atsHostname === "greenhouse.io") url.hostname = atsHostname;
  if (atsHostname === "lever.co") url.hostname = atsHostname;
  if (atsHostname === "ashbyhq.com") url.hostname = atsHostname;
  if (atsHostname === "smartrecruiters.com") url.hostname = atsHostname;
  if (atsHostname === "jobvite.com") url.hostname = atsHostname;
  if (atsHostname?.endsWith(".myworkdayjobs.com")) url.hostname = atsHostname;
  if (atsHostname?.endsWith(".icims.com")) url.hostname = atsHostname;
  if (["lever.co", "ashbyhq.com"].includes(atsHostname ?? "")) {
    url.pathname = url.pathname.replace(/\/apply\/?$/i, "");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.searchParams.sort();
  return url.toString();
}

function legacyVisibleIdentity(job: CanonicalJob): string {
  const normalize = (value: string) => value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return [
    normalize(job.companyName),
    normalize(job.title),
    normalize(job.location),
    job.roleLevel,
    job.workplace,
  ].join("\u001f");
}

type ProviderIdentity = {
  key: string;
  provider: "apple" | "ashby" | "bytedance" | "greenhouse" | "icims" | "oracle" | "workable" | "workday";
  /** Workday mirrors may add a numeric suffix on a different careers board. */
  mirrorEvidenceKey?: string;
};

function identityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extracts only provider-native identities with a tenant, board, or employer
 * scope. It deliberately returns null for generic URL segments: visually
 * similar listings are not proof that two requisitions are the same.
 */
export function providerIdentityFromUrl(
  value: string,
  companyName = "",
): ProviderIdentity | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let segments: string[];
  try { segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent); } catch { return null; }
  const employer = identityPart(normalizeEmployer(companyName) ?? companyName);

  if (hostname === "jobs.ashbyhq.com") {
    const board = identityPart(segments[0] ?? "");
    const nativeId = segments.find((segment, index) =>
      index > 0 && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(segment)
    )?.toLowerCase();
    if (board && nativeId) {
      return { provider: "ashby", key: ["provider", "ashby", board, nativeId].join("\u001f") };
    }
  }

  if (/^(?:boards|job-boards|job-boards\.eu)\.greenhouse\.io$/.test(hostname)) {
    const jobsIndex = segments.findIndex((segment) => segment.toLowerCase() === "jobs");
    const board = identityPart(jobsIndex > 0 ? segments[jobsIndex - 1] : segments[0] ?? "");
    const nativeId = jobsIndex >= 0 && /^\d{5,}$/.test(segments[jobsIndex + 1] ?? "")
      ? segments[jobsIndex + 1]
      : url.searchParams.get("gh_jid")?.match(/^\d{5,}$/)?.[0];
    if (board && nativeId) {
      return { provider: "greenhouse", key: ["provider", "greenhouse", board, nativeId].join("\u001f") };
    }
  }

  const workdayTenant = hostname.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/)?.[1];
  if (workdayTenant) {
    const tenant = identityPart(workdayTenant);
    const finalSegment = segments.at(-1) ?? "";
    const match = finalSegment.match(/^(.*)_([a-z]{1,5}\d{2}_\d{5,})(?:-(\d))?$/i)
      ?? finalSegment.match(/^(.*)_((?:[a-z]{1,5}-?\d{4,}(?:[-_]\d{2,})*|\d{6,}|\d{4}[-_]\d{4,}))(?:-(\d))?$/i);
    if (tenant && match) {
      const stem = identityPart(match[1]);
      const baseId = match[2].toLocaleUpperCase("en-US");
      const suffix = match[3];
      const key = [
        "provider",
        "workday",
        tenant,
        suffix ? `${baseId}-${suffix}` : baseId,
      ].join("\u001f");
      return {
        provider: "workday",
        key,
        mirrorEvidenceKey: stem
          ? ["workday-mirror", tenant, baseId, stem].join("\u001f")
          : undefined,
      };
    }
  }

  if (hostname.endsWith(".icims.com")) {
    const jobsIndex = segments.findIndex((segment) => segment.toLowerCase() === "jobs");
    const nativeId = jobsIndex >= 0 && /^\d{3,}$/.test(segments[jobsIndex + 1] ?? "")
      ? segments[jobsIndex + 1]
      : null;
    const tenant = identityPart(
      hostname.match(/^(?:careers?|jobs)-([a-z0-9-]+)\.icims\.com$/)?.[1] ?? employer,
    );
    if (tenant && nativeId) {
      return { provider: "icims", key: ["provider", "icims", tenant, nativeId].join("\u001f") };
    }
  }

  if (["jobs.bytedance.com", "lifeattiktok.com", "joinbytedance.com"].includes(hostname)) {
    const positionIndex = segments.findIndex((segment) => segment.toLowerCase() === "position");
    const nativeId = positionIndex >= 0 && /^\d{8,}$/.test(segments[positionIndex + 1] ?? "")
      ? segments[positionIndex + 1]
      : segments.find((segment) => /^\d{8,}$/.test(segment)) ?? null;
    if (nativeId) {
      return { provider: "bytedance", key: ["provider", "bytedance", nativeId].join("\u001f") };
    }
  }

  if (hostname === "apply.workable.com" || hostname === "jobs.workable.com") {
    const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === "j");
    const viewIndex = segments.findIndex((segment) => segment.toLowerCase() === "view");
    const nativeId = jobIndex >= 0
      ? segments[jobIndex + 1]
      : viewIndex >= 0
        ? segments[viewIndex + 1]
        : null;
    const board = identityPart(jobIndex > 0 ? segments[0] : employer);
    if (board && nativeId && /^[a-z0-9_-]{6,}$/i.test(nativeId)) {
      return { provider: "workable", key: ["provider", "workable", board, nativeId.toLowerCase()].join("\u001f") };
    }
  }

  if (hostname === "jobs.apple.com") {
    const detailsIndex = segments.findIndex((segment) => segment.toLowerCase() === "details");
    const nativeId = detailsIndex >= 0
      ? segments[detailsIndex + 1]?.match(/^(\d{8,})/)?.[1] ?? null
      : null;
    if (nativeId) {
      return { provider: "apple", key: ["provider", "apple", nativeId].join("\u001f") };
    }
  }

  if (hostname.endsWith(".oraclecloud.com")) {
    const jobIndex = segments.findIndex((segment) => segment.toLowerCase() === "job");
    const nativeId = jobIndex >= 0 && /^[a-z0-9_-]{3,}$/i.test(segments[jobIndex + 1] ?? "")
      ? segments[jobIndex + 1]
      : null;
    const sitesIndex = segments.findIndex((segment) => segment.toLowerCase() === "sites");
    const tenant = identityPart(hostname.split(".")[0] ?? "");
    if (tenant && sitesIndex >= 0 && nativeId) {
      return { provider: "oracle", key: ["provider", "oracle", tenant, nativeId.toLowerCase()].join("\u001f") };
    }
  }

  return null;
}

function stableIdentity(job: CanonicalJob): string {
  return providerIdentityFromUrl(job.applicationUrl, job.companyName)?.key
    ?? canonicalApplicationKey(job.applicationUrl);
}

function priorWorkdayIdentity(job: CanonicalJob): string | null {
  const url = new URL(job.applicationUrl);
  const atsHostname = normalizeAtsHostname(url.toString());
  if (!atsHostname?.endsWith(".myworkdayjobs.com")) return null;
  const finalSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const match = finalSegment.match(/_([a-z]{1,4}-?\d{5,})(?:-\d+)?$/i);
  if (!match) return null;
  return [
    job.normalizedEmployer || normalizeEmployer(job.companyName) || "",
    atsHostname,
    match[1].toLocaleUpperCase("en-US"),
  ].join("\u001f");
}

function stableJobId(identity: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < identity.length; index += 1) {
    const code = identity.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
    second ^= second >>> 13;
  }
  return `job_${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function mergeDuplicateJobs(group: CanonicalJob[]): CanonicalJob {
  const ordered = sortJobsNewestFirst(group);
  const primary = ordered[0];
  const evidenceRecord = [...group].filter(job => job.evidenceCheckedAt)
    .sort((a,b) => (b.evidenceCheckedAt ?? "").localeCompare(a.evidenceCheckedAt ?? ""))[0];
  const titleRecord = [...group].sort((left, right) =>
    Number(!left.evidenceCheckedAt) - Number(!right.evidenceCheckedAt) ||
    Number(isTruncatedJobTitle(left.title)) - Number(isTruncatedJobTitle(right.title)) ||
    Number(left.dateProvenance !== "employer-verified") - Number(right.dateProvenance !== "employer-verified") ||
    right.title.length - left.title.length ||
    left.title.localeCompare(right.title)
  )[0];
  const employerDates = group
    .filter((job) => job.employerPostedAt)
    .sort((a, b) => {
      const provenanceOrder =
        Number(a.dateProvenance !== "employer-verified") -
        Number(b.dateProvenance !== "employer-verified");
      if (provenanceOrder !== 0) return provenanceOrder;
      const dateOrder = (a.employerPostedAt ?? "").localeCompare(b.employerPostedAt ?? "");
      if (dateOrder !== 0) return dateOrder;
      return Number(a.employerPostedPrecision !== "date") - Number(b.employerPostedPrecision !== "date");
    });
  const dated = employerDates[0];
  const publicIdentity = group
    .map(stableIdentity)
    .sort()[0];
  return {
    ...primary,
    id: stableJobId(publicIdentity),
    title: titleRecord.title,
    sponsorship: evidenceRecord?.sponsorship,
    evidenceUrl: evidenceRecord?.evidenceUrl,
    evidenceCheckedAt: evidenceRecord?.evidenceCheckedAt,
    deadline: evidenceRecord?.deadline,
    degrees: evidenceRecord?.degrees,
    requirements: evidenceRecord?.requirements,
    summary: evidenceRecord?.summary,
    compensation: evidenceRecord?.compensation ?? group.find(job=>job.compensation)?.compensation,
    titleQuality: isTruncatedJobTitle(titleRecord.title) ? "truncated" : "complete",
    eligibilityStatus: evidenceRecord?.eligibilityStatus ?? classifyEarlyCareerEligibility(titleRecord.title, primary.roleLevel),
    legacyId: stableJobId(legacyVisibleIdentity(primary)),
    legacyIds: [...new Set(group.flatMap((job) => [
      stableJobId(canonicalApplicationKey(job.applicationUrl)),
      priorWorkdayIdentity(job) ? stableJobId(priorWorkdayIdentity(job)!) : null,
      ...(job.legacyIds ?? []),
    ]).filter((id): id is string => Boolean(id)))].sort(),
    contributingSourceIds: [...new Set(group.flatMap((job) => job.contributingSourceIds))].sort(),
    sourceRecordIds: [...new Set(group.flatMap((job) => job.sourceRecordIds))].sort(),
    employerPostedAt: dated?.employerPostedAt ?? null,
    dateProvenance: dated?.dateProvenance,
    employerPostedPrecision: dated?.employerPostedPrecision,
    firstSeenAt: group.map((job) => job.firstSeenAt).sort()[0],
    lastSeenAt: group.map((job) => job.lastSeenAt).sort().at(-1)!,
    lastCheckedAt: group
      .flatMap((job) => job.lastCheckedAt ? [job.lastCheckedAt] : [])
      .sort()
      .at(-1),
    sourceLabels: [...new Set(group.flatMap((job) => job.sourceLabels ?? []))].sort(),
    active: group.some((job) => job.active),
  };
}

function deduplicateMappedJobs(mapped: CanonicalJob[]): CanonicalJob[] {
  const parents = mapped.map((_, index) => index);
  const ownerByIdentity = new Map<string, number>();
  const providerIdentities = mapped.map((job) =>
    providerIdentityFromUrl(job.applicationUrl, job.companyName)
  );
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  mapped.forEach((job, index) => {
    const providerIdentity = providerIdentities[index];
    const identities = [
      `application\u001f${canonicalApplicationKey(job.applicationUrl)}`,
      providerIdentity?.key,
    ].filter((identity): identity is string => Boolean(identity));
    for (const identity of identities) {
      const owner = ownerByIdentity.get(identity);
      if (owner === undefined) ownerByIdentity.set(identity, index);
      else union(owner, index);
    }
  });

  // Workday sometimes exposes one requisition through multiple boards with a
  // terminal -N suffix. Collapse those variants only when their tenant,
  // validated base requisition, and pre-ID job slug all agree.
  const ownerByMirrorEvidence = new Map<string, number>();
  providerIdentities.forEach((identity, index) => {
    if (!identity?.mirrorEvidenceKey) return;
    const owner = ownerByMirrorEvidence.get(identity.mirrorEvidenceKey);
    if (owner === undefined) ownerByMirrorEvidence.set(identity.mirrorEvidenceKey, index);
    else union(owner, index);
  });

  const groups = new Map<number, CanonicalJob[]>();
  mapped.forEach((job, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(job);
    else groups.set(root, [job]);
  });
  return sortJobsNewestFirst([...groups.values()].map(mergeDuplicateJobs));
}

function buildLiveSnapshotFromRows(
  rows: readonly unknown[],
  asOfInput: string | Date = new Date(),
): SnapshotBuildResult {
  const asOfDate = asOfInput instanceof Date ? new Date(asOfInput) : new Date(asOfInput);
  if (!Number.isFinite(asOfDate.getTime())) throw new TypeError("asOf must be a valid date");
  const asOf = asOfDate.toISOString();
  const mapped: CanonicalJob[] = [];
  let invalidRows = 0;
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      invalidRows += 1;
      continue;
    }
    const job = rowToCanonicalJob(row as LiveJobRow, asOf);
    if (job) mapped.push(job);
    else invalidRows += 1;
  }
  const jobs = sortJobsNewestFirst(deduplicateMappedJobs(sortJobsNewestFirst(mapped)));

  return {
    snapshot: Object.freeze({
      asOf,
      rawRecords: Object.freeze([]),
      jobs: Object.freeze(jobs),
    }),
    mappedRows: mapped.length,
    invalidRows,
  };
}

/** Maps and deduplicates the public repository without trusting its JSON shape. */
export function createLiveSnapshotFromRows(
  rows: readonly unknown[],
  asOfInput: string | Date = new Date(),
): DemoSnapshot {
  return buildLiveSnapshotFromRows(rows, asOfInput).snapshot;
}

/** Creates an honestly labelled emergency copy from the last verified public feed export. */
export function createBundledFallbackSnapshot(asOfInput: string | Date): DemoSnapshot {
  const snapshot = createLiveSnapshotFromRows(BUNDLED_FALLBACK_ROWS, asOfInput);
  return Object.freeze({
    ...snapshot,
    fallbackCapturedAt: BUNDLED_FALLBACK_CAPTURED_AT,
  });
}

function parseTotal(contentRange: string | null): number | null {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function fetchJobsDeltaPage(
  offset: number,
  snapshotAt: string,
  includeCount = false,
): Promise<JobsPage> {
  const url = new URL("/rest/v1/jobs", SUPABASE_URL);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.append("updated_at", `gt.${BUNDLED_FALLBACK_CAPTURED_AT}`);
  url.searchParams.append("updated_at", `lte.${snapshotAt}`);
  url.searchParams.set("order", "updated_at.asc,id.asc");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(includeCount ? { Prefer: "count=exact" } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`upstream_http_${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("upstream_invalid_json_shape");
  return {
    rows: payload.filter((row): row is LiveJobRow => typeof row === "object" && row !== null),
    total: includeCount ? parseTotal(response.headers.get("content-range")) : null,
  };
}

async function fetchAllDeltaRows(snapshotAt: string): Promise<LiveJobRow[]> {
  const first = await fetchJobsDeltaPage(0, snapshotAt, true);
  if (first.rows.length < PAGE_SIZE) {
    if (first.total !== null && first.rows.length !== first.total) {
      throw new Error("upstream_incomplete_delta");
    }
    return first.rows;
  }

  if (first.total !== null) {
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) {
      offsets.push(offset);
    }
    const remaining = await Promise.all(
      offsets.map((offset) => fetchJobsDeltaPage(offset, snapshotAt)),
    );
    const rows = [first.rows, ...remaining.map((page) => page.rows)].flat();
    if (rows.length !== first.total) throw new Error("upstream_incomplete_delta");
    return rows;
  }

  const rows = [...first.rows];
  for (let offset = PAGE_SIZE; ; offset += PAGE_SIZE) {
    const page = await fetchJobsDeltaPage(offset, snapshotAt);
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) return rows;
  }
}

function mergedVerifiedRows(deltaRows: readonly LiveJobRow[]): LiveJobRow[] {
  const rowsById = new Map<string, LiveJobRow>();
  for (const candidate of BUNDLED_FALLBACK_ROWS) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const row = candidate as LiveJobRow;
    const id = requiredText(row.id);
    if (id) rowsById.set(id, row);
  }
  for (const row of deltaRows) {
    const id = requiredText(row.id);
    if (id) rowsById.set(id, row);
  }
  return [...rowsById.values()];
}

function duplicateRowIds(rows: readonly LiveJobRow[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const id = requiredText(row.id);
    if (!id) continue;
    if (seen.has(id)) duplicates += 1;
    else seen.add(id);
  }
  return duplicates;
}

function minimumVerifiedRowCount(): number {
  if (BUNDLED_FALLBACK_ROWS.length < 10) return BUNDLED_FALLBACK_ROWS.length;
  return Math.floor(BUNDLED_FALLBACK_ROWS.length * MIN_VERIFIED_FEED_RATIO);
}

async function refreshPublicJobsSnapshot(asOf?: string): Promise<DemoSnapshot> {
  const snapshotAt = asOf ?? new Date(
    Math.floor(Date.now() / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS,
  ).toISOString();
  const startedAt = Date.now();
  feedHealth = { ...feedHealth, lastAttemptAt: isoNow() };
  feedLog("info", "refresh_started", {
    snapshotAt,
    baselineRows: BUNDLED_FALLBACK_ROWS.length,
  });

  const deltaRows = await fetchAllDeltaRows(snapshotAt);
  const duplicateDeltaIds = duplicateRowIds(deltaRows);
  feedHealth = {
    ...feedHealth,
    deltaRows: deltaRows.length,
    duplicateDeltaIds,
  };
  if (duplicateDeltaIds > 0) throw new Error("duplicate_delta_ids");
  const rows = mergedVerifiedRows(deltaRows);
  feedHealth = { ...feedHealth, mergedRows: rows.length };
  if (rows.length < minimumVerifiedRowCount()) throw new Error("catastrophic_feed_shrink");

  const built = buildLiveSnapshotFromRows(rows, snapshotAt);
  const maxInvalidRows = Math.max(3, Math.floor(rows.length * 0.02));
  if (built.invalidRows > maxInvalidRows) throw new Error("excess_invalid_rows");
  const activeJobs = built.snapshot.jobs.filter((job) => job.active).length;
  feedHealth = {
    ...feedHealth,
    mappedRows: built.mappedRows,
    canonicalJobs: built.snapshot.jobs.length,
    activeJobs,
    invalidRows: built.invalidRows,
  };
  const minActiveJobs = BUNDLED_FALLBACK_ROWS.length < 10
    ? Math.min(1, BUNDLED_FALLBACK_ROWS.length)
    : Math.floor(BUNDLED_FALLBACK_ROWS.length * 0.45);
  if (activeJobs < minActiveJobs) throw new Error("catastrophic_active_feed_shrink");

  const finishedAt = isoNow();
  feedHealth = {
    status: "healthy",
    mode: "live",
    snapshotAt,
    fallbackCapturedAt: null,
    lastAttemptAt: feedHealth.lastAttemptAt,
    lastSuccessAt: finishedAt,
    nextRetryAt: null,
    consecutiveFailures: 0,
    baselineRows: BUNDLED_FALLBACK_ROWS.length,
    deltaRows: deltaRows.length,
    mergedRows: rows.length,
    mappedRows: built.mappedRows,
    canonicalJobs: built.snapshot.jobs.length,
    activeJobs,
    invalidRows: built.invalidRows,
    duplicateDeltaIds,
    refreshDurationMs: Date.now() - startedAt,
  };
  feedLog("info", "refresh_succeeded", {
    snapshotAt,
    deltaRows: deltaRows.length,
    mergedRows: rows.length,
    canonicalJobs: built.snapshot.jobs.length,
    activeJobs,
    durationMs: feedHealth.refreshDurationMs,
  });
  return built.snapshot;
}

function currentSnapshotBoundary(): string {
  return new Date(
    Math.floor(Date.now() / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS,
  ).toISOString();
}

function rememberSnapshot(
  snapshot: DemoSnapshot,
  options: { latest: boolean; latestExpiresAt: number },
): DemoSnapshot {
  const rememberedAt = Date.now();
  snapshotHistory.set(snapshot.asOf, {
    snapshot,
    expiresAt: rememberedAt + MAX_CURSOR_AGE_MS + SNAPSHOT_INTERVAL_MS,
  });
  if (options.latest) {
    cachedSnapshot = snapshot;
    cacheExpiresAt = options.latestExpiresAt;
  }
  while (snapshotHistory.size > 8) {
    const oldestKey = snapshotHistory.keys().next().value;
    if (typeof oldestKey !== "string") break;
    snapshotHistory.delete(oldestKey);
  }
  return snapshot;
}

function unavailableSnapshot(
  snapshotAt: string,
  staleSnapshot: DemoSnapshot | null,
): DemoSnapshot {
  if (!staleSnapshot) return createBundledFallbackSnapshot(snapshotAt);
  return Object.freeze({
    ...staleSnapshot,
    asOf: snapshotAt,
    fallbackCapturedAt: staleSnapshot.fallbackCapturedAt ?? staleSnapshot.asOf,
  });
}

function safeFailureCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^[a-z0-9_]{1,80}$/.test(error.message)
  ) {
    return error.message;
  }
  if (error instanceof DOMException && error.name === "TimeoutError") return "upstream_timeout";
  return "refresh_failed";
}

/**
 * Production reads Timley's existing public, RLS-protected job repository.
 * Tests opt into the deterministic fixture explicitly and never hit the network.
 */
export async function getPublicJobsSnapshot(asOf?: string): Promise<DemoSnapshot> {
  if (productionDemoJobsRequested()) {
    return createDemoSnapshot(asOf ?? getDemoSnapshotAt());
  }

  if (asOf) {
    const requestedAt = Date.parse(asOf);
    const currentBoundary = Math.floor(Date.now() / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS;
    const age = currentBoundary - requestedAt;
    if (
      !Number.isFinite(requestedAt) ||
      requestedAt % SNAPSHOT_INTERVAL_MS !== 0 ||
      age < 0 ||
      age > MAX_CURSOR_AGE_MS
    ) {
      throw new InvalidCursorError("The cursor does not belong to a current live snapshot");
    }
  }

  const now = Date.now();
  const historical = asOf ? snapshotHistory.get(asOf) : undefined;
  if (historical && now < historical.expiresAt) return historical.snapshot;
  if (!asOf && cachedSnapshot && now < cacheExpiresAt) return cachedSnapshot;

  const requestKey = asOf ?? "latest";
  const existingRequest = inFlightSnapshots.get(requestKey);
  if (existingRequest) return existingRequest;

  const staleSnapshot = historical?.snapshot ?? (!asOf ? cachedSnapshot : null);
  const snapshotAt = asOf ?? currentSnapshotBoundary();
  const request = refreshPublicJobsSnapshot(snapshotAt)
    .then((snapshot) => {
      const refreshedAt = Date.now();
      return rememberSnapshot(snapshot, {
        latest: !asOf,
        latestExpiresAt: (Math.floor(refreshedAt / SNAPSHOT_INTERVAL_MS) + 1) * SNAPSHOT_INTERVAL_MS,
      });
    })
    .catch((error: unknown) => {
      const fallback = unavailableSnapshot(snapshotAt, staleSnapshot);
      const failures = feedHealth.consecutiveFailures + 1;
      const retryDelayMs = nextRetryDelayMs(failures);
      const failedAt = Date.now();
      feedHealth = {
        ...feedHealth,
        status: "degraded",
        mode: "verified-fallback",
        snapshotAt,
        fallbackCapturedAt: fallback.fallbackCapturedAt ?? BUNDLED_FALLBACK_CAPTURED_AT,
        nextRetryAt: new Date(failedAt + retryDelayMs).toISOString(),
        consecutiveFailures: failures,
        canonicalJobs: fallback.jobs.length,
        activeJobs: fallback.jobs.filter((job) => job.active).length,
        refreshDurationMs: feedHealth.lastAttemptAt
          ? Math.max(0, failedAt - Date.parse(feedHealth.lastAttemptAt))
          : null,
      };
      feedLog("warn", "refresh_failed_using_verified_fallback", {
        snapshotAt,
        failureCode: safeFailureCode(error),
        consecutiveFailures: failures,
        retryDelayMs,
        fallbackJobs: fallback.jobs.length,
      });
      return rememberSnapshot(fallback, {
        latest: !asOf,
        latestExpiresAt: failedAt + retryDelayMs,
      });
    })
    .finally(() => {
      inFlightSnapshots.delete(requestKey);
    });
  inFlightSnapshots.set(requestKey, request);
  return request;
}

export async function getPublicIngestHealth(): Promise<{healthy:boolean;sources:unknown[]}|null> {
  try {
    const response = await fetch(new URL("/rest/v1/rpc/public_ingest_health", SUPABASE_URL), {
      method:"POST",cache:"no-store",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},
      body:"{}",signal:AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return typeof result?.healthy === "boolean" && Array.isArray(result.sources) ? result : null;
  } catch { return null; }
}

/** Durable aliases are consulted only when a saved or external ID leaves the current snapshot. */
export async function getPublicJobsByIds(ids: string[], snapshot: DemoSnapshot) {
  const result = new Map(ids.map(id => [id, getJobById(id, { snapshot })]));
  const missing = ids.filter(id => !result.get(id));
  if (!missing.length || missing.length > 100 || !missing.every(id => /^job_[a-f0-9]{16}$/.test(id))) return result;
  try {
    const response = await fetch(new URL("/rest/v1/rpc/resolve_public_job_ids", SUPABASE_URL), {
      method: "POST", cache: "no-store", headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_ids: missing }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return result;
    const aliases = await response.json() as { requested_id: string; job_ids: string[] }[];
    for (const alias of aliases) {
      if (!result.has(alias.requested_id) || !Array.isArray(alias.job_ids)) continue;
      const candidates = snapshot.jobs.filter(job => job.active && job.sourceRecordIds.some(id => alias.job_ids.includes(id)));
      if (candidates.length === 1) result.set(alias.requested_id, getJobById(candidates[0].id, { snapshot }));
    }
  } catch { /* A failed alias lookup must not hide current direct matches. */ }
  return result;
}

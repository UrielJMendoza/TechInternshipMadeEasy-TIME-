import {
  classifyEarlyCareerEligibility,
  createDemoSnapshot,
  getDemoSnapshotAt,
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
const FALLBACK_RETRY_MS = 60_000;
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
  "is_active",
  "salary_raw",
  "sponsorship",
  "company_domain",
  "company_domain_confidence",
  "primary_source",
].join(",");

type LiveJobRow = Record<string, unknown>;

type JobsPage = {
  rows: LiveJobRow[];
  total: number | null;
};

let cachedSnapshot: DemoSnapshot | null = null;
let cacheExpiresAt = 0;
const snapshotHistory = new Map<string, { snapshot: DemoSnapshot; expiresAt: number }>();
const inFlightSnapshots = new Map<string, Promise<DemoSnapshot>>();

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
  return "On-site";
}

function sponsorship(value: unknown): CanonicalJob["sponsorship"] {
  const normalized = optionalText(value)?.toLowerCase() ?? "";
  if (
    normalized === "offers" ||
    normalized === "offers-sponsorship" ||
    normalized === "confirmed"
  ) {
    return "Confirmed";
  }
  if (
    /not.offered|does.not.sponsor|no.sponsorship|restricted|citizens.only|us.citizenship/.test(normalized)
  ) {
    return "Not offered";
  }
  return undefined;
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
  const title = requiredText(row.title);
  const companyName = requiredText(row.company);
  const location = requiredText(row.display_location);
  const category = requiredText(row.category);
  const applicationUrl = safeApplicationUrl(row.primary_apply_url);
  const firstSeenAt = timestamp(row.first_seen_at);
  const lastSeenAt = timestamp(row.last_seen_at) ?? firstSeenAt;
  const lastCheckedAt = timestamp(row.last_checked_at);
  const rawPostedAt = optionalText(row.posted_date);
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
    ? isOfficialConfiguredSource(rawSource)
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
    eligibilityStatus: classifyEarlyCareerEligibility(
      title,
      roleType === "internship" ? "Internship" : "New grad",
    ),
    location,
    roleLevel: roleType === "internship" ? "Internship" : "New grad",
    workplace: workplace(row.location_type),
    category,
    majorIds: stringArray(row.major_ids),
    nicheIds: stringArray(row.niche_ids),
    team: categoryLabel(category),
    compensation: optionalText(row.salary_raw) ?? undefined,
    sponsorship: sponsorship(row.sponsorship),
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
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
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
    const match = finalSegment.match(/^(.*)_([a-z]{1,4}-?\d{5,})(?:-(\d+))?$/i);
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
  const titleRecord = [...group].sort((left, right) =>
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
    titleQuality: isTruncatedJobTitle(titleRecord.title) ? "truncated" : "complete",
    eligibilityStatus: classifyEarlyCareerEligibility(titleRecord.title, primary.roleLevel),
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

/** Maps and deduplicates the public repository without trusting its JSON shape. */
export function createLiveSnapshotFromRows(
  rows: readonly unknown[],
  asOfInput: string | Date = new Date(),
): DemoSnapshot {
  const asOfDate = asOfInput instanceof Date ? new Date(asOfInput) : new Date(asOfInput);
  if (!Number.isFinite(asOfDate.getTime())) throw new TypeError("asOf must be a valid date");
  const asOf = asOfDate.toISOString();
  const mapped = sortJobsNewestFirst(
    rows.flatMap((row) => {
      if (typeof row !== "object" || row === null) return [];
      const job = rowToCanonicalJob(row as LiveJobRow, asOf);
      return job ? [job] : [];
    }),
  );
  const jobs = sortJobsNewestFirst(deduplicateMappedJobs(mapped));

  return Object.freeze({
    asOf,
    rawRecords: Object.freeze([]),
    jobs: Object.freeze(jobs),
  });
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

async function fetchJobsPage(
  offset: number,
  snapshotAt: string,
  includeCount = false,
): Promise<JobsPage> {
  const url = new URL("/rest/v1/jobs", SUPABASE_URL);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("is_active", "eq.true");
  url.searchParams.set("created_at", `lte.${snapshotAt}`);
  url.searchParams.set("order", "sort_date.desc,first_seen_at.desc,id.desc");
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
    throw new Error(`The public jobs repository returned ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("The public jobs repository returned invalid data");
  return {
    rows: payload.filter((row): row is LiveJobRow => typeof row === "object" && row !== null),
    total: includeCount ? parseTotal(response.headers.get("content-range")) : null,
  };
}

async function fetchAllLiveRows(snapshotAt: string): Promise<LiveJobRow[]> {
  const first = await fetchJobsPage(0, snapshotAt, true);
  if (first.rows.length < PAGE_SIZE) return first.rows;

  if (first.total !== null) {
    const offsets: number[] = [];
    for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) {
      offsets.push(offset);
    }
    const remaining = await Promise.all(
      offsets.map((offset) => fetchJobsPage(offset, snapshotAt)),
    );
    return [first.rows, ...remaining.map((page) => page.rows)].flat();
  }

  const rows = [...first.rows];
  for (let offset = PAGE_SIZE; ; offset += PAGE_SIZE) {
    const page = await fetchJobsPage(offset, snapshotAt);
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE) return rows;
  }
}

async function refreshPublicJobsSnapshot(asOf?: string): Promise<DemoSnapshot> {
  const snapshotAt = asOf ?? new Date(
    Math.floor(Date.now() / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS,
  ).toISOString();
  const rows = await fetchAllLiveRows(snapshotAt);
  const snapshot = createLiveSnapshotFromRows(rows, snapshotAt);
  if (snapshot.jobs.length === 0) {
    throw new Error("The public jobs repository did not return any usable listings");
  }
  return snapshot;
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

/**
 * Production reads Timley's existing public, RLS-protected job repository.
 * Tests opt into the deterministic fixture explicitly and never hit the network.
 */
export async function getPublicJobsSnapshot(asOf?: string): Promise<DemoSnapshot> {
  if (process.env.TIMLEY_USE_DEMO_JOBS === "true") {
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
    .catch(() => {
      const fallback = unavailableSnapshot(snapshotAt, staleSnapshot);
      return rememberSnapshot(fallback, {
        latest: !asOf,
        latestExpiresAt: Date.now() + FALLBACK_RETRY_MS,
      });
    })
    .finally(() => {
      inFlightSnapshots.delete(requestKey);
    });
  inFlightSnapshots.set(requestKey, request);
  return request;
}

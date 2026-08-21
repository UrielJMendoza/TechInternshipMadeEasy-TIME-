import {
  createDemoSnapshot,
  getDemoSnapshotAt,
  InvalidCursorError,
  normalizeAtsHostname,
  normalizeEmployer,
  sortJobsNewestFirst,
  type CanonicalJob,
  type DemoSnapshot,
  type SourceId,
} from "./index";

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

function rowToCanonicalJob(row: LiveJobRow): CanonicalJob | null {
  const id = requiredText(row.id);
  const title = requiredText(row.title);
  const companyName = requiredText(row.company);
  const location = requiredText(row.display_location);
  const category = requiredText(row.category);
  const applicationUrl = safeApplicationUrl(row.primary_apply_url);
  const firstSeenAt = timestamp(row.first_seen_at);
  const lastSeenAt = timestamp(row.last_seen_at) ?? firstSeenAt;
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

  const primarySourceId = sourceIdFor(row, applicationUrl);
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
    employerPostedAt: timestamp(row.posted_date),
    firstSeenAt,
    lastSeenAt,
    active: row.is_active !== false,
  };
}

function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalApplicationKey(value: string): string {
  const url = new URL(value);
  const removableParameters = [
    "gh_src",
    "ref",
    "referrer",
    "source",
    "trk",
  ];
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || removableParameters.includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

function visibleIdentity(job: CanonicalJob): string {
  return [
    normalizeIdentity(job.companyName),
    normalizeIdentity(job.title),
    normalizeIdentity(job.location),
    job.roleLevel,
    job.workplace,
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
      const job = rowToCanonicalJob(row as LiveJobRow);
      return job ? [job] : [];
    }),
  );

  const applicationKeys = new Set<string>();
  const visibleKeys = new Set<string>();
  const deduplicatedJobs = mapped.flatMap((job) => {
    const applicationKey = canonicalApplicationKey(job.applicationUrl);
    const visibleKey = visibleIdentity(job);
    if (applicationKeys.has(applicationKey) || visibleKeys.has(visibleKey)) return [];
    applicationKeys.add(applicationKey);
    visibleKeys.add(visibleKey);
    return [{
      ...job,
      id: stableJobId(visibleKey),
      sourceRecordIds: [job.id],
    }];
  });
  const jobs = sortJobsNewestFirst(deduplicatedJobs);

  return Object.freeze({
    asOf,
    rawRecords: Object.freeze([]),
    jobs: Object.freeze(jobs),
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
  const request = refreshPublicJobsSnapshot(asOf)
    .then((snapshot) => {
      const refreshedAt = Date.now();
      const historyExpiresAt = refreshedAt + MAX_CURSOR_AGE_MS + SNAPSHOT_INTERVAL_MS;
      snapshotHistory.set(snapshot.asOf, { snapshot, expiresAt: historyExpiresAt });
      if (!asOf) {
        cachedSnapshot = snapshot;
        cacheExpiresAt = (Math.floor(refreshedAt / SNAPSHOT_INTERVAL_MS) + 1) * SNAPSHOT_INTERVAL_MS;
      }
      while (snapshotHistory.size > 8) {
        const oldestKey = snapshotHistory.keys().next().value;
        if (typeof oldestKey !== "string") break;
        snapshotHistory.delete(oldestKey);
      }
      return snapshot;
    })
    .catch((error: unknown) => {
      if (staleSnapshot && (!asOf || staleSnapshot.asOf === asOf)) {
        const retryAt = Date.now() + 60_000;
        const priorExpiry = snapshotHistory.get(staleSnapshot.asOf)?.expiresAt ?? 0;
        snapshotHistory.set(staleSnapshot.asOf, {
          snapshot: staleSnapshot,
          expiresAt: Math.max(priorExpiry, retryAt),
        });
        if (!asOf) cacheExpiresAt = retryAt;
        return staleSnapshot;
      }
      throw error;
    })
    .finally(() => {
      inFlightSnapshots.delete(requestKey);
    });
  inFlightSnapshots.set(requestKey, request);
  return request;
}

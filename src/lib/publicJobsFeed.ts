import type { JobsSnapshot } from "@/lib/jobs";
import { safeExternalHttpUrl } from "@/lib/safeUrl";
import type { Category, Internship, RoleType } from "@/lib/types";

export const PUBLIC_JOBS_FEED_VERSION = 1;
export const PUBLIC_JOBS_FEED_PATH = "/api/public-jobs";

export const MAX_PUBLIC_JOBS = 10_000;
const CATEGORIES = new Set<Category>([
  "software",
  "cloud",
  "data-ml",
  "quant",
  "security",
  "hardware",
  "mechanical",
  "electrical",
  "civil",
  "aerospace",
  "manufacturing",
  "industrial",
  "materials",
  "finance",
  "consulting",
  "accounting",
  "operations",
  "product",
  "marketing",
  "supply-chain",
  "other",
]);
const ROLE_TYPES = new Set<RoleType>(["internship", "new_grad"]);

/**
 * Public fields used by the browser-only tracker reconciliation and saved-search
 * alert engine. Trust evidence, ingestion identifiers, normalization fields,
 * and other board/detail-only columns intentionally stay off the wire.
 */
export interface PublicJobFeedItem {
  id: string;
  title: string;
  company: string;
  location: string;
  category: Category;
  role_type: RoleType;
  salary: string | null;
  link: string;
  sponsorship: string | null;
  posted_date: string | null;
  first_seen_at: string;
  canonical_url?: string;
  canonical_record_key?: string;
}

export interface PublicJobsFeedWire {
  version: typeof PUBLIC_JOBS_FEED_VERSION;
  generatedAt: string;
  updatedAt: string | null;
  jobs: PublicJobFeedItem[];
}

/** Existing client logic consumes Internship; unused required fields are local defaults. */
export interface PublicJobsFeedSnapshot {
  generatedAt: string;
  updatedAt: string | null;
  jobs: Internship[];
}

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createPublicJobsFeed(
  snapshot: Pick<JobsSnapshot, "generatedAt" | "updatedAt" | "jobs">,
): PublicJobsFeedWire {
  if (
    snapshot.jobs.length === 0 ||
    snapshot.jobs.length > MAX_PUBLIC_JOBS ||
    snapshot.jobs.some((job) => job.is_active !== true)
  ) {
    throw new Error(
      "Public jobs feed requires a non-empty bounded active snapshot",
    );
  }

  const wire: PublicJobsFeedWire = {
    version: PUBLIC_JOBS_FEED_VERSION,
    generatedAt: snapshot.generatedAt,
    updatedAt: snapshot.updatedAt,
    jobs: snapshot.jobs.map((job) => {
      const link = safeExternalHttpUrl(job.link);
      const canonicalUrl = job.canonical_url
        ? safeExternalHttpUrl(job.canonical_url)
        : null;
      if (!link || (job.canonical_url && !canonicalUrl)) {
        throw new Error("Public jobs feed contains an unsafe external URL");
      }

      return {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        category: job.category,
        role_type: job.role_type,
        salary: job.salary,
        link,
        sponsorship: job.sponsorship,
        posted_date: job.posted_date,
        first_seen_at: job.first_seen_at,
        ...(canonicalUrl ? { canonical_url: canonicalUrl } : {}),
        ...(optionalText(job.canonical_record_key)
          ? { canonical_record_key: optionalText(job.canonical_record_key) }
          : {}),
      };
    }),
  };
  // Assert the exact browser schema before a static response can be cached.
  parsePublicJobsFeed(wire);
  return wire;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || isRequiredText(value);
}

function isTimestamp(value: unknown): value is string {
  return isRequiredText(value) && Number.isFinite(Date.parse(value));
}

function parseFeedItem(value: unknown): PublicJobFeedItem | null {
  if (!isRecord(value)) return null;
  const link = safeExternalHttpUrl(value.link);
  const canonicalUrl =
    value.canonical_url === undefined
      ? undefined
      : safeExternalHttpUrl(value.canonical_url);
  if (
    !isRequiredText(value.id) ||
    !isRequiredText(value.title) ||
    !isRequiredText(value.company) ||
    typeof value.location !== "string" ||
    typeof value.category !== "string" ||
    !CATEGORIES.has(value.category as Category) ||
    typeof value.role_type !== "string" ||
    !ROLE_TYPES.has(value.role_type as RoleType) ||
    !isNullableText(value.salary) ||
    !link ||
    !isNullableText(value.sponsorship) ||
    !isNullableText(value.posted_date) ||
    !isTimestamp(value.first_seen_at) ||
    (value.canonical_url !== undefined && !canonicalUrl) ||
    !isOptionalText(value.canonical_record_key)
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    company: value.company,
    location: value.location,
    category: value.category as Category,
    role_type: value.role_type as RoleType,
    salary: value.salary,
    link,
    sponsorship: value.sponsorship,
    posted_date: value.posted_date,
    first_seen_at: value.first_seen_at,
    ...(canonicalUrl ? { canonical_url: canonicalUrl } : {}),
    ...(value.canonical_record_key
      ? { canonical_record_key: value.canonical_record_key }
      : {}),
  };
}

/** Validate the same-origin response before it reaches local alert/tracker state. */
export function parsePublicJobsFeed(value: unknown): PublicJobsFeedSnapshot {
  if (
    !isRecord(value) ||
    value.version !== PUBLIC_JOBS_FEED_VERSION ||
    !isTimestamp(value.generatedAt) ||
    !(value.updatedAt === null || isTimestamp(value.updatedAt)) ||
    !Array.isArray(value.jobs) ||
    value.jobs.length === 0 ||
    value.jobs.length > MAX_PUBLIC_JOBS
  ) {
    throw new Error("Invalid public jobs feed");
  }

  const items = value.jobs.map(parseFeedItem);
  if (items.some((item) => item === null)) {
    throw new Error("Invalid public jobs feed item");
  }

  const observation = value.updatedAt ?? value.generatedAt;
  return {
    generatedAt: value.generatedAt,
    updatedAt: value.updatedAt,
    jobs: (items as PublicJobFeedItem[]).map((item) => ({
      ...item,
      season: null,
      source: "public-feed",
      last_seen_at: observation,
      is_active: true,
    })),
  };
}

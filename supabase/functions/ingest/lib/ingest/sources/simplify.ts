import type { NormalizedJob } from "../../types.ts";
import {
  combineSnapshots,
  createSnapshot,
  jobsFromHealthySnapshot,
  type SnapshotIssue,
  type SourceSnapshot,
} from "../contracts.ts";
import { fetchRegisteredFeed } from "../fetch.ts";
import {
  categorize,
  cleanLink,
  cleanText,
  dedupeKey,
  postedDateFromUnixSeconds,
  requisitionIdFrom,
} from "../normalize.ts";
import {
  parseJson,
  parseJsonRows,
  SimplifyJobSchema,
  type SimplifyJobInput,
} from "../schemas.ts";
import { SOURCE_REGISTRY, type SourceFeedDefinition } from "../sourceRegistry.ts";
import { termKeysFromValues } from "../../jobTerms.ts";

const SOURCE = SOURCE_REGISTRY.simplify;

const SEASON_START_MONTH: Record<string, number> = {
  Spring: 1,
  Summer: 4,
  Fall: 7,
  Winter: 10,
};
const TERM_GRACE_MS = 60 * 86_400_000;
// The public site only shows listings from the last 90 days (RETENTION_DAYS in
// lib/jobs/live.ts). Older postings are skipped here too, which also keeps the
// largest source inside the Edge CPU budget. Rows without a date are kept.
const LISTING_RETENTION_MS = 90 * 86_400_000;

function withinRetention(datePosted: number, now: number): boolean {
  return datePosted <= 0 || datePosted * 1000 >= now - LISTING_RETENTION_MS;
}

function termStart(term: string): number | null {
  const match = term.match(/^(Spring|Summer|Fall|Winter)\s+(20\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[2]), SEASON_START_MONTH[match[1]], 1);
}

function isCurrentCycle(terms: string[] | undefined, now: number): boolean {
  if (!terms || terms.length === 0) return true;
  let sawParseable = false;
  for (const term of terms) {
    const start = termStart(term);
    if (start === null) continue;
    sawParseable = true;
    if (start >= now - TERM_GRACE_MS) return true;
  }
  return !sawParseable;
}

function upcomingTerms(terms: string[] | undefined, now: number): string[] {
  if (!terms) return [];
  return terms
    .map((term) => [term, termStart(term)] as const)
    .filter(
      (entry): entry is [string, number] =>
        entry[1] !== null && entry[1] >= now - TERM_GRACE_MS,
    )
    .sort((left, right) => left[1] - right[1])
    .map(([term]) => term);
}

function mapSponsorship(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/citizen/i.test(raw)) return "us-citizenship";
  if (/does not|^no\b/i.test(raw)) return "no-sponsorship";
  if (/offers/i.test(raw)) return "offers-sponsorship";
  return null;
}

/**
 * The Simplify lists keep every listing they ever published: about 37,000
 * rows, of which only ~4,300 are open. Validating every row with the schema
 * exceeded the Edge runtime's CPU budget (WORKER_RESOURCE_LIMIT), so closed
 * and hidden rows are dropped with two property checks first. They could
 * never become jobs, so skipping their validation changes no output.
 */
function isOpenListing(row: unknown): boolean {
  if (typeof row !== "object" || row === null) return false;
  const candidate = row as { active?: unknown; is_visible?: unknown };
  return candidate.active === true && candidate.is_visible === true;
}

function explicitId(job: SimplifyJobInput): string | null {
  return job.id === undefined ? null : String(job.id).slice(0, 128);
}

export function parseSimplifyFeed(
  text: string,
  feed: SourceFeedDefinition,
  now = Date.now(),
): SourceSnapshot {
  const decoded = parseJson(text);
  if (!decoded.success) {
    return createSnapshot(SOURCE.id, SOURCE.parser_version, [], {}, [decoded.issue]);
  }
  const rawCount = Array.isArray(decoded.data) ? decoded.data.length : 0;
  const rows = parseJsonRows(
    Array.isArray(decoded.data) ? decoded.data.filter(isOpenListing) : decoded.data,
    SimplifyJobSchema,
  );
  const issues: SnapshotIssue[] = [...rows.issues];
  const candidates = rows.parsed.filter(
    (job) =>
      job.active &&
      job.is_visible &&
      withinRetention(job.date_posted, now) &&
      (feed.role_type === "new_grad" || isCurrentCycle(job.terms, now)),
  );
  const jobs: NormalizedJob[] = [];

  candidates.forEach((job, index) => {
    const link = cleanLink(job.url);
    if (!link) {
      issues.push({
        code: "invalid_url",
        message: "Application URL must be bounded HTTPS with a valid host",
        row: index + 1,
        path: "url",
      });
      return;
    }
    const postedDate = postedDateFromUnixSeconds(job.date_posted, now);
    if (job.date_posted && !postedDate) {
      issues.push({
        code: "invalid_date",
        message: "Posted date is invalid or implausibly far in the future",
        row: index + 1,
        path: "date_posted",
      });
      return;
    }

    const title = cleanText(job.title);
    const company = cleanText(job.company_name);
    const location = job.locations.map(cleanText).filter(Boolean).join("; ");
    const requisitionId = requisitionIdFrom(
      title,
      job.requisition_id ?? explicitId(job),
      link,
    );
    const currentTerms = feed.role_type === "internship"
      ? upcomingTerms(job.terms, now)
      : [];
    jobs.push({
      title,
      company,
      location,
      raw_title: job.title,
      raw_location: job.locations.join("; "),
      category: categorize(title, job.category),
      role_type: feed.role_type,
      season: currentTerms[0] ?? null,
      term_keys: termKeysFromValues(currentTerms),
      salary: null,
      link,
      source: SOURCE.id,
      source_url: SOURCE.homepage,
      source_us_only: feed.proven_us_only,
      external_id: explicitId(job),
      requisition_id: requisitionId,
      sponsorship: mapSponsorship(job.sponsorship),
      posted_date: postedDate,
      dedupe_key: dedupeKey(company, title, location),
    });
  });

  return createSnapshot(
    SOURCE.id,
    SOURCE.parser_version,
    jobs,
    {
      raw_count: rawCount,
      parsed_count: candidates.length,
      accepted_count: jobs.length,
    },
    issues,
  );
}

export async function fetchSimplifySnapshot(): Promise<SourceSnapshot> {
  const now = Date.now();
  // One feed at a time: each is up to 24 MB of JSON, and parsing both at
  // once doubled peak memory in the Edge runtime.
  const snapshots: SourceSnapshot[] = [];
  for (const feed of SOURCE.feeds) {
    const response = await fetchRegisteredFeed(feed);
    snapshots.push(parseSimplifyFeed(response.text, feed, now));
  }
  return combineSnapshots(SOURCE.id, SOURCE.parser_version, snapshots);
}

/** Compatibility adapter for the current runner. */
export async function fetchSimplify(): Promise<NormalizedJob[]> {
  return jobsFromHealthySnapshot(await fetchSimplifySnapshot());
}

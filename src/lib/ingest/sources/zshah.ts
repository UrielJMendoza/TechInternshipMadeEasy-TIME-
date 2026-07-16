import type { NormalizedJob } from "../../types.ts";
import {
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
  normalizePostedDate,
  requisitionIdFrom,
} from "../normalize.ts";
import {
  parseJson,
  parseJsonRows,
  ZshahEnvelopeSchema,
  ZshahJobSchema,
} from "../schemas.ts";
import { SOURCE_REGISTRY } from "../sourceRegistry.ts";

const SOURCE = SOURCE_REGISTRY.zshah101;
const FEED = SOURCE.feeds[0];

export function parseZshahFeed(
  text: string,
  now = Date.now(),
): SourceSnapshot {
  const decoded = parseJson(text);
  if (!decoded.success) {
    return createSnapshot(SOURCE.id, SOURCE.parser_version, [], {}, [decoded.issue]);
  }
  const envelope = ZshahEnvelopeSchema.safeParse(decoded.data);
  if (!envelope.success) {
    return createSnapshot(
      SOURCE.id,
      SOURCE.parser_version,
      [],
      {},
      envelope.error.issues.map((issue) => ({
        code: "invalid_schema" as const,
        message: issue.message,
        path: issue.path.map(String).join("."),
      })),
    );
  }

  const rows = parseJsonRows(envelope.data.jobs, ZshahJobSchema);
  const issues: SnapshotIssue[] = [...rows.issues];
  const jobs: NormalizedJob[] = [];
  rows.parsed.forEach((job, index) => {
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
    const postedDate = normalizePostedDate(job.posted_at, now);
    if (job.posted_at && !postedDate) {
      issues.push({
        code: "invalid_date",
        message: "Posted date is invalid or implausibly far in the future",
        row: index + 1,
        path: "posted_at",
      });
      return;
    }

    const title = cleanText(job.title);
    const company = cleanText(job.company);
    const location = cleanText(job.location ?? "");
    const explicitId = job.id === undefined ? null : String(job.id).slice(0, 128);
    jobs.push({
      title,
      company,
      location,
      raw_title: job.title,
      raw_location: job.location ?? "",
      category: categorize(title, job.category),
      role_type: "internship",
      season: job.season ?? null,
      salary: job.salary ?? null,
      link,
      source: SOURCE.id,
      source_url: SOURCE.homepage,
      source_us_only: FEED.proven_us_only,
      external_id: explicitId,
      requisition_id: requisitionIdFrom(
        title,
        job.requisition_id ?? explicitId,
        link,
      ),
      sponsorship:
        job.sponsorship && job.sponsorship !== "unknown"
          ? job.sponsorship
          : null,
      posted_date: postedDate,
      dedupe_key: dedupeKey(company, title, location),
    });
  });

  if (
    envelope.data.count !== undefined &&
    envelope.data.count !== rows.raw_count
  ) {
    issues.push({
      code: "invalid_schema",
      message: `Envelope count ${envelope.data.count} does not match ${rows.raw_count} rows`,
      path: "count",
    });
  }

  return createSnapshot(
    SOURCE.id,
    SOURCE.parser_version,
    jobs,
    {
      raw_count: rows.raw_count,
      parsed_count: rows.parsed.length,
      accepted_count: jobs.length,
    },
    issues,
  );
}

export async function fetchZshahSnapshot(): Promise<SourceSnapshot> {
  const response = await fetchRegisteredFeed(FEED);
  return parseZshahFeed(response.text);
}

/** Compatibility adapter for the current runner. */
export async function fetchZshah(): Promise<NormalizedJob[]> {
  return jobsFromHealthySnapshot(await fetchZshahSnapshot());
}

import type { Category, NormalizedJob } from "../../types.ts";
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
  externalIdFromUrl,
  requisitionIdFrom,
} from "../normalize.ts";
import { markdownCandidateRows, validateRequiredMarkers } from "../schemas.ts";
import { SOURCE_REGISTRY, type SourceFeedDefinition } from "../sourceRegistry.ts";

const SOURCE = SOURCE_REGISTRY.speedyapply;

function postedFromAge(age: string, now: Date): string | null {
  const match = age.trim().match(/^(\d{1,4})\s*(d|w|mo|y)$/);
  if (!match) return null;
  const days =
    Number(match[1]) *
    { d: 1, w: 7, mo: 30, y: 365 }[match[2] as "d" | "w" | "mo" | "y"];
  return new Date(now.getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function parseSpeedyFeed(
  markdown: string,
  feed: SourceFeedDefinition,
  now = new Date(),
): SourceSnapshot {
  const issues: SnapshotIssue[] = validateRequiredMarkers(
    markdown,
    feed.required_markers,
  );
  const rows = markdownCandidateRows(markdown, 5);
  const rowSet = new Set(rows);
  const jobs: NormalizedJob[] = [];
  let parsedCount = 0;
  let section: Category | null = null;

  for (const line of markdown.split("\n")) {
    const marker = line.match(/<!--\s*TABLE(_[A-Z]+)?_START\s*-->/);
    if (marker) {
      section = marker[1] === "_QUANT" ? "quant" : null;
      continue;
    }
    if (!rowSet.has(line)) continue;

    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const hasSalary = cells.length >= 6;
    const [companyCell, positionCell, locationCell] = cells;
    const salaryCell = hasSalary ? cells[3] : "";
    const postingCell = hasSalary ? cells[4] : cells[3];
    const ageCell = hasSalary ? cells[5] : cells[4];
    const company = cleanText(
      companyCell.match(/<strong>(.*?)<\/strong>/)?.[1] ??
        companyCell.replace(/<[^>]+>/g, ""),
    );
    const title = cleanText(positionCell.replace(/<[^>]+>/g, ""));
    const location = cleanText(locationCell.replace(/<[^>]+>/g, ""));
    if (!company || !title) {
      issues.push({
        code: "invalid_row",
        message: "Expected nonempty company and position cells",
        row: parsedCount + 1,
      });
      continue;
    }
    parsedCount += 1;

    const rawHref = postingCell.match(/href="([^"]+)"/)?.[1] ?? "";
    const link = cleanLink(rawHref);
    if (!link) {
      issues.push({
        code: "invalid_url",
        message: "Posting cell does not contain a valid HTTPS application URL",
        row: parsedCount,
        path: "posting",
      });
      continue;
    }
    const postedDate = postedFromAge(ageCell, now);
    if (cleanText(ageCell) && !postedDate) {
      issues.push({
        code: "invalid_date",
        message: "Age cell does not use a supported d/w/mo/y cadence",
        row: parsedCount,
        path: "age",
      });
      continue;
    }
    const salary = cleanText(salaryCell.replace(/<[^>]+>/g, "")) || null;
    const externalId = externalIdFromUrl(link);
    jobs.push({
      title,
      company,
      location,
      raw_title: title,
      raw_location: location,
      category: categorize(title, null, section),
      role_type: feed.role_type,
      season: null,
      salary,
      link,
      source: SOURCE.id,
      source_url: SOURCE.homepage,
      source_us_only: feed.proven_us_only,
      external_id: externalId,
      requisition_id: requisitionIdFrom(title, externalId, link),
      sponsorship: null,
      posted_date: postedDate,
      dedupe_key: dedupeKey(company, title, location),
    });
  }

  return createSnapshot(
    SOURCE.id,
    SOURCE.parser_version,
    jobs,
    {
      raw_count: rows.length,
      parsed_count: parsedCount,
      accepted_count: jobs.length,
    },
    issues,
  );
}

export async function fetchSpeedySnapshot(): Promise<SourceSnapshot> {
  const now = new Date();
  const snapshots = await Promise.all(
    SOURCE.feeds.map(async (feed) => {
      const response = await fetchRegisteredFeed(feed);
      return parseSpeedyFeed(response.text, feed, now);
    }),
  );
  return combineSnapshots(SOURCE.id, SOURCE.parser_version, snapshots);
}

/** Compatibility adapter for the current runner. */
export async function fetchSpeedy(): Promise<NormalizedJob[]> {
  return jobsFromHealthySnapshot(await fetchSpeedySnapshot());
}

import type { NormalizedJob, RoleType } from "../../types.ts";
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
  externalIdFromUrl,
  requisitionIdFrom,
} from "../normalize.ts";
import { markdownCandidateRows, validateRequiredMarkers } from "../schemas.ts";
import { SOURCE_REGISTRY } from "../sourceRegistry.ts";

const SOURCE = SOURCE_REGISTRY.zapplyjobs;
const FEED = SOURCE.feeds[0];

function postedFromAge(age: string, now: Date): string | null {
  const match = cleanText(age).match(/^(\d{1,6})\s*(m|h|d|w|mo)$/i);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const count = Number(match[1]);
  const milliseconds =
    unit === "m" ? count * 60_000 :
    unit === "h" ? count * 3_600_000 :
    unit === "d" ? count * 86_400_000 :
    unit === "w" ? count * 7 * 86_400_000 :
    count * 30 * 86_400_000;
  return new Date(now.getTime() - milliseconds).toISOString().slice(0, 10);
}

function seasonFrom(title: string): string | null {
  const match = title.match(/\b(Spring|Summer|Fall|Winter)\s+(20\d{2})\b/i);
  return match
    ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`
    : null;
}

function roleTypeFrom(title: string): RoleType {
  return /\b(new grad|graduate|entry[- ]level|university graduate)\b/i.test(title)
    ? "new_grad"
    : "internship";
}

function sponsorshipFrom(cell: string): string | null {
  const text = cleanText(cell);
  if (/no\s+sponsor|does not sponsor/i.test(text)) return "no-sponsorship";
  if (/sponsor|h-1b|visa/i.test(text)) return "offers-sponsorship";
  return null;
}

function sectionFrom(line: string): string | null {
  const summaryMatch = line.match(/<summary>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (summaryMatch) {
    return cleanText(summaryMatch[1].replace(/<[^>]+>/g, ""));
  }
  const headingMatch = line.match(/^###\s+(.+)$/);
  return headingMatch ? cleanText(headingMatch[1]) : null;
}

export function parseZapplyFeed(
  markdown: string,
  now = new Date(),
): SourceSnapshot {
  const issues: SnapshotIssue[] = validateRequiredMarkers(
    markdown,
    FEED.required_markers,
  );
  const rows = markdownCandidateRows(markdown, 6);
  const rowSet = new Set(rows);
  const jobs: NormalizedJob[] = [];
  let parsedCount = 0;
  let section: string | null = null;

  for (const line of markdown.split("\n")) {
    const nextSection = sectionFrom(line);
    if (nextSection) {
      section = nextSection;
      continue;
    }
    if (!rowSet.has(line)) continue;

    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const company = cleanText(cells[0].replace(/<[^>]+>/g, ""));
    const title = cleanText(cells[1].replace(/<[^>]+>/g, ""));
    const location = cleanText(cells[2].replace(/<[^>]+>/g, ""));
    const age = cells[3] ?? "";
    const visa = cells[4] ?? "";
    if (!company || !title) {
      issues.push({
        code: "invalid_row",
        message: "Expected nonempty company and title",
        row: parsedCount + 1,
      });
      continue;
    }
    parsedCount += 1;

    const linkCell = cells.find((cell) => /\]\(https?:\/\//.test(cell));
    const rawHref = linkCell?.match(/\]\((https?:\/\/[^)\s]+)[^)]*\)/)?.[1] ?? "";
    const link = cleanLink(rawHref);
    if (!link) {
      issues.push({
        code: "invalid_url",
        message: "Row does not contain a valid HTTPS application URL",
        row: parsedCount,
        path: "application",
      });
      continue;
    }
    const postedDate = postedFromAge(age, now);
    const postedLabel = cleanText(age);
    if (postedLabel && postedLabel.toLowerCase() !== "recently" && !postedDate) {
      issues.push({
        code: "invalid_date",
        message: "Age cell does not use a supported m/h/d/w/mo cadence",
        row: parsedCount,
        path: "age",
      });
      continue;
    }

    const externalId = externalIdFromUrl(link);
    jobs.push({
      title,
      company,
      location,
      raw_title: title,
      raw_location: location,
      category: categorize(title, section),
      role_type: roleTypeFrom(title),
      season: seasonFrom(title),
      salary: null,
      link,
      source: SOURCE.id,
      source_url: SOURCE.homepage,
      source_us_only: FEED.proven_us_only,
      external_id: externalId,
      requisition_id: requisitionIdFrom(title, externalId, link),
      sponsorship: sponsorshipFrom(visa),
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

export async function fetchZapplySnapshot(): Promise<SourceSnapshot> {
  const response = await fetchRegisteredFeed(FEED);
  return parseZapplyFeed(response.text);
}

/** Compatibility adapter for the current runner. */
export async function fetchZapply(): Promise<NormalizedJob[]> {
  return jobsFromHealthySnapshot(await fetchZapplySnapshot());
}

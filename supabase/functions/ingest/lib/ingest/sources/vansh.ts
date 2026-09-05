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
  externalIdFromUrl,
  normalizePostedDate,
  requisitionIdFrom,
} from "../normalize.ts";
import { markdownCandidateRows, validateRequiredMarkers } from "../schemas.ts";
import { SOURCE_REGISTRY } from "../sourceRegistry.ts";

const SOURCE = SOURCE_REGISTRY.vanshb03;
const FEED = SOURCE.feeds[0];

function parseMonthDay(value: string, now: Date): string | null {
  const match = value.trim().match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (!match) return null;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const month = months.indexOf(match[1]);
  const day = Number(match[2]);
  if (month === -1 || day < 1 || day > 31) return null;
  let year = now.getUTCFullYear();
  if (Date.UTC(year, month, day) > now.getTime()) year -= 1;
  const candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return normalizePostedDate(candidate, now.getTime());
}

function extractLocation(cell: string): string {
  return cleanText(
    cell
      .replace(/<details>.*?<\/summary>/gi, "")
      .replace(/<\/details>/gi, "")
      .replace(/<\/?br\s*\/?>/gi, "; "),
  );
}

export function parseVanshFeed(
  markdown: string,
  now = new Date(),
): SourceSnapshot {
  const issues: SnapshotIssue[] = validateRequiredMarkers(
    markdown,
    FEED.required_markers,
  );
  const rows = markdownCandidateRows(markdown, 5);
  const rowSet = new Set(rows);
  const jobs: NormalizedJob[] = [];
  let parsedCount = 0;
  let lastCompany = "";

  for (const line of markdown.split("\n")) {
    if (!rowSet.has(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (line.includes("🔒")) continue;
    const [companyCell, roleCell, locationCell, linkCell, dateCell] = cells;
    const company = companyCell.includes("↳") ? lastCompany : cleanText(companyCell);
    if (!company) {
      issues.push({
        code: "invalid_row",
        message: "Repeated-company row appeared before a company name",
        row: parsedCount + 1,
      });
      continue;
    }
    lastCompany = company;
    const title = cleanText(roleCell);
    const location = extractLocation(locationCell);
    if (!title) {
      issues.push({
        code: "invalid_row",
        message: "Role title is blank",
        row: parsedCount + 1,
      });
      continue;
    }
    parsedCount += 1;

    const rawHref = linkCell.match(/href="([^"]+)"/)?.[1] ?? "";
    const link = cleanLink(rawHref);
    if (!link) {
      issues.push({
        code: "invalid_url",
        message: "Application cell does not contain a valid HTTPS URL",
        row: parsedCount,
        path: "application",
      });
      continue;
    }
    const postedDate = parseMonthDay(dateCell, now);
    if (cleanText(dateCell) && !postedDate) {
      issues.push({
        code: "invalid_date",
        message: "Date cell is not a valid month/day",
        row: parsedCount,
        path: "date",
      });
      continue;
    }

    const sponsorship = roleCell.includes("🛂")
      ? "no-sponsorship"
      : roleCell.includes("🇺🇸")
        ? "us-citizenship"
        : null;
    const externalId = externalIdFromUrl(link);
    jobs.push({
      title,
      company,
      location,
      raw_title: cleanText(roleCell),
      raw_location: location,
      category: categorize(title),
      role_type: "internship",
      season: "Summer 2027",
      salary: null,
      link,
      source: SOURCE.id,
      source_url: SOURCE.homepage,
      source_us_only: FEED.proven_us_only,
      external_id: externalId,
      requisition_id: requisitionIdFrom(title, externalId, link),
      sponsorship,
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

export async function fetchVanshSnapshot(): Promise<SourceSnapshot> {
  const response = await fetchRegisteredFeed(FEED);
  return parseVanshFeed(response.text);
}

/** Compatibility adapter for the current runner. */
export async function fetchVansh(): Promise<NormalizedJob[]> {
  return jobsFromHealthySnapshot(await fetchVanshSnapshot());
}

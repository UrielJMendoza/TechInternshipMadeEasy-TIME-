import type { Category, NormalizedJob } from "../../types.ts";
import { isUsStateLabel } from "../../usLocations.ts";
import {
  createSnapshot,
  jobsFromHealthySnapshot,
  type SnapshotIssue,
  type SourceSnapshot,
} from "../contracts.ts";
import { fetchRegisteredFeed } from "../fetch.ts";
import { normalizeLocationText } from "../location.ts";
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

const SOURCE = SOURCE_REGISTRY.northwesternfintech;
const FEED = SOURCE.feeds[0];
const SEASON = "Summer 2027";

const ROLE_DETAILS: Record<string, { title: string; category: Category }> = {
  QT: { title: "Quantitative Trading Intern", category: "quant" },
  QR: { title: "Quantitative Research Intern", category: "quant" },
  SWE: { title: "Software Engineering Intern", category: "software" },
  HW: { title: "Hardware Engineering Intern", category: "hardware" },
  ML: { title: "Machine Learning Intern", category: "data-ml" },
};

const LOCATION_REWRITES: Record<string, readonly string[]> = {
  "chicago puerto rico": ["Chicago, IL", "Puerto Rico"],
  "chicago nyc": ["Chicago, IL", "New York, NY"],
  "chicago austin": ["Chicago, IL", "Austin, TX"],
};

function markdownLinks(cell: string): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = [];
  const pattern = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)[^)]*\)/g;
  for (const match of cell.matchAll(pattern)) {
    links.push({ label: cleanText(match[1]), href: match[2] });
  }
  return links;
}

function jobTitle(role: string, qualifier: string): string {
  const detail = ROLE_DETAILS[role.toUpperCase()];
  const base = detail?.title ?? cleanText(role);
  const suffix = cleanText(qualifier.replace(/^✅\s*/u, ""));
  return suffix ? `${base} (${suffix})` : base;
}

function categoryFor(role: string): Category | null {
  return ROLE_DETAILS[role.toUpperCase()]?.category ?? null;
}

export function normalizeNorthwesternLocation(value: string): string {
  const clean = cleanText(value);
  if (!clean) return "";
  const locations: string[] = [];

  for (const block of clean.split(";").map(cleanText).filter(Boolean)) {
    const rewrite = LOCATION_REWRITES[normalizeLocationText(block)];
    if (rewrite) {
      locations.push(...rewrite);
      continue;
    }
    const tokens = block.split(",").map(cleanText).filter(Boolean);
    for (let index = 0; index < tokens.length; index += 1) {
      const city = tokens[index];
      const state = tokens[index + 1];
      if (state && isUsStateLabel(state)) {
        locations.push(`${city}, ${state}`);
        index += 1;
      } else {
        locations.push(city);
      }
    }
  }
  return locations.join("; ");
}

export function parseNorthwesternFeed(markdown: string): SourceSnapshot {
  const issues: SnapshotIssue[] = validateRequiredMarkers(
    markdown,
    FEED.required_markers,
  );
  const rows = markdownCandidateRows(markdown, 2);
  const rowSet = new Set(rows);
  const jobs: NormalizedJob[] = [];
  let rawCount = 0;
  let parsedCount = 0;
  let company = "";
  let location = "";

  for (const line of markdown.split("\n")) {
    const companyMatch = line.match(/^##\s+(.+)$/);
    if (companyMatch) {
      company = cleanText(companyMatch[1]);
      location = "";
      continue;
    }
    const locationMatch = line.match(/^\*\*Locations\*\*:\s*(.*)$/i);
    if (locationMatch) {
      location = normalizeNorthwesternLocation(locationMatch[1]);
      continue;
    }
    if (!rowSet.has(line)) continue;

    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const links = markdownLinks(cells[1] ?? "");
    rawCount += links.length;
    if (!company || !cells[0] || !cells[1]) {
      issues.push({
        code: "invalid_row",
        message: "Role row is missing company context or required cells",
        row: parsedCount + 1,
      });
      continue;
    }
    if (links.length === 0) {
      issues.push({
        code: "invalid_url",
        message: "Role row has no HTTPS application link",
        row: parsedCount + 1,
      });
      continue;
    }
    parsedCount += links.length;

    for (const sourceLink of links) {
      const link = cleanLink(sourceLink.href);
      if (!link) {
        issues.push({
          code: "invalid_url",
          message: "Application URL failed HTTPS validation",
          row: parsedCount,
        });
        continue;
      }
      const title = jobTitle(cells[0], sourceLink.label);
      const externalId = externalIdFromUrl(link);
      jobs.push({
        title,
        company,
        location,
        raw_title: title,
        raw_location: location,
        category: categorize(title, null, categoryFor(cells[0])),
        role_type: "internship",
        season: SEASON,
        salary: null,
        link,
        source: SOURCE.id,
        source_url: SOURCE.homepage,
        source_us_only: FEED.proven_us_only,
        external_id: externalId,
        requisition_id: requisitionIdFrom(title, externalId, link),
        sponsorship: null,
        posted_date: null,
        dedupe_key: dedupeKey(company, title, location),
      });
    }
  }

  return createSnapshot(
    SOURCE.id,
    SOURCE.parser_version,
    jobs,
    {
      raw_count: rawCount,
      parsed_count: parsedCount,
      accepted_count: jobs.length,
    },
    issues,
  );
}

export async function fetchNorthwesternQuantSnapshot(): Promise<SourceSnapshot> {
  const response = await fetchRegisteredFeed(FEED);
  return parseNorthwesternFeed(response.text);
}

/** Compatibility adapter for the current runner. */
export async function fetchNorthwesternQuant(): Promise<NormalizedJob[]> {
  return jobsFromHealthySnapshot(await fetchNorthwesternQuantSnapshot());
}

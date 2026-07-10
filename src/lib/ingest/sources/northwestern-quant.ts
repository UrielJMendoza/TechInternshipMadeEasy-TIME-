import type { Category, NormalizedJob } from "../../types";
import { categorize, cleanLink, cleanText, dedupeKey, fetchText } from "../normalize";

const URL =
  "https://raw.githubusercontent.com/northwesternfintech/2027QuantInternships/main/README.md";
const SEASON = "Summer 2027";

const ROLE_DETAILS: Record<string, { title: string; category: Category }> = {
  QT: { title: "Quantitative Trading Intern", category: "quant" },
  QR: { title: "Quantitative Research Intern", category: "quant" },
  SWE: { title: "Software Engineering Intern", category: "software" },
  HW: { title: "Hardware Engineering Intern", category: "hardware" },
  ML: { title: "Machine Learning Intern", category: "data-ml" },
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
  return suffix ? base + " (" + suffix + ")" : base;
}

function categoryFor(role: string): Category | null {
  return ROLE_DETAILS[role.toUpperCase()]?.category ?? null;
}

/**
 * Northwestern Fintech keeps this public repository current with GitHub
 * Actions. Each company has a location block followed by an open-role table.
 */
export async function fetchNorthwesternQuant(): Promise<NormalizedJob[]> {
  const markdown = await fetchText(URL);
  const jobs: NormalizedJob[] = [];
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
      location = cleanText(locationMatch[1]);
      continue;
    }

    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 2 || /^Role$/i.test(cells[0]) || /^-+$/.test(cells[0])) continue;
    if (!company || !cells[0] || !cells[1]) continue;

    for (const link of markdownLinks(cells[1])) {
      const title = jobTitle(cells[0], link.label);
      const normalizedCompany = cleanText(company);
      const normalizedLocation = cleanText(location);
      jobs.push({
        title,
        company: normalizedCompany,
        location: normalizedLocation,
        category: categorize(title, null, categoryFor(cells[0])),
        role_type: "internship",
        season: SEASON,
        salary: null,
        link: cleanLink(link.href),
        source: "northwesternfintech",
        sponsorship: null,
        posted_date: null,
        dedupe_key: dedupeKey(normalizedCompany, title, normalizedLocation),
      });
    }
  }

  return jobs;
}

import type { Category, NormalizedJob, RoleType } from "../../types";
import { fetchText } from "../fetch";
import { categorize, cleanLink, cleanText, dedupeKey } from "../normalize";

const BASE = "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main";

const FILES: Array<{ path: string; role_type: RoleType }> = [
  { path: "README.md", role_type: "internship" }, // 2027 USA SWE internships
  { path: "NEW_GRAD_USA.md", role_type: "new_grad" }, // 2027 USA new grad
];

/** Age column is "Nd" today; tolerate w/mo/y variants if the format shifts. */
function postedFromAge(age: string, now: Date): string | null {
  const m = age.trim().match(/^(\d+)\s*(d|w|mo|y)$/);
  if (!m) return null;
  const days = Number(m[1]) * { d: 1, w: 7, mo: 30, y: 365 }[m[2] as "d" | "w" | "mo" | "y"];
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function parseTables(md: string, role_type: RoleType, now: Date): NormalizedJob[] {
  const jobs: NormalizedJob[] = [];
  // Tables sit between <!-- TABLE_FAANG_START -->, <!-- TABLE_QUANT_START -->
  // and <!-- TABLE_START --> markers; the quant section informs the category.
  let section: Category | null = null;
  for (const line of md.split("\n")) {
    const marker = line.match(/<!--\s*TABLE(_[A-Z]+)?_START\s*-->/);
    if (marker) {
      section = marker[1] === "_QUANT" ? "quant" : null;
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    // FAANG/Quant: | Company | Position | Location | Salary | Posting | Age |
    // Other:       | Company | Position | Location | Posting | Age |
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0]) || /^Company$/i.test(cells[0])) continue;

    const hasSalary = cells.length >= 6;
    const [companyCell, positionCell, locationCell] = cells;
    const salaryCell = hasSalary ? cells[3] : "";
    const postingCell = hasSalary ? cells[4] : cells[3];
    const ageCell = hasSalary ? cells[5] : cells[4];
    const company = cleanText(companyCell.match(/<strong>(.*?)<\/strong>/)?.[1] ?? companyCell.replace(/<[^>]+>/g, ""));
    const href = postingCell.match(/href="([^"]+)"/)?.[1];
    const title = cleanText(positionCell.replace(/<[^>]+>/g, ""));
    if (!company || !href || !title) continue;

    const location = cleanText(locationCell.replace(/<[^>]+>/g, ""));
    const salary = cleanText(salaryCell.replace(/<[^>]+>/g, "")) || null;

    jobs.push({
      title,
      company,
      location,
      category: categorize(title, null, section),
      role_type,
      season: null,
      salary,
      link: cleanLink(href),
      source: "speedyapply",
      sponsorship: null,
      posted_date: postedFromAge(ageCell, now),
      dedupe_key: dedupeKey(company, title, location),
    });
  }
  return jobs;
}

/**
 * speedyapply/2027-SWE-College-Jobs: HTML-in-markdown tables, one file per
 * region/level. USA internships live in README.md, USA new grad roles in
 * NEW_GRAD_USA.md — the latter powers the New Grad tab.
 */
export async function fetchSpeedy(): Promise<NormalizedJob[]> {
  const now = new Date();
  const results = await Promise.all(
    FILES.map(async ({ path, role_type }) =>
      parseTables(await fetchText(`${BASE}/${path}`), role_type, now),
    ),
  );
  return results.flat();
}

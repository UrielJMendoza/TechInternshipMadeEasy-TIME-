import type { NormalizedJob } from "../../types";
import { fetchText } from "../fetch";
import { categorize, cleanLink, cleanText, dedupeKey } from "../normalize";

const URL = "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/README.md";

/** "Jul 07" has no year; assume the most recent occurrence not in the future. */
function parseMonthDay(s: string, now: Date): string | null {
  const m = s.trim().match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months.indexOf(m[1]);
  if (month === -1) return null;
  let year = now.getUTCFullYear();
  const candidate = Date.UTC(year, month, Number(m[2]));
  if (candidate > now.getTime()) year -= 1;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function extractLocation(cell: string): string {
  // Multi-location cells look like:
  // <details><summary>**4 locations**</summary>New York, NY</br>Miami, FL</details>
  const stripped = cell
    .replace(/<details>.*?<\/summary>/gi, "")
    .replace(/<\/details>/gi, "")
    .replace(/<\/?br\s*\/?>/gi, "; ");
  return cleanText(stripped);
}

/**
 * vanshb03/Summer2027-Internships: one markdown table in README.md —
 * | Company | Role | Location | Application/Link | Date Posted |
 * "↳" repeats the previous company; 🔒 marks closed roles (skipped).
 */
export async function fetchVansh(): Promise<NormalizedJob[]> {
  const md = await fetchText(URL);
  const now = new Date();
  const jobs: NormalizedJob[] = [];
  let lastCompany = "";

  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0].replace(/\s/g, "")) || /^Company$/i.test(cells[0])) continue;
    if (line.includes("🔒")) continue; // application closed

    const [companyCell, roleCell, locationCell, linkCell, dateCell] = cells;
    const company = companyCell.includes("↳") ? lastCompany : cleanText(companyCell);
    if (!company) continue;
    lastCompany = company;

    const href = linkCell.match(/href="([^"]+)"/)?.[1];
    if (!href) continue;

    const sponsorship = roleCell.includes("🛂")
      ? "no-sponsorship"
      : roleCell.includes("🇺🇸")
        ? "us-citizenship"
        : null;
    const title = cleanText(roleCell);
    const location = extractLocation(locationCell);
    if (!title) continue;

    jobs.push({
      title,
      company,
      location,
      category: categorize(title),
      role_type: "internship",
      season: "Summer 2027",
      salary: null,
      link: cleanLink(href),
      source: "vanshb03",
      sponsorship,
      posted_date: parseMonthDay(dateCell, now),
      dedupe_key: dedupeKey(company, title, location),
    });
  }
  return jobs;
}

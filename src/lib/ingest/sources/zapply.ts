import type { NormalizedJob, RoleType } from "../../types";
import { fetchText } from "../fetch";
import { categorize, cleanLink, cleanText, dedupeKey } from "../normalize";

const URL = "https://raw.githubusercontent.com/zapplyjobs/Internships-2027/main/README.md";

function postedFromAge(age: string, now: Date): string | null {
  const match = cleanText(age).match(/^(\d+)\s*(m|h|d|w|mo)$/i);
  if (!match) return null;

  const unit = match[2].toLowerCase();
  const days =
    unit === "d" ? Number(match[1]) :
    unit === "w" ? Number(match[1]) * 7 :
    unit === "mo" ? Number(match[1]) * 30 :
    0;
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function seasonFrom(title: string): string | null {
  const match = title.match(/\b(Spring|Summer|Fall|Winter)\s+(20\d{2})\b/i);
  if (!match) return null;
  return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() + " " + match[2];
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
  const match = line.match(/<summary>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i);
  return match ? cleanText(match[1].replace(/<[^>]+>/g, "")) : null;
}

/**
 * zapplyjobs publishes a public, maintained README spanning engineering,
 * business, healthcare, and technology roles. The section heading is used as
 * an additional classification signal, while each row links to the employer.
 */
export async function fetchZapply(): Promise<NormalizedJob[]> {
  const markdown = await fetchText(URL);
  const now = new Date();
  const jobs: NormalizedJob[] = [];
  let section: string | null = null;

  for (const line of markdown.split("\n")) {
    const nextSection = sectionFrom(line);
    if (nextSection) {
      section = nextSection;
      continue;
    }

    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6 || /^Company$/i.test(cleanText(cells[0])) || /^-+$/.test(cells[0])) continue;

    const company = cleanText(cells[0].replace(/<[^>]+>/g, ""));
    const title = cleanText(cells[1].replace(/<[^>]+>/g, ""));
    const location = cleanText(cells[2].replace(/<[^>]+>/g, ""));
    const age = cells[3] ?? "";
    const visa = cells[4] ?? "";
    const linkCell = cells.find((cell) => /\]\(https?:\/\//.test(cell));
    const href = linkCell?.match(/\]\((https?:\/\/[^)\s]+)[^)]*\)/)?.[1];

    if (!company || !title || !href) continue;

    jobs.push({
      title,
      company,
      location,
      category: categorize(title, section),
      role_type: roleTypeFrom(title),
      season: seasonFrom(title),
      salary: null,
      link: cleanLink(href),
      source: "zapplyjobs",
      sponsorship: sponsorshipFrom(visa),
      posted_date: postedFromAge(age, now),
      dedupe_key: dedupeKey(company, title, location),
    });
  }

  return jobs;
}

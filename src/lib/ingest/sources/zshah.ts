import type { NormalizedJob } from "../../types";
import { fetchText } from "../fetch";
import { categorize, cleanLink, cleanText, dedupeKey } from "../normalize";

const URL =
  "https://raw.githubusercontent.com/zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships/main/docs/api/jobs.json";

interface ZshahJob {
  company: string;
  title: string;
  season: string | null;
  category: string | null;
  location: string | null;
  url: string;
  posted_at: string | null;
  sponsorship: string | null;
  salary: string | null;
}

/**
 * zshah101/Automated-List-Of-Summer-2027-and-Fall-2026-Tech-Internships
 * exposes a JSON API rebuilt every ~2h: { generated_at, count, jobs: [...] }.
 * Internships only (Summer 2027 + Fall 2026 cycles).
 */
export async function fetchZshah(): Promise<NormalizedJob[]> {
  const data = JSON.parse(await fetchText(URL)) as { jobs: ZshahJob[] };
  return data.jobs
    .filter((j) => j.company && j.title && j.url)
    .map((j) => {
      const title = cleanText(j.title);
      const company = cleanText(j.company);
      const location = cleanText(j.location ?? "");
      return {
        title,
        company,
        location,
        category: categorize(title, j.category),
        role_type: "internship" as const,
        season: j.season ?? null,
        salary: j.salary ?? null,
        link: cleanLink(j.url),
        source: "zshah101",
        sponsorship: j.sponsorship && j.sponsorship !== "unknown" ? j.sponsorship : null,
        posted_date: j.posted_at ? j.posted_at.slice(0, 10) : null,
        dedupe_key: dedupeKey(company, title, location),
      };
    });
}

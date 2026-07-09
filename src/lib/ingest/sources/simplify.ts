import type { NormalizedJob, RoleType } from "../../types";
import { categorize, cleanLink, cleanText, dedupeKey, fetchText } from "../normalize";

// SimplifyJobs renames the internship repo each season (Summer2026 → Summer2027…)
// and GitHub redirects raw URLs across renames, so this keeps working — but if a
// fetch starts 404ing, check github.com/SimplifyJobs for the current repo name.
const FEEDS: Array<{ url: string; role_type: RoleType }> = [
  {
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
    role_type: "internship",
  },
  {
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    role_type: "new_grad",
  },
];

interface SimplifyJob {
  company_name: string;
  title: string;
  url: string;
  locations: string[];
  terms?: string[];
  category: string | null;
  sponsorship: string | null;
  active: boolean;
  is_visible: boolean;
  date_posted: number; // unix seconds
}

// The internship feed spans many cycles at once (Summer 2026 … Spring 2028).
// Approximate each term's start so past cycles drop out on their own instead
// of needing a season allowlist that goes stale every year.
const SEASON_START_MONTH: Record<string, number> = { Spring: 1, Summer: 4, Fall: 7, Winter: 10 };
const TERM_GRACE_MS = 60 * 86_400_000; // a term that just started may still hire

function termStart(term: string): number | null {
  const m = term.match(/^(Spring|Summer|Fall|Winter)\s+(20\d{2})$/);
  if (!m) return null; // "N/A" and friends — no opinion
  return Date.UTC(Number(m[2]), SEASON_START_MONTH[m[1]], 1);
}

function isCurrentCycle(terms: string[] | undefined, now: number): boolean {
  if (!terms || terms.length === 0) return true; // recency filter decides
  let sawParseable = false;
  for (const t of terms) {
    const start = termStart(t);
    if (start === null) continue;
    sawParseable = true;
    if (start >= now - TERM_GRACE_MS) return true;
  }
  return !sawParseable;
}

function upcomingSeason(terms: string[] | undefined, now: number): string | null {
  if (!terms) return null;
  const upcoming = terms
    .map((t) => [t, termStart(t)] as const)
    .filter((e): e is [string, number] => e[1] !== null && e[1] >= now - TERM_GRACE_MS)
    .sort((a, b) => a[1] - b[1]);
  return upcoming[0]?.[0] ?? null;
}

function mapSponsorship(raw: string | null): string | null {
  if (!raw) return null;
  if (/citizen/i.test(raw)) return "us-citizenship";
  if (/does not|^no\b/i.test(raw)) return "no-sponsorship";
  if (/offers/i.test(raw)) return "offers-sponsorship";
  return null; // "Other" carries no signal
}

/**
 * SimplifyJobs/Summer20XX-Internships + SimplifyJobs/New-Grad-Positions expose
 * the full listing DB as .github/scripts/listings.json (~15k entries each,
 * most inactive). Active + visible rows carry real posted dates, locations,
 * categories and sponsorship — the richest source, so it runs first in
 * run.ts and wins dedupe ties.
 */
export async function fetchSimplify(): Promise<NormalizedJob[]> {
  const now = Date.now();
  const results = await Promise.all(
    FEEDS.map(async ({ url, role_type }) => {
      const data = JSON.parse(await fetchText(url)) as SimplifyJob[];
      return data
        .filter(
          (j) =>
            j.active &&
            j.is_visible &&
            j.company_name &&
            j.title &&
            j.url &&
            (role_type === "new_grad" || isCurrentCycle(j.terms, now)),
        )
        .map((j) => {
          const title = cleanText(j.title);
          const company = cleanText(j.company_name);
          const location = (j.locations ?? []).map(cleanText).filter(Boolean).join("; ");
          return {
            title,
            company,
            location,
            category: categorize(title, j.category),
            role_type,
            season: role_type === "internship" ? upcomingSeason(j.terms, now) : null,
            salary: null,
            link: cleanLink(j.url),
            source: "simplify",
            sponsorship: mapSponsorship(j.sponsorship),
            posted_date: j.date_posted
              ? new Date(j.date_posted * 1000).toISOString().slice(0, 10)
              : null,
            dedupe_key: dedupeKey(company, title, location),
          };
        });
    }),
  );
  return results.flat();
}

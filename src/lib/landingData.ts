import type { Internship } from "@/lib/types";

export const RECENTLY_ADDED_DAYS = 14;

export interface LandingStats {
  openRoles: number | null;
  recentlyAdded: number | null;
  sourcesRepresented: number | null;
  sourceListedPay: number | null;
  sponsorshipKnown: number | null;
  updatedAt: string | null;
}

function isWithinDays(iso: string, now: number, days: number): boolean {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return false;
  const age = Math.max(0, now - timestamp);
  return age <= days * 86_400_000;
}

export function deriveLandingStats(
  jobs: Internship[],
  updatedAt: string | null,
  now: number,
  loadError: boolean,
): LandingStats {
  if (loadError) {
    return {
      openRoles: null,
      recentlyAdded: null,
      sourcesRepresented: null,
      sourceListedPay: null,
      sponsorshipKnown: null,
      updatedAt: null,
    };
  }

  return {
    openRoles: jobs.length,
    recentlyAdded: jobs.filter((job) =>
      isWithinDays(job.first_seen_at, now, RECENTLY_ADDED_DAYS),
    ).length,
    sourcesRepresented: new Set(
      jobs.map((job) => job.source.trim()).filter(Boolean),
    ).size,
    sourceListedPay: jobs.filter((job) => Boolean(job.salary?.trim())).length,
    sponsorshipKnown: jobs.filter((job) => Boolean(job.sponsorship?.trim()))
      .length,
    updatedAt:
      updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
  };
}

export function selectListingCompanies(
  jobs: Internship[],
  limit = 14,
): string[] {
  if (limit <= 0) return [];

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const job of jobs) {
    if (job.is_active === false) continue;
    const company = job.company.trim();
    const key = company.toLocaleLowerCase();
    if (!company || seen.has(key)) continue;
    seen.add(key);
    selected.push(company);
    if (selected.length === limit) break;
  }

  return selected;
}

export function selectShowcaseJob(
  jobs: Internship[],
  now: number,
): Internship | null {
  let best: Internship | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const job of jobs) {
    const firstSeen = Date.parse(job.first_seen_at);
    const ageDays = Number.isFinite(firstSeen)
      ? Math.max(0, Math.floor((now - firstSeen) / 86_400_000))
      : 365;
    const score =
      Math.max(0, RECENTLY_ADDED_DAYS - ageDays) +
      (job.salary?.trim() ? 6 : 0) +
      (job.sponsorship?.trim() ? 3 : 0);

    if (score > bestScore) {
      best = job;
      bestScore = score;
    }
  }

  return best;
}

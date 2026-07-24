import type { Internship } from "@/lib/types";
import { knownCompanyDomain } from "@/lib/companyDomain";

export const RECENTLY_ADDED_DAYS = 14;

export function selectListingCompanies(
  jobs: Internship[],
  limit = 12,
): string[] {
  if (limit <= 0) return [];

  const priorityDomains = [
    "google.com",
    "amazon.com",
    "nvidia.com",
    "tiktok.com",
    "boeing.com",
    "cloudflare.com",
    "hp.com",
    "chevron.com",
    "goldmansachs.com",
    "accenture.com",
    "lockheedmartin.com",
    "thetradedesk.com",
    "citadel.com",
    "apple.com",
    "microsoft.com",
    "meta.com",
  ] as const;
  const companiesByDomain = new Map<string, string>();

  for (const job of jobs) {
    if (job.is_active === false) continue;
    const company = job.company.trim();
    const domain = company ? knownCompanyDomain(company) : null;
    if (!domain || companiesByDomain.has(domain)) continue;
    companiesByDomain.set(domain, company);
  }

  return [...companiesByDomain]
    .sort(([domainA, companyA], [domainB, companyB]) => {
      const priorityA = priorityDomains.indexOf(
        domainA as (typeof priorityDomains)[number],
      );
      const priorityB = priorityDomains.indexOf(
        domainB as (typeof priorityDomains)[number],
      );
      if (priorityA !== -1 || priorityB !== -1) {
        if (priorityA === -1) return 1;
        if (priorityB === -1) return -1;
        return priorityA - priorityB;
      }
      return companyA.localeCompare(companyB);
    })
    .slice(0, limit)
    .map(([, company]) => company);
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

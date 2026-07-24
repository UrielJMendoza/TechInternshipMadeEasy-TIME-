import type { Internship } from "@/lib/types";
import { knownCompanyDomain } from "@/lib/companyDomain";

export const RECENTLY_ADDED_DAYS = 14;

const PRIORITY_DOMAINS = [
  "google.com",
  "amazon.com",
  "nvidia.com",
  "tiktok.com",
  "boeing.com",
  "cloudflare.com",
  "apple.com",
  "microsoft.com",
  "meta.com",
  "goldmansachs.com",
  "accenture.com",
  "lockheedmartin.com",
  "thetradedesk.com",
  "citadel.com",
  "hp.com",
  "chevron.com",
] as const;

function priorityForDomain(domain: string): number {
  const priority = PRIORITY_DOMAINS.indexOf(
    domain as (typeof PRIORITY_DOMAINS)[number],
  );
  return priority === -1 ? PRIORITY_DOMAINS.length : priority;
}

export function selectListingCompanies(
  jobs: Internship[],
  limit = 12,
): string[] {
  if (limit <= 0) return [];

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
      const priorityA = priorityForDomain(domainA);
      const priorityB = priorityForDomain(domainB);
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return companyA.localeCompare(companyB);
    })
    .slice(0, limit)
    .map(([, company]) => company);
}

export function selectLandingPreviewJobs(
  jobs: Internship[],
  limit = 6,
): Internship[] {
  if (limit <= 0) return [];

  const candidates = jobs
    .flatMap((job) => {
      if (job.is_active === false) return [];
      const domain = knownCompanyDomain(job.company.trim());
      return domain ? [{ domain, job }] : [];
    })
    .sort((candidateA, candidateB) => {
      const priorityDifference =
        priorityForDomain(candidateA.domain) -
        priorityForDomain(candidateB.domain);
      if (priorityDifference !== 0) return priorityDifference;

      const timeA = Date.parse(candidateA.job.first_seen_at);
      const timeB = Date.parse(candidateB.job.first_seen_at);
      const freshnessDifference =
        (Number.isFinite(timeB) ? timeB : 0) -
        (Number.isFinite(timeA) ? timeA : 0);
      if (freshnessDifference !== 0) return freshnessDifference;

      const companyDifference = candidateA.job.company.localeCompare(
        candidateB.job.company,
      );
      return companyDifference || candidateA.job.id.localeCompare(candidateB.job.id);
    });

  const selected: Internship[] = [];
  const seenDomains = new Set<string>();

  for (const candidate of candidates) {
    if (seenDomains.has(candidate.domain)) continue;
    seenDomains.add(candidate.domain);
    selected.push(candidate.job);
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

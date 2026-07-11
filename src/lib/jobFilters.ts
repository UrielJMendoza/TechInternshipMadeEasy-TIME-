import {
  CATEGORY_LABELS,
  type Category,
  type Internship,
} from "./types";
import {
  getPrimaryLocationLabel,
  getJobLocationSearchText,
  isRemoteLocation,
  matchesPhysicalLocationSelection,
  normalizeLocationText,
  type PhysicalLocationFacetId,
} from "./jobLocations";
import {
  APPLICATION_STAGE_ORDER,
  getApplicationStage,
  type ApplicationRecords,
  type ApplicationStage,
} from "./applicationTracking";
import type {
  Collection,
  Freshness,
  SortKey,
} from "./boardFilterState";
import { annualSalary } from "./compensation";
import {
  HOT_DAYS,
  NEW_DAYS,
  daysAgo,
  postedTime,
} from "./jobTime";

export type SponsorshipStatus =
  | "offers-sponsorship"
  | "no-sponsorship"
  | "citizens-only"
  | "unknown";

function normalizeSponsorship(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classify source text conservatively; ambiguous/absent values stay unknown. */
export function classifySponsorship(
  value: string | null | undefined,
): SponsorshipStatus {
  if (!value) return "unknown";
  const normalized = normalizeSponsorship(value);
  if (
    !normalized ||
    /^(?:unknown|other|n\/?a|not specified|unspecified|tbd)$/.test(normalized)
  ) {
    return "unknown";
  }
  if (/\b(?:citizens? only|us citizenship|u s citizenship|us persons?|security clearance)\b/.test(normalized)) {
    return "citizens-only";
  }
  if (
    /\b(?:no|not|does not|do not|cannot|can't|without)\b.{0,24}\bsponsor/.test(normalized) ||
    /\bsponsorship\s+(?:is\s+)?(?:not|unavailable|unsupported)\b/.test(normalized)
  ) {
    return "no-sponsorship";
  }
  if (
    normalized === "offers sponsorship" ||
    normalized === "visa sponsorship" ||
    /\b(?:offer(?:s|ed)?|provide(?:s|d)?|will)\b.{0,24}\b(?:visa\s+)?sponsor(?:ship)?\b/.test(normalized) ||
    /\bsponsor(?:s|ed|ing)?\b.{0,16}\b(?:visa|h 1b)\b/.test(normalized) ||
    /\b(?:visa|h 1b)\s+sponsorship\s+(?:available|offered|provided)\b/.test(normalized)
  ) {
    return "offers-sponsorship";
  }
  return "unknown";
}

export function hasExplicitVisaSponsorship(
  value: string | null | undefined,
): boolean {
  return classifySponsorship(value) === "offers-sponsorship";
}

export function matchesVisaSponsorshipFilter(
  value: string | null | undefined,
  visaSponsorshipOnly: boolean,
): boolean {
  return !visaSponsorshipOnly || hasExplicitVisaSponsorship(value);
}

export const APPLICATION_STAGE_RANK = Object.fromEntries(
  APPLICATION_STAGE_ORDER.map((stage, index) => [stage, index]),
) as Record<ApplicationStage, number>;

export function applicationStageRank(stage: ApplicationStage): number {
  return APPLICATION_STAGE_RANK[stage];
}

export function compareApplicationStages(
  a: ApplicationStage,
  b: ApplicationStage,
): number {
  return applicationStageRank(a) - applicationStageRank(b);
}

export interface JobSearchFields {
  title: string;
  company: string;
  location: string;
  category?: Category;
}

function normalizeSearchText(value: string): string {
  return normalizeLocationText(value);
}

export function buildJobSearchHaystack(job: JobSearchFields): string {
  const category = job.category
    ? `${job.category} ${CATEGORY_LABELS[job.category]}`
    : "";
  return normalizeSearchText(
    [
      job.title,
      job.company,
      job.location,
      getJobLocationSearchText(job.location),
      category,
    ].join(" "),
  );
}

export function matchesJobSearch(job: JobSearchFields, query: string): boolean {
  const normalizedQuery = normalizeLocationText(query);
  return !normalizedQuery || buildJobSearchHaystack(job).includes(normalizedQuery);
}

export interface JobFilterOptions {
  query: string;
  locationIds: readonly PhysicalLocationFacetId[];
  remoteOnly: boolean;
  visaSponsorship: boolean;
  stages: readonly ApplicationStage[];
  freshness: Freshness;
  collection: Collection;
  sort: SortKey;
  saved: ReadonlySet<string>;
  applications: ApplicationRecords;
  now: number;
  matchesMajor: (job: Internship) => boolean;
  matchesNiche: (job: Internship) => boolean;
}

/** Pure filter/sort pipeline used by the board and fixture tests. */
export function filterAndSortJobs(
  jobs: readonly Internship[],
  options: JobFilterOptions,
): Internship[] {
  const list = jobs.filter((job) => {
    const stage = getApplicationStage(options.applications, job.link);
    if (options.collection === "saved" && !options.saved.has(job.link)) {
      return false;
    }
    if (!matchesJobSearch(job, options.query)) return false;
    if (!options.matchesMajor(job) || !options.matchesNiche(job)) return false;
    if (options.remoteOnly && !isRemoteLocation(job.location)) return false;
    if (
      !options.remoteOnly &&
      !matchesPhysicalLocationSelection(job.location, options.locationIds)
    ) {
      return false;
    }
    if (
      !matchesVisaSponsorshipFilter(
        job.sponsorship,
        options.visaSponsorship,
      )
    ) {
      return false;
    }
    if (options.stages.length > 0 && !options.stages.includes(stage)) {
      return false;
    }
    if (
      options.freshness === "hot" &&
      daysAgo(job, options.now) > HOT_DAYS
    ) {
      return false;
    }
    if (
      options.freshness === "new" &&
      daysAgo(job, options.now) > NEW_DAYS
    ) {
      return false;
    }
    return true;
  });

  const byNewest = (a: Internship, b: Internship) =>
    postedTime(b) - postedTime(a) || a.company.localeCompare(b.company);
  switch (options.sort) {
    case "featured":
      list.sort((a, b) => {
        const featuredA =
          a.category === "software" || a.category === "cloud" ? 0 : 1;
        const featuredB =
          b.category === "software" || b.category === "cloud" ? 0 : 1;
        return featuredA - featuredB || byNewest(a, b);
      });
      break;
    case "newest":
      list.sort(byNewest);
      break;
    case "company":
      list.sort(
        (a, b) => a.company.localeCompare(b.company) || byNewest(a, b),
      );
      break;
    case "salary":
      list.sort(
        (a, b) =>
          annualSalary(b.salary) - annualSalary(a.salary) || byNewest(a, b),
      );
      break;
    case "location":
      list.sort(
        (a, b) =>
          getPrimaryLocationLabel(a.location).localeCompare(
            getPrimaryLocationLabel(b.location),
          ) || byNewest(a, b),
      );
      break;
    case "application-stage":
      list.sort(
        (a, b) =>
          compareApplicationStages(
            getApplicationStage(options.applications, a.link),
            getApplicationStage(options.applications, b.link),
          ) || byNewest(a, b),
      );
      break;
  }
  return list;
}

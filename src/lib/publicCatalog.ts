import {
  DEFAULT_BOARD_FILTERS,
  serializeBoardFilters,
  type BoardFilters,
} from "@/lib/boardFilterState";
import {
  classifySponsorship,
  hasExplicitVisaSponsorship,
} from "@/lib/jobFilters";
import {
  PHYSICAL_LOCATION_FACETS,
  getUsLocationDisplay,
  isRemoteLocation,
  matchesPhysicalLocationSelection,
} from "@/lib/jobLocations";
import { MAJORS_BY_ID } from "@/lib/jobTaxonomy";
import { canonicalCompanyIdentity } from "@/lib/ingest/normalize";
import type { Internship } from "@/lib/types";

const DAY_MS = 86_400_000;

export const MIN_INDEXABLE_COLLECTION_JOBS = 10;
export const MIN_INDEXABLE_COLLECTION_COMPANIES = 3;
export const MAX_INDEXABLE_COLLECTION_AGE_DAYS = 14;
export const MIN_INDEXABLE_COMPANY_JOBS = 3;
export const RECENTLY_CLOSED_DAYS = 90;
export const NEW_THIS_WEEK_DAYS = 7;

export type PublicCollectionKind =
  | "role-type"
  | "category"
  | "evidence"
  | "freshness"
  | "location"
  | "season"
  | "campus";

export interface PublicCollectionDefinition {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  methodology: string;
  kind: PublicCollectionKind;
  path: string;
  jobsPath: string;
  match: (job: Internship) => boolean;
}

export interface PublicCollection extends PublicCollectionDefinition {
  jobs: Internship[];
  updatedAt: string | null;
  indexable: boolean;
}

export interface CompanyCount {
  label: string;
  count: number;
}

export interface CompanyHistoryMonth {
  month: string;
  count: number;
}

export interface CompanyProfile {
  slug: string;
  name: string;
  activeJobs: Internship[];
  recentlyClosedJobs: Internship[];
  categoryCounts: CompanyCount[];
  locationCounts: CompanyCount[];
  employerPayCount: number;
  sponsorshipCounts: Record<
    "offers-sponsorship" | "no-sponsorship" | "citizens-only" | "unknown",
    number
  >;
  history: CompanyHistoryMonth[];
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  indexable: boolean;
}

function safeTime(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function sortPublicJobs(jobs: readonly Internship[]): Internship[] {
  return [...jobs].sort(
    (left, right) =>
      safeTime(right.first_seen_at) - safeTime(left.first_seen_at) ||
      left.company.localeCompare(right.company) ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
}

function latestObservation(jobs: readonly Internship[]): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const job of jobs) {
    const time = safeTime(job.last_seen_at);
    if (time <= latestTime) continue;
    latest = job.last_seen_at;
    latestTime = time;
  }
  return latest;
}

function collectionIsIndexable(
  jobs: readonly Internship[],
  now: number,
): boolean {
  const latest = latestObservation(jobs);
  return (
    jobs.length >= MIN_INDEXABLE_COLLECTION_JOBS &&
    new Set(jobs.map(companySlugForJob).filter(Boolean)).size >=
      MIN_INDEXABLE_COLLECTION_COMPANIES &&
    latest !== null &&
    safeTime(latest) >= now - MAX_INDEXABLE_COLLECTION_AGE_DAYS * DAY_MS
  );
}

export function slugifyPublicValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function companySlugForJob(
  job: Pick<Internship, "company" | "canonical_company">,
): string {
  return canonicalCompanyIdentity(
    job.canonical_company?.trim() || job.company,
  );
}

export function companySlugFromName(company: string): string {
  return canonicalCompanyIdentity(company);
}

export function jobPublicPath(job: Pick<Internship, "id">): string {
  return `/jobs/${encodeURIComponent(job.id)}`;
}

export function isLegitimateActiveJob(job: Internship): boolean {
  return (
    job.is_active !== false &&
    job.expiration_status !== "expired" &&
    job.expiration_status !== "possibly-closed"
  );
}

function publicJobsPath(changes: Partial<BoardFilters>): string {
  const filters: BoardFilters = {
    ...DEFAULT_BOARD_FILTERS,
    ...changes,
  };
  const query = serializeBoardFilters(filters).toString();
  return query ? `/jobs?${query}` : "/jobs";
}

function coreCollectionDefinitions(now: number): PublicCollectionDefinition[] {
  return [
    {
      slug: "internships",
      title: "Internships with current public listings",
      shortTitle: "Internships",
      description:
        "Current U.S. internship listings observed in Timley’s public source feed, with source freshness and available pay or sponsorship evidence.",
      methodology:
        "Includes active records classified as internships after Timley’s U.S.-location and 120-day dated-listing checks.",
      kind: "role-type",
      path: "/discover/internships",
      jobsPath: publicJobsPath({ tab: "internship" }),
      match: (job) => job.role_type === "internship",
    },
    {
      slug: "new-grad",
      title: "New-grad roles with current public listings",
      shortTitle: "New-grad roles",
      description:
        "Current U.S. new-grad listings observed in Timley’s public source feed, organized for evidence-first browsing.",
      methodology:
        "Includes active records classified as new-grad roles after Timley’s U.S.-location and 120-day dated-listing checks.",
      kind: "role-type",
      path: "/discover/new-grad",
      jobsPath: publicJobsPath({ tab: "new_grad" }),
      match: (job) => job.role_type === "new_grad",
    },
    {
      slug: "software-engineering",
      title: "Software engineering internships and new-grad roles",
      shortTitle: "Software engineering",
      description:
        "Current software engineering internships and new-grad roles from Timley’s public listing sources.",
      methodology:
        "Includes active records assigned to the software category by the checked-in normalization taxonomy; it does not infer skills or employer intent.",
      kind: "category",
      path: "/discover/software-engineering",
      jobsPath: publicJobsPath({
        major: "computer-science",
        niche: "software-engineering",
      }),
      match: (job) => job.category === "software",
    },
    {
      slug: "data-and-ml",
      title: "Data and machine-learning internships and new-grad roles",
      shortTitle: "Data and ML",
      description:
        "Current data, analytics, and machine-learning opportunities from Timley’s public listing sources.",
      methodology:
        "Includes active records assigned to Timley’s data/ML category from source title evidence; broad AI-career claims are not added.",
      kind: "category",
      path: "/discover/data-and-ml",
      jobsPath: publicJobsPath({
        major: "computer-science",
        niche: "data-ml",
      }),
      match: (job) => job.category === "data-ml",
    },
    {
      slug: "security",
      title: "Security internships and new-grad roles",
      shortTitle: "Security",
      description:
        "Current security-focused internships and new-grad listings observed in Timley’s public sources.",
      methodology:
        "Includes active records assigned to the security category by the checked-in title and source taxonomy.",
      kind: "category",
      path: "/discover/security",
      jobsPath: publicJobsPath({
        major: "computer-science",
        niche: "security",
      }),
      match: (job) => job.category === "security",
    },
    {
      slug: "remote",
      title: "Remote internships and new-grad roles",
      shortTitle: "Remote roles",
      description:
        "Current listings whose public location text explicitly identifies remote work in the United States.",
      methodology:
        "Includes only active records with explicit remote language. Hybrid or nationwide wording alone is not treated as remote.",
      kind: "evidence",
      path: "/discover/remote",
      jobsPath: publicJobsPath({ remoteOnly: true }),
      match: (job) => isRemoteLocation(job.location),
    },
    {
      slug: "sponsorship-friendly",
      title: "Roles with explicit sponsorship-friendly evidence",
      shortTitle: "Sponsorship-friendly roles",
      description:
        "Current listings whose public source text explicitly says visa sponsorship is offered or available.",
      methodology:
        "Includes only active listings with affirmative sponsorship language. Missing or ambiguous evidence remains unknown and is excluded.",
      kind: "evidence",
      path: "/discover/sponsorship-friendly",
      jobsPath: publicJobsPath({ visaSponsorship: true }),
      match: (job) => hasExplicitVisaSponsorship(job.sponsorship),
    },
    {
      slug: "new-this-week",
      title: "Jobs newly observed this week",
      shortTitle: "New this week",
      description:
        "Active internships and new-grad roles first observed by Timley during the last seven days.",
      methodology:
        "Uses Timley’s first-seen timestamp, not an inferred employer posting date. A source may have published a role earlier.",
      kind: "freshness",
      path: "/discover/new-this-week",
      jobsPath: "/jobs",
      match: (job) => {
        const firstSeen = safeTime(job.first_seen_at);
        return firstSeen >= now - NEW_THIS_WEEK_DAYS * DAY_MS;
      },
    },
  ];
}

function locationCollectionDefinitions(): PublicCollectionDefinition[] {
  return PHYSICAL_LOCATION_FACETS.map((location) => ({
    slug: location.id,
    title: `${location.label} internships and new-grad roles`,
    shortTitle: location.label,
    description: `Current internships and new-grad listings with a normalized ${location.label} location match.`,
    methodology:
      "Matches explicit city and metro aliases in the public location field. Multi-location listings can appear in more than one location collection.",
    kind: "location" as const,
    path: `/discover/${location.id}`,
    jobsPath: publicJobsPath({ locationIds: [location.id] }),
    match: (job: Internship) =>
      matchesPhysicalLocationSelection(job.location, [location.id]),
  }));
}

function seasonCollectionDefinitions(
  jobs: readonly Internship[],
): PublicCollectionDefinition[] {
  const seasonByKey = new Map<string, string>();
  for (const job of jobs) {
    const value = job.season?.trim().replace(/\s+/g, " ");
    const match = value?.match(/^(spring|summer|fall|winter)\s+(20\d{2})$/i);
    if (!match) continue;
    const display = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`;
    seasonByKey.set(display.toLowerCase(), display);
  }
  const seasons = [...seasonByKey.values()].sort();

  return seasons.map((season) => {
    const slug = `season-${slugifyPublicValue(season)}`;
    return {
      slug,
      title: `${season} internships and new-grad roles`,
      shortTitle: season,
      description: `Current listings whose public source data identifies the ${season} hiring season.`,
      methodology:
        "Uses the normalized season supplied by public source data. Listings without explicit season evidence are excluded.",
      kind: "season" as const,
      path: `/discover/${slug}`,
      jobsPath: "/jobs",
      match: (job: Internship) =>
        job.season?.trim().toLocaleLowerCase() === season.toLocaleLowerCase(),
    };
  });
}

export function buildPublicCollections(
  jobs: readonly Internship[],
  now: number,
): PublicCollection[] {
  const definitions = [
    ...coreCollectionDefinitions(now),
    ...locationCollectionDefinitions(),
    ...seasonCollectionDefinitions(jobs),
  ];

  return definitions.map((definition) => {
    const matches = sortPublicJobs(jobs.filter(definition.match));
    return {
      ...definition,
      jobs: matches,
      updatedAt: latestObservation(matches),
      indexable: collectionIsIndexable(matches, now),
    };
  });
}

export function findPublicCollection(
  jobs: readonly Internship[],
  now: number,
  slug: string,
): PublicCollection | null {
  return (
    buildPublicCollections(jobs, now).find(
      (collection) => collection.slug === slug,
    ) ?? null
  );
}

export function buildCampusCollections(
  jobs: readonly Internship[],
  now = Date.now(),
): PublicCollection[] {
  const definitions: PublicCollectionDefinition[] = [
    {
      slug: "software-and-data",
      title: "Campus software and data opportunity collection",
      shortTitle: "Software and data",
      description:
        "A reusable public collection of current software, cloud, data/ML, security, and quant roles for campus groups.",
      methodology:
        "This is an unaffiliated filter bundle for sharing with a campus or club. It does not use school data or imply school or employer endorsement.",
      kind: "campus",
      path: "/collections/campus/software-and-data",
      jobsPath: publicJobsPath({ major: "computer-science" }),
      match: MAJORS_BY_ID["computer-science"].matches,
    },
    {
      slug: "engineering",
      title: "Campus engineering opportunity collection",
      shortTitle: "Engineering",
      description:
        "A reusable public collection of current engineering internships and new-grad roles for campus groups.",
      methodology:
        "This is an unaffiliated filter bundle based on Timley’s engineering taxonomy. It does not use school data or imply school or employer endorsement.",
      kind: "campus",
      path: "/collections/campus/engineering",
      jobsPath: publicJobsPath({ major: "engineering" }),
      match: MAJORS_BY_ID.engineering.matches,
    },
    {
      slug: "business",
      title: "Campus business opportunity collection",
      shortTitle: "Business",
      description:
        "A reusable public collection of current finance, consulting, operations, product, marketing, and related roles for campus groups.",
      methodology:
        "This is an unaffiliated filter bundle based on Timley’s business taxonomy. It does not use school data or imply school or employer endorsement.",
      kind: "campus",
      path: "/collections/campus/business",
      jobsPath: publicJobsPath({ major: "business" }),
      match: MAJORS_BY_ID.business.matches,
    },
  ];

  return definitions.map((definition) => {
    const matches = sortPublicJobs(jobs.filter(definition.match));
    return {
      ...definition,
      jobs: matches,
      updatedAt: latestObservation(matches),
      indexable: collectionIsIndexable(matches, now),
    };
  });
}

function countByLabel(values: readonly string[]): CompanyCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
}

function preferredCompanyName(jobs: readonly Internship[]): string {
  return countByLabel(jobs.map((job) => job.company))[0]?.label ?? "Company";
}

function observedRange(jobs: readonly Internship[]): {
  first: string | null;
  last: string | null;
} {
  const observed = jobs
    .flatMap((job) => [job.first_seen_at, job.last_seen_at])
    .filter((value) => Number.isFinite(safeTime(value)))
    .sort((left, right) => safeTime(left) - safeTime(right));
  return {
    first: observed[0] ?? null,
    last: observed.at(-1) ?? null,
  };
}

function companyHistory(jobs: readonly Internship[]): CompanyHistoryMonth[] {
  if (jobs.length < 10) return [];
  const counts = new Map<string, number>();
  for (const job of jobs) {
    if (!Number.isFinite(safeTime(job.first_seen_at))) continue;
    const month = job.first_seen_at.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const history = [...counts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((left, right) => left.month.localeCompare(right.month));
  if (history.length < 3) return [];
  const first = Date.parse(`${history[0].month}-01T00:00:00.000Z`);
  const last = Date.parse(`${history.at(-1)?.month}-01T00:00:00.000Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first < 60 * DAY_MS) {
    return [];
  }
  return history.slice(-12);
}

export function buildCompanyProfiles(
  activeJobs: readonly Internship[],
  recentlyClosedJobs: readonly Internship[],
): CompanyProfile[] {
  const groups = new Map<
    string,
    { active: Internship[]; closed: Internship[] }
  >();

  for (const job of activeJobs) {
    const slug = companySlugForJob(job);
    if (!slug) continue;
    const group = groups.get(slug) ?? { active: [], closed: [] };
    group.active.push(job);
    groups.set(slug, group);
  }
  for (const job of recentlyClosedJobs) {
    const slug = companySlugForJob(job);
    if (!slug) continue;
    const group = groups.get(slug) ?? { active: [], closed: [] };
    group.closed.push(job);
    groups.set(slug, group);
  }

  return [...groups.entries()]
    .map(([slug, group]) => {
      const active = sortPublicJobs(group.active);
      const closed = [...group.closed].sort(
        (left, right) =>
          safeTime(right.closed_at) - safeTime(left.closed_at) ||
          safeTime(right.last_seen_at) - safeTime(left.last_seen_at),
      );
      const all = [...active, ...closed];
      const observed = observedRange(all);
      const sponsorshipCounts: CompanyProfile["sponsorshipCounts"] = {
        "offers-sponsorship": 0,
        "no-sponsorship": 0,
        "citizens-only": 0,
        unknown: 0,
      };
      for (const job of active) {
        sponsorshipCounts[classifySponsorship(job.sponsorship)] += 1;
      }

      return {
        slug,
        name: preferredCompanyName(active.length > 0 ? active : all),
        activeJobs: active,
        recentlyClosedJobs: closed,
        categoryCounts: countByLabel(active.map((job) => job.category)),
        locationCounts: countByLabel(
          active.map((job) => getUsLocationDisplay(job.location)),
        ),
        employerPayCount: active.filter(
          (job) =>
            job.pay_evidence === "employer-listed" &&
            Boolean(job.salary?.trim()),
        ).length,
        sponsorshipCounts,
        history: companyHistory(all),
        firstObservedAt: observed.first,
        lastObservedAt: observed.last,
        indexable: active.length >= MIN_INDEXABLE_COMPANY_JOBS,
      };
    })
    .sort(
      (left, right) =>
        right.activeJobs.length - left.activeJobs.length ||
        left.name.localeCompare(right.name),
    );
}

export function findCompanyProfile(
  activeJobs: readonly Internship[],
  recentlyClosedJobs: readonly Internship[],
  slug: string,
): CompanyProfile | null {
  return (
    buildCompanyProfiles(activeJobs, recentlyClosedJobs).find(
      (profile) => profile.slug === slug,
    ) ?? null
  );
}

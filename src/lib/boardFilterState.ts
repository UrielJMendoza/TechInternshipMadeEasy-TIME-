import {
  APPLICATION_STAGE_ORDER,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import type { RoleType } from "@/lib/types";
import {
  isPhysicalLocationFacetId,
  type PhysicalLocationFacetId,
} from "@/lib/jobLocations";

export type SortKey =
  | "featured"
  | "newest"
  | "company"
  | "salary"
  | "location"
  | "application-stage";
export type Freshness = "all" | "hot" | "new";
export type Collection = "all" | "saved";
export type ViewMode = "card" | "table";
export type MajorId = "all" | "computer-science" | "engineering" | "business";
export type LocationOrder = "popular" | "alphabetical";
export type MinimumSalary =
  | "any"
  | "40000"
  | "60000"
  | "80000"
  | "100000"
  | "120000";

export interface BoardFilters {
  tab: RoleType;
  query: string;
  major: MajorId;
  niche: string;
  locationIds: PhysicalLocationFacetId[];
  locationOrder: LocationOrder;
  freshness: Freshness;
  collection: Collection;
  sort: SortKey;
  stages: ApplicationStage[];
  remoteOnly: boolean;
  visaSponsorship: boolean;
  minimumSalary: MinimumSalary;
}

export const BOARD_FILTER_STORAGE_KEY = "timley:filters:v1";

export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  tab: "internship",
  query: "",
  major: "all",
  niche: "all",
  locationIds: [],
  locationOrder: "popular",
  freshness: "all",
  collection: "all",
  sort: "featured",
  stages: [],
  remoteOnly: false,
  visaSponsorship: false,
  minimumSalary: "any",
};

const MAJORS = new Set<MajorId>([
  "all",
  "computer-science",
  "engineering",
  "business",
]);
const FRESHNESS = new Set<Freshness>(["all", "hot", "new"]);
const COLLECTIONS = new Set<Collection>(["all", "saved"]);
const SORTS = new Set<SortKey>([
  "featured",
  "newest",
  "company",
  "salary",
  "location",
  "application-stage",
]);
const LOCATION_ORDERS = new Set<LocationOrder>(["popular", "alphabetical"]);
const MINIMUM_SALARIES = new Set<MinimumSalary>([
  "any",
  "40000",
  "60000",
  "80000",
  "100000",
  "120000",
]);
const STAGES = new Set<ApplicationStage>(APPLICATION_STAGE_ORDER);

export const PUBLIC_BOARD_FILTER_QUERY_KEYS = [
  "tab",
  "q",
  "major",
  "niche",
  "locations",
  "location-order",
  "freshness",
  "sort",
  "remote",
  "visa",
  "min-salary",
] as const;

export const PRIVATE_BOARD_FILTER_QUERY_KEYS = [
  "collection",
  "stages",
] as const;

const FILTER_QUERY_KEYS = [
  ...PUBLIC_BOARD_FILTER_QUERY_KEYS,
  ...PRIVATE_BOARD_FILTER_QUERY_KEYS,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function validatedFilters(value: unknown): BoardFilters {
  if (!isRecord(value)) return { ...DEFAULT_BOARD_FILTERS };

  const tab = value.tab === "new_grad" ? "new_grad" : "internship";
  const major = MAJORS.has(value.major as MajorId)
    ? (value.major as MajorId)
    : DEFAULT_BOARD_FILTERS.major;
  const freshness = FRESHNESS.has(value.freshness as Freshness)
    ? (value.freshness as Freshness)
    : DEFAULT_BOARD_FILTERS.freshness;
  const collection = COLLECTIONS.has(value.collection as Collection)
    ? (value.collection as Collection)
    : DEFAULT_BOARD_FILTERS.collection;
  const sort = SORTS.has(value.sort as SortKey)
    ? (value.sort as SortKey)
    : DEFAULT_BOARD_FILTERS.sort;
  const locationOrder = LOCATION_ORDERS.has(value.locationOrder as LocationOrder)
    ? (value.locationOrder as LocationOrder)
    : DEFAULT_BOARD_FILTERS.locationOrder;
  const minimumSalary = MINIMUM_SALARIES.has(
    value.minimumSalary as MinimumSalary,
  )
    ? (value.minimumSalary as MinimumSalary)
    : DEFAULT_BOARD_FILTERS.minimumSalary;

  return {
    tab,
    query: typeof value.query === "string" ? value.query.slice(0, 200) : "",
    major,
    niche: typeof value.niche === "string" && value.niche ? value.niche : "all",
    locationIds: cleanStrings(value.locationIds)
      .filter((id): id is PhysicalLocationFacetId =>
        isPhysicalLocationFacetId(id),
      )
      .slice(0, 20),
    locationOrder,
    freshness,
    collection,
    sort,
    stages: cleanStrings(value.stages)
      .map((stage) => (stage === "oa" ? "assessment" : stage))
      .filter((stage): stage is ApplicationStage => STAGES.has(stage as ApplicationStage))
      .sort((a, b) => APPLICATION_STAGE_ORDER.indexOf(a) - APPLICATION_STAGE_ORDER.indexOf(b)),
    remoteOnly: value.remoteOnly === true,
    visaSponsorship: value.visaSponsorship === true,
    minimumSalary,
  };
}

export function parseStoredBoardFilters(raw: string | null): BoardFilters {
  if (!raw) return { ...DEFAULT_BOARD_FILTERS };
  try {
    return validatedFilters(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_BOARD_FILTERS };
  }
}

function csv(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function hasBoardFilterParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return FILTER_QUERY_KEYS.some((key) => params.has(key));
}

export function parseBoardFilters(
  search: string,
  storedRaw: string | null = null,
): BoardFilters {
  const hasUrlState = hasBoardFilterParams(search);
  const stored = parseStoredBoardFilters(storedRaw);
  const base = hasUrlState
    ? {
        ...DEFAULT_BOARD_FILTERS,
        collection: stored.collection,
        stages: stored.stages,
        sort:
          stored.sort === "application-stage"
            ? stored.sort
            : DEFAULT_BOARD_FILTERS.sort,
      }
    : stored;
  const params = new URLSearchParams(search);
  if (!hasUrlState) return base;

  const rawLocations = csv(params.get("locations"));
  const requestedSort = params.get("sort");
  return validatedFilters({
    ...base,
    tab: params.get("tab") === "new-grad" ? "new_grad" : "internship",
    query: params.get("q") ?? "",
    major: params.get("major") ?? "all",
    niche: params.get("niche") ?? "all",
    locationIds: rawLocations,
    locationOrder: params.get("location-order") === "az" ? "alphabetical" : "popular",
    freshness: params.get("freshness") ?? "all",
    sort:
      requestedSort && requestedSort !== "application-stage"
        ? requestedSort
        : base.sort,
    remoteOnly: params.get("remote") === "1",
    visaSponsorship: params.get("visa") === "1",
    minimumSalary: params.get("min-salary") ?? "any",
  });
}

export function serializeBoardFilters(filters: BoardFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.tab === "new_grad") params.set("tab", "new-grad");
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.major !== "all") params.set("major", filters.major);
  if (filters.niche !== "all") params.set("niche", filters.niche);
  if (filters.locationIds.length) params.set("locations", filters.locationIds.join(","));
  if (filters.locationOrder === "alphabetical") params.set("location-order", "az");
  if (filters.freshness !== "all") params.set("freshness", filters.freshness);
  if (filters.sort !== "featured" && filters.sort !== "application-stage") {
    params.set("sort", filters.sort);
  }
  if (filters.remoteOnly) params.set("remote", "1");
  if (filters.visaSponsorship) params.set("visa", "1");
  if (filters.minimumSalary !== "any") {
    params.set("min-salary", filters.minimumSalary);
  }
  return params;
}

/**
 * A deterministic, share-safe jobs URL. Tracker stages and saved-only state
 * stay in browser storage and can never enter this public URL.
 */
export function publicBoardUrl(
  filters: BoardFilters,
  pathname = "/jobs",
): string {
  const shareSafeFilters = {
    ...filters,
    locationIds: [...filters.locationIds].sort(),
    collection: DEFAULT_BOARD_FILTERS.collection,
    stages: [],
    sort:
      filters.sort === "application-stage"
        ? DEFAULT_BOARD_FILTERS.sort
        : filters.sort,
  };
  const query = serializeBoardFilters(shareSafeFilters).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Normalizes an untrusted saved or shared URL to Timley's public job-filter
 * allowlist. Unknown parameters, fragments, and private tracker filters drop.
 */
export function normalizePublicJobsUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://timley.local");
    if (
      url.origin !== "https://timley.local" ||
      url.pathname !== "/jobs" ||
      url.hash
    ) {
      return null;
    }
    const filters = parseBoardFilters(url.search);
    return publicBoardUrl(filters);
  } catch {
    return null;
  }
}

export function boardUrl(
  pathname: string,
  currentSearch: string,
  filters: BoardFilters,
): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of FILTER_QUERY_KEYS) params.delete(key);
  const next = serializeBoardFilters(filters);
  next.forEach((value, key) => params.set(key, value));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function activeFilterCount(filters: BoardFilters): number {
  return (
    (filters.major !== "all" || filters.niche !== "all" ? 1 : 0) +
    filters.locationIds.length +
    (filters.freshness !== "all" ? 1 : 0) +
    (filters.collection !== "all" ? 1 : 0) +
    (filters.sort !== "featured" ? 1 : 0) +
    filters.stages.length +
    (filters.remoteOnly ? 1 : 0) +
    (filters.visaSponsorship ? 1 : 0) +
    (filters.minimumSalary !== "any" ? 1 : 0)
  );
}

export function publicBoardFilterCount(filters: BoardFilters): number {
  return (
    (filters.tab !== DEFAULT_BOARD_FILTERS.tab ? 1 : 0) +
    (filters.query.trim() ? 1 : 0) +
    (filters.major !== "all" || filters.niche !== "all" ? 1 : 0) +
    filters.locationIds.length +
    (filters.locationOrder !== DEFAULT_BOARD_FILTERS.locationOrder ? 1 : 0) +
    (filters.freshness !== "all" ? 1 : 0) +
    (filters.sort !== "featured" && filters.sort !== "application-stage"
      ? 1
      : 0) +
    (filters.remoteOnly ? 1 : 0) +
    (filters.visaSponsorship ? 1 : 0) +
    (filters.minimumSalary !== "any" ? 1 : 0)
  );
}

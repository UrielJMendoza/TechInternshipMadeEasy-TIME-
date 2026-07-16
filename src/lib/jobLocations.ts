import {
  getSafeUsLocationParts,
  getUsLocationDisplay,
  isUsRemoteLocation,
  normalizeLocationText,
  type UsLocationSanitizationOptions,
} from "./usLocations.ts";

export { getUsLocationDisplay, normalizeLocationText } from "./usLocations.ts";

export const DENVER_LOCATION_ID = "denver-co" as const;

export const PHYSICAL_LOCATION_IDS = [
  DENVER_LOCATION_ID,
  "new-york-ny",
  "san-francisco-bay-area",
  "seattle-wa",
  "austin-tx",
  "chicago-il",
  "boston-ma",
  "los-angeles-ca",
  "washington-dc",
  "dallas-tx",
  "atlanta-ga",
] as const;

export type CanonicalPhysicalLocationFacetId =
  (typeof PHYSICAL_LOCATION_IDS)[number];
export type FallbackPhysicalLocationFacetId = `place:${string}`;
export type PhysicalLocationFacetId =
  | CanonicalPhysicalLocationFacetId
  | FallbackPhysicalLocationFacetId;
export type LocationFacetOrder = "popular" | "alphabetical";

export interface PhysicalLocationFacet {
  id: PhysicalLocationFacetId;
  label: string;
  pinned: boolean;
}

export interface LocationFacetOption extends PhysicalLocationFacet {
  count: number;
  disabled: boolean;
}

interface LocationFacetConfig extends PhysicalLocationFacet {
  id: CanonicalPhysicalLocationFacetId;
  patterns: readonly RegExp[];
}

const LOCATION_FACET_CONFIG: readonly LocationFacetConfig[] = [
  {
    id: DENVER_LOCATION_ID,
    label: "Denver, CO",
    pinned: true,
    patterns: [
      /\bdenver\b/,
      /\b(?:aurora|lakewood|arvada|broomfield|centennial|englewood|golden|greenwood village|littleton|lone tree|thornton|westminster|boulder)\s+(?:co|colorado)\b/,
    ],
  },
  {
    id: "new-york-ny",
    label: "New York, NY",
    pinned: false,
    patterns: [/\b(?:new york(?: city)?|nyc|manhattan|brooklyn|queens|bronx)\b/],
  },
  {
    id: "san-francisco-bay-area",
    label: "San Francisco Bay Area",
    pinned: false,
    patterns: [
      /\b(?:san francisco|sf|bay area|oakland|berkeley|san jose|mountain view|palo alto|sunnyvale|santa clara|cupertino|redwood city|menlo park)\b/,
    ],
  },
  {
    id: "seattle-wa",
    label: "Seattle, WA",
    pinned: false,
    patterns: [
      /\bseattle\b/,
      /\b(?:bellevue|redmond|kirkland)\s+(?:wa|washington)\b/,
    ],
  },
  {
    id: "austin-tx",
    label: "Austin, TX",
    pinned: false,
    patterns: [/\baustin\b/, /\bround rock\s+(?:tx|texas)\b/],
  },
  {
    id: "chicago-il",
    label: "Chicago, IL",
    pinned: false,
    patterns: [/\bchicago\b/],
  },
  {
    id: "boston-ma",
    label: "Boston, MA",
    pinned: false,
    patterns: [/\bboston\b/, /\bcambridge\s+(?:ma|massachusetts)\b/],
  },
  {
    id: "los-angeles-ca",
    label: "Los Angeles, CA",
    pinned: false,
    patterns: [
      /\blos angeles\b/,
      /\b(?:santa monica|culver city|long beach)\s+(?:ca|california)\b/,
    ],
  },
  {
    id: "washington-dc",
    label: "Washington, DC",
    pinned: false,
    patterns: [
      /\bwashington\s+(?:dc|district of columbia)\b/,
      /\bdistrict of columbia\b/,
      /\b(?:arlington|mclean)\s+(?:va|virginia)\b/,
      /\bbethesda\s+(?:md|maryland)\b/,
    ],
  },
  {
    id: "dallas-tx",
    label: "Dallas, TX",
    pinned: false,
    patterns: [
      /\b(?:dallas|fort worth)\b/,
      /\b(?:plano|irving)\s+(?:tx|texas)\b/,
    ],
  },
  {
    id: "atlanta-ga",
    label: "Atlanta, GA",
    pinned: false,
    patterns: [/\batlanta\b/],
  },
];

export const PHYSICAL_LOCATION_FACETS: readonly PhysicalLocationFacet[] =
  LOCATION_FACET_CONFIG.map(({ id, label, pinned }) => ({ id, label, pinned }));

export interface LocationLike {
  location?: string | null;
  country_code?: string | null;
}

const canonicalIds = new Set<string>(PHYSICAL_LOCATION_IDS);

export function isPhysicalLocationFacetId(
  value: string,
): value is PhysicalLocationFacetId {
  return (
    canonicalIds.has(value) ||
    /^place:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

/** Only explicit remote language qualifies; hybrid alone does not. */
export function isRemoteLocation(
  location: string | null | undefined,
  options: UsLocationSanitizationOptions = {},
): boolean {
  return isUsRemoteLocation(location, options);
}

function locationParts(location: string | null | undefined): string[] {
  return getSafeUsLocationParts(location);
}

function canonicalIdsForPart(
  part: string,
): CanonicalPhysicalLocationFacetId[] {
  const normalized = normalizeLocationText(part);
  return LOCATION_FACET_CONFIG.filter((facet) =>
    facet.patterns.some((pattern) => pattern.test(normalized)),
  ).map((facet) => facet.id);
}

function fallbackLocationId(
  part: string,
): FallbackPhysicalLocationFacetId | null {
  const normalized = normalizeLocationText(part);
  if (
    !normalized ||
    isRemoteLocation(part) ||
    /^(?:united states|usa|us|multiple locations|various locations|nationwide)$/.test(
      normalized,
    )
  ) {
    return null;
  }
  const slug = normalized.replace(/\s+/g, "-");
  return slug ? `place:${slug}` : null;
}

/** Return every canonical physical market represented by a multi-location job. */
export function getJobLocationFacetIds(
  location: string | null | undefined,
): PhysicalLocationFacetId[] {
  const ids = new Set<PhysicalLocationFacetId>();
  for (const part of locationParts(location)) {
    const canonical = canonicalIdsForPart(part);
    if (canonical.length > 0) {
      canonical.forEach((id) => ids.add(id));
      continue;
    }
    const fallback = fallbackLocationId(part);
    if (fallback) ids.add(fallback);
  }
  return [...ids];
}

/** Display-safe location plus canonical labels, normalized for job search. */
export function getJobLocationSearchText(location: string | null | undefined): string {
  const raw = normalizeLocationText(getUsLocationDisplay(location));
  const labels = getJobLocationFacetIds(location).map((id) => {
    const facet = LOCATION_FACET_CONFIG.find((candidate) => candidate.id === id);
    return normalizeLocationText(facet?.label);
  });
  return [...new Set([raw, ...labels].filter(Boolean))].join(" ");
}

/** Empty selection matches all; otherwise physical markets use OR semantics. */
export function matchesPhysicalLocationSelection(
  location: string | null | undefined,
  selectedIds: Iterable<PhysicalLocationFacetId>,
): boolean {
  const selected = new Set(selectedIds);
  if (selected.size === 0) return true;
  return getJobLocationFacetIds(location).some((id) => selected.has(id));
}

export function getLocationFacetCounts(
  jobs: readonly LocationLike[],
): Record<string, number> {
  const counts = Object.fromEntries(
    PHYSICAL_LOCATION_IDS.map((id) => [id, 0]),
  ) as Record<string, number>;

  for (const job of jobs) {
    // getJobLocationFacetIds is unique by construction, so aliases within one
    // job (e.g. "Denver; Aurora, CO") never double-count that listing.
    for (const id of getJobLocationFacetIds(job.location)) {
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  return counts;
}

export function countRemoteJobs(jobs: readonly LocationLike[]): number {
  return jobs.reduce(
    (count, job) =>
      count +
      Number(
        isRemoteLocation(job.location, {
          allowAmbiguousRemote: job.country_code === "US",
        }),
      ),
    0,
  );
}

/**
 * Denver is always first and remains visible (disabled at zero). Other markets
 * only appear when backed by at least one job, then follow the selected order.
 */
export function buildLocationFacetOptions(
  jobs: readonly LocationLike[],
  order: LocationFacetOrder = "popular",
): LocationFacetOption[] {
  const counts = getLocationFacetCounts(jobs);
  const canonicalOptions = PHYSICAL_LOCATION_FACETS
    .filter((facet) => facet.id === DENVER_LOCATION_ID || counts[facet.id] > 0)
    .map((facet) => ({
      ...facet,
      count: counts[facet.id],
      disabled: counts[facet.id] === 0,
    }));

  const fallbackLabels = new Map<FallbackPhysicalLocationFacetId, string>();
  for (const job of jobs) {
    for (const part of locationParts(job.location)) {
      if (canonicalIdsForPart(part).length > 0) continue;
      const id = fallbackLocationId(part);
      if (id && !fallbackLabels.has(id)) fallbackLabels.set(id, part);
    }
  }
  // Keep the former popular-location discoverability while canonical markets
  // collapse common aliases. The top 20 remaining places are stable across
  // Popular/A–Z display order, so switching order never changes the option set.
  const fallbackOptions: LocationFacetOption[] = [...fallbackLabels.entries()]
    .map(([id, label]) => ({
      id,
      label,
      pinned: false,
      count: counts[id] ?? 0,
      disabled: false,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 20);

  const options = [...canonicalOptions, ...fallbackOptions];

  return options.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (order === "popular" && a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

/** Build the same location menu from server-side facet counts, without jobs. */
export function buildLocationFacetOptionsFromCounts(
  facetCounts: readonly { id: string; count: number }[],
  order: LocationFacetOrder = "popular",
): LocationFacetOption[] {
  const counts = new Map(facetCounts.map((facet) => [facet.id, facet.count]));
  const canonicalOptions = PHYSICAL_LOCATION_FACETS
    .filter((facet) => facet.id === DENVER_LOCATION_ID || (counts.get(facet.id) ?? 0) > 0)
    .map((facet) => ({
      ...facet,
      count: counts.get(facet.id) ?? 0,
      disabled: (counts.get(facet.id) ?? 0) === 0,
    }));
  const fallbackOptions = facetCounts
    .filter((facet): facet is { id: FallbackPhysicalLocationFacetId; count: number } =>
      facet.id.startsWith("place:"),
    )
    .map((facet) => ({
      id: facet.id,
      label: facet.id
        .slice("place:".length)
        .split("-")
        .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
        .join(" "),
      pinned: false,
      count: facet.count,
      disabled: facet.count === 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 20);

  return [...canonicalOptions, ...fallbackOptions].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (order === "popular" && a.count !== b.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

export function getPrimaryLocationLabel(
  location: string | null | undefined,
): string {
  const firstId = getJobLocationFacetIds(location)[0];
  const canonical = LOCATION_FACET_CONFIG.find((facet) => facet.id === firstId);
  return canonical?.label ?? locationParts(location)[0] ?? "";
}

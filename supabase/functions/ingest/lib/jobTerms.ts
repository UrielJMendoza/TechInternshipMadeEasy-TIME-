export const UNKNOWN_TERM_KEY = "not-listed" as const;

export type InternshipTermSeason = "winter" | "spring" | "summer" | "fall";
type ExplicitInternshipTermKey = `${InternshipTermSeason}-${number}`;
export type InternshipTermKey =
  | ExplicitInternshipTermKey
  | typeof UNKNOWN_TERM_KEY;
export type TermFacetId = InternshipTermKey;

export interface TermFacetOption {
  id: TermFacetId;
  label: string;
  count: number;
}

interface FacetCount {
  id: string;
  count: number;
}

const TERM_KEY_PATTERN = /^(winter|spring|summer|fall)-(20\d{2})$/;
const SEASON_PATTERN = "winter|spring|summer|fall|autumn";
const SEASON_ORDER: Record<InternshipTermSeason, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
};

function normalizedSeason(value: string): InternshipTermSeason {
  return value.toLowerCase() === "autumn"
    ? "fall"
    : value.toLowerCase() as InternshipTermSeason;
}

function termKey(
  season: string,
  year: string,
): ExplicitInternshipTermKey {
  return `${normalizedSeason(season)}-${year}` as ExplicitInternshipTermKey;
}

function normalizedEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[()[\]{}_,:;\u2013\u2014-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isInternshipTermKey(
  value: unknown,
): value is InternshipTermKey {
  return value === UNKNOWN_TERM_KEY || (
    typeof value === "string" && TERM_KEY_PATTERN.test(value)
  );
}

export function termLabelFromKey(key: TermFacetId): string {
  if (key === UNKNOWN_TERM_KEY) return "Term not listed";
  const match = TERM_KEY_PATTERN.exec(key);
  if (!match) return "Term not listed";
  const season = `${match[1][0].toUpperCase()}${match[1].slice(1)}`;
  return `${season} ${match[2]}`;
}

export function sortTermKeys(
  values: readonly InternshipTermKey[],
): InternshipTermKey[] {
  return [...new Set(values.filter(isInternshipTermKey))].sort((left, right) => {
    if (left === UNKNOWN_TERM_KEY) return right === UNKNOWN_TERM_KEY ? 0 : 1;
    if (right === UNKNOWN_TERM_KEY) return -1;
    const leftMatch = TERM_KEY_PATTERN.exec(left);
    const rightMatch = TERM_KEY_PATTERN.exec(right);
    if (!leftMatch || !rightMatch) return left.localeCompare(right);
    return (
      Number(leftMatch[2]) - Number(rightMatch[2]) ||
      SEASON_ORDER[leftMatch[1] as InternshipTermSeason] -
        SEASON_ORDER[rightMatch[1] as InternshipTermSeason]
    );
  });
}

/**
 * Extract only terms whose season and four-digit year are both explicit.
 * Posting dates, bare years, and bare season names are intentionally ignored.
 */
export function termKeysFromValues(
  values: readonly string[],
): InternshipTermKey[] {
  const keys: InternshipTermKey[] = [];

  for (const rawValue of values) {
    if (!rawValue) continue;
    const value = normalizedEvidence(rawValue.slice(0, 10_000));

    // A shared year applies to every explicitly named term in forms such as
    // "Summer/Fall 2026" or "Fall and Winter 2027".
    const sharedYearPattern = new RegExp(
      `\\b((?:${SEASON_PATTERN})(?:\\s*(?:/|&|and)\\s*(?:${SEASON_PATTERN}))+)[ ]+(20\\d{2})\\b`,
      "gi",
    );
    for (const match of value.matchAll(sharedYearPattern)) {
      const year = match[2];
      for (const season of match[1].matchAll(
        new RegExp(`\\b(${SEASON_PATTERN})\\b`, "gi"),
      )) {
        keys.push(termKey(season[1], year));
      }
    }

    // Explicit season then year, optionally separated by a term word. This
    // accepts "Summer Intern 2027" without treating a bare "Intern 2027" as
    // evidence for Summer.
    const seasonThenYearPattern = new RegExp(
      `\\b(${SEASON_PATTERN})[ ]+(?:(?:intern(?:ship)?|co[ ]*op|term|semester)[ ]+)?(20\\d{2})\\b`,
      "gi",
    );
    for (const match of value.matchAll(seasonThenYearPattern)) {
      keys.push(termKey(match[1], match[2]));
    }

    // Explicit inverse form, for example "2026 Fall".
    const yearThenSeasonPattern = new RegExp(
      `\\b(20\\d{2})[ ]+(${SEASON_PATTERN})\\b`,
      "gi",
    );
    for (const match of value.matchAll(yearThenSeasonPattern)) {
      keys.push(termKey(match[2], match[1]));
    }
  }

  return sortTermKeys(keys);
}

export function buildTermFacetOptions(
  facetCounts: readonly FacetCount[],
): TermFacetOption[] {
  const counts = new Map<TermFacetId, number>();
  for (const facet of facetCounts) {
    const id = facet.id === UNKNOWN_TERM_KEY
      ? UNKNOWN_TERM_KEY
      : isInternshipTermKey(facet.id)
        ? facet.id
        : null;
    if (!id) continue;
    const count = Number.isFinite(facet.count)
      ? Math.max(0, Math.floor(facet.count))
      : 0;
    counts.set(id, (counts.get(id) ?? 0) + count);
  }

  const termIds = sortTermKeys(
    [...counts.keys()].filter((id) => id !== UNKNOWN_TERM_KEY),
  );
  const ids: TermFacetId[] = counts.has(UNKNOWN_TERM_KEY)
    ? [...termIds, UNKNOWN_TERM_KEY]
    : termIds;

  return ids.map((id) => ({
    id,
    label: termLabelFromKey(id),
    count: counts.get(id) ?? 0,
  }));
}

export function matchesTermFilter(
  jobTerms: readonly InternshipTermKey[],
  selected: readonly InternshipTermKey[],
): boolean {
  if (selected.length === 0) return true;
  const explicitTerms = jobTerms.filter((key) => key !== UNKNOWN_TERM_KEY);
  return selected.some((key) =>
    key === UNKNOWN_TERM_KEY
      ? explicitTerms.length === 0
      : explicitTerms.includes(key),
  );
}

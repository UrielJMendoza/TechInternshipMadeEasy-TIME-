export const FOLLOWED_COMPANIES_STORAGE_KEY =
  "timley:followed-companies:v1";
export const FOLLOWED_COMPANIES_EVENT = "timley:followed-companies-change";
export const MAX_FOLLOWED_COMPANIES = 200;

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface FollowedCompaniesEnvelope {
  version: 1;
  slugs: string[];
}

export function parseFollowedCompanies(raw: string | null): string[] {
  if (!raw || raw.length > 20_000) return [];
  try {
    const value = JSON.parse(raw) as Partial<FollowedCompaniesEnvelope>;
    if (value.version !== 1 || !Array.isArray(value.slugs)) return [];
    return [
      ...new Set(
        value.slugs.filter(
          (slug): slug is string =>
            typeof slug === "string" &&
            slug.length <= 96 &&
            SAFE_SLUG.test(slug),
        ),
      ),
    ]
      .sort()
      .slice(0, MAX_FOLLOWED_COMPANIES);
  } catch {
    return [];
  }
}

export function serializeFollowedCompanies(slugs: readonly string[]): string {
  const safe = [
    ...new Set(
      slugs.filter(
        (slug) =>
          slug.length <= 96 &&
          SAFE_SLUG.test(slug),
      ),
    ),
  ]
    .sort()
    .slice(0, MAX_FOLLOWED_COMPANIES);
  return JSON.stringify({ version: 1, slugs: safe });
}

export function toggleFollowedCompany(
  current: readonly string[],
  slug: string,
): string[] {
  if (!SAFE_SLUG.test(slug) || slug.length > 96) return [...current];
  const next = new Set(current);
  if (next.has(slug)) next.delete(slug);
  else if (next.size < MAX_FOLLOWED_COMPANIES) next.add(slug);
  return [...next].sort();
}

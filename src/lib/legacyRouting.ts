import {
  PRIVATE_BOARD_FILTER_QUERY_KEYS,
  hasBoardFilterParams,
} from "./boardFilterState";

/**
 * Maps legacy root-level board URLs to the dedicated jobs route.
 *
 * Unrelated attribution parameters survive the redirect, but legacy saved-only
 * and application-stage filters are deliberately removed from the public URL.
 */
export function getLegacyJobsRedirect(
  pathname: string,
  search: string,
): string | null {
  if (pathname !== "/" || !hasBoardFilterParams(search)) return null;

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  for (const key of PRIVATE_BOARD_FILTER_QUERY_KEYS) params.delete(key);
  const query = params.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

import {
  PUBLIC_JOBS_FEED_PATH,
  parsePublicJobsFeed,
  type PublicJobsFeedSnapshot,
} from "@/lib/publicJobsFeed";

export const PUBLIC_JOBS_FEED_MEMORY_CACHE_MS = 300_000;

export interface PublicJobsFeedCacheEntry {
  data: PublicJobsFeedSnapshot;
  receivedAt: number;
}

export interface PublicJobsFeedActivationState {
  activation: number;
  data: PublicJobsFeedSnapshot | null;
  error: Error | null;
  isValidating: boolean;
}

export interface PublicJobsFeedActivation {
  enabled: boolean;
  generation: number;
}

export function isCurrentPublicJobsFeedActivation(
  current: PublicJobsFeedActivation,
  generation: number,
): boolean {
  return current.enabled && current.generation === generation;
}

/** Every disabled/enabled transition discards hook-local data before loading. */
export function beginPublicJobsFeedActivation(
  enabled: boolean,
  activation: number,
): PublicJobsFeedActivationState {
  return {
    activation,
    data: null,
    error: null,
    isValidating: enabled,
  };
}

interface LoadPublicJobsFeedOptions {
  bypassMemoryCache?: boolean;
  fetcher?: typeof fetch;
  now?: () => number;
}

let cachedEntry: PublicJobsFeedCacheEntry | null = null;
let inFlight: Promise<PublicJobsFeedCacheEntry> | null = null;

/**
 * Load one public, same-origin resource. Bypassing the short memory cache still
 * leaves the browser and Vercel CDN in charge of normal HTTP revalidation.
 */
export async function loadPublicJobsFeed({
  bypassMemoryCache = false,
  fetcher = fetch,
  now = Date.now,
}: LoadPublicJobsFeedOptions = {}): Promise<PublicJobsFeedCacheEntry> {
  if (
    !bypassMemoryCache &&
    cachedEntry &&
    now() - cachedEntry.receivedAt < PUBLIC_JOBS_FEED_MEMORY_CACHE_MS
  ) {
    return cachedEntry;
  }
  if (inFlight) return inFlight;

  const request = fetcher(PUBLIC_JOBS_FEED_PATH, {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "same-origin",
    cache: "default",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Public jobs feed request failed (${response.status})`);
      }
      return parsePublicJobsFeed(await response.json());
    })
    .then((data) => {
      const entry = { data, receivedAt: now() };
      cachedEntry = entry;
      return entry;
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = request;
  return request;
}

/** Test isolation for the module-level request dedupe and memory cache. */
export function resetPublicJobsFeedClientForTests(): void {
  cachedEntry = null;
  inFlight = null;
}

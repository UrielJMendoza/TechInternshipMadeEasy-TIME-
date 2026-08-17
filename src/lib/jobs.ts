import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import type { Internship } from "@/lib/types";
import { sanitizeUsLocation } from "@/lib/usLocations";

const PAGE_SIZE = 1000;
const MAX_LISTING_AGE_DAYS = 120;
const RECENTLY_CLOSED_DAYS = 90;
const JOB_COLUMNS =
  "id,title,company,location,category,role_type,season,salary,link,source,sponsorship,posted_date,first_seen_at,last_seen_at,last_verified_at,is_active,original_source,canonical_company,canonical_url,external_job_id,requisition_id,normalized_title,normalized_location,content_fingerprint,verification_status,expiration_status,closed_at,pay_evidence,sponsorship_status,sponsorship_source,sponsorship_confidence,duplicate_group,canonical_record_key";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const JOBS_CACHE_TAG = "timley-public-jobs";
const JOBS_CACHE_SECONDS = 86400;
const RELATED_QUERY_SIZE = 24;

interface ActiveJobsPage {
  jobs: Internship[];
  hasMore: boolean;
}

export interface JobsSnapshot {
  jobs: Internship[];
  updatedAt: string | null;
  generatedAt: string;
  loadError: boolean;
  partialData: boolean;
}

export interface PublicJobsSnapshot extends JobsSnapshot {
  recentlyClosedJobs: Internship[];
  historyLoadError: boolean;
}

export interface PublicJobResult {
  job: Internship | null;
  loadError: boolean;
}

async function loadActiveJobsPage(from: number): Promise<ActiveJobsPage> {
  const db = supabase();
  const cutoff = new Date(
    Date.now() - MAX_LISTING_AGE_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const { data, error } = await db
    .from("internships")
    .select(JOB_COLUMNS)
    .eq("is_active", true)
    .or(`posted_date.is.null,posted_date.gte.${cutoff}`)
    .order("first_seen_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  const rawJobs = (data ?? []) as Internship[];
  const jobs: Internship[] = [];
  for (const job of rawJobs) {
    if (
      job.expiration_status === "expired" ||
      job.expiration_status === "possibly-closed"
    ) {
      continue;
    }
    const location = sanitizeUsLocation(job.location);
    if (!location.eligible) continue;
    jobs.push({ ...job, location: location.display });
  }

  return { jobs, hasMore: rawJobs.length === PAGE_SIZE };
}

const loadCachedActiveJobsPage = unstable_cache(
  loadActiveJobsPage,
  ["timley-active-jobs-page-v1"],
  { tags: [JOBS_CACHE_TAG], revalidate: JOBS_CACHE_SECONDS },
);

async function fetchActiveJobs(): Promise<{
  jobs: Internship[];
  partialData: boolean;
}> {
  const rows: Internship[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await loadCachedActiveJobsPage(from);
    rows.push(...page.jobs);
    if (!page.hasMore) break;
  }

  return { jobs: rows, partialData: false };
}

async function fetchRecentlyClosedJobs(
  generatedAt: string,
): Promise<Internship[]> {
  const db = supabase();
  const rows: Internship[] = [];
  const closedSince = new Date(
    new Date(generatedAt).getTime() - RECENTLY_CLOSED_DAYS * 86_400_000,
  ).toISOString();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("internships")
      .select(JOB_COLUMNS)
      .eq("is_active", false)
      .gte("closed_at", closedSince)
      .order("closed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as Internship[];
    for (const job of page) {
      const location = sanitizeUsLocation(job.location);
      if (!location.eligible) continue;
      rows.push({ ...job, location: location.display });
    }
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function latestObservation(jobs: Internship[]): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const job of jobs) {
    const time = Date.parse(job.last_seen_at);
    if (!Number.isFinite(time) || time <= latestTime) continue;
    latest = job.last_seen_at;
    latestTime = time;
  }

  return latest;
}

async function loadJobsSnapshot(): Promise<JobsSnapshot> {
  const generatedAt = new Date().toISOString();
  const { jobs, partialData } = await fetchActiveJobs();
  return {
    jobs,
    updatedAt: latestObservation(jobs),
    generatedAt,
    loadError: false,
    partialData,
  };
}

export async function fetchJobsSnapshot(): Promise<JobsSnapshot> {
  // Let ISR regeneration fail if any page cannot be read. Next can keep
  // serving the previous complete route instead of caching an empty or
  // partial snapshot for the full revalidation window.
  return loadJobsSnapshot();
}

export async function fetchPublicJobsSnapshot(): Promise<PublicJobsSnapshot> {
  const snapshot = await fetchJobsSnapshot();
  try {
    const recentlyClosedJobs = await fetchRecentlyClosedJobs(
      snapshot.generatedAt,
    );
    return {
      ...snapshot,
      recentlyClosedJobs,
      historyLoadError: false,
    };
  } catch {
    return {
      ...snapshot,
      recentlyClosedJobs: [],
      historyLoadError: true,
    };
  }
}

async function loadPublicJobById(
  id: string,
): Promise<PublicJobResult> {
  const { data, error } = await supabase()
    .from("internships")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { job: null, loadError: false };

  const job = data as Internship;
  const location = sanitizeUsLocation(job.location);
  if (!location.eligible) return { job: null, loadError: false };
  return {
    job: { ...job, location: location.display },
    loadError: false,
  };
}

export async function fetchPublicJobById(
  id: string,
): Promise<PublicJobResult> {
  if (!UUID_PATTERN.test(id)) return { job: null, loadError: false };

  try {
    return await loadPublicJobById(id);
  } catch {
    return { job: null, loadError: true };
  }
}

async function loadRelatedJobsByCategory(
  category: Internship["category"],
): Promise<Internship[]> {
  const cutoff = new Date(
    Date.now() - MAX_LISTING_AGE_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase()
    .from("internships")
    .select(JOB_COLUMNS)
    .eq("is_active", true)
    .eq("category", category)
    .or(`posted_date.is.null,posted_date.gte.${cutoff}`)
    .order("first_seen_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(RELATED_QUERY_SIZE);

  if (error) throw new Error(error.message);

  const related: Internship[] = [];
  for (const candidate of (data ?? []) as Internship[]) {
    if (
      candidate.expiration_status === "expired" ||
      candidate.expiration_status === "possibly-closed"
    ) {
      continue;
    }
    const location = sanitizeUsLocation(candidate.location);
    if (!location.eligible) continue;
    related.push({ ...candidate, location: location.display });
  }
  return related;
}

const loadCachedRelatedJobsByCategory = unstable_cache(
  loadRelatedJobsByCategory,
  ["timley-related-jobs-by-category-v1"],
  { tags: [JOBS_CACHE_TAG], revalidate: JOBS_CACHE_SECONDS },
);

export async function fetchRelatedJobs(
  job: Internship,
  limit = 6,
): Promise<Internship[]> {
  try {
    return (await loadCachedRelatedJobsByCategory(job.category))
      .filter((candidate) => candidate.id !== job.id)
      .slice(0, limit);
  } catch {
    return [];
  }
}

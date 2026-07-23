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

async function fetchActiveJobs(
  generatedAt: string,
): Promise<{ jobs: Internship[]; partialData: boolean }> {
  const db = supabase();
  const rows: Internship[] = [];
  const cutoff = new Date(
    new Date(generatedAt).getTime() - MAX_LISTING_AGE_DAYS * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("internships")
      .select(JOB_COLUMNS)
      .eq("is_active", true)
      .or(`posted_date.is.null,posted_date.gte.${cutoff}`)
      .order("first_seen_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (rows.length > 0) {
        return { jobs: rows, partialData: true };
      }
      throw new Error(error.message);
    }

    const page = (data ?? []) as Internship[];
    for (const job of page) {
      if (
        job.expiration_status === "expired" ||
        job.expiration_status === "possibly-closed"
      ) {
        continue;
      }
      const location = sanitizeUsLocation(job.location);
      if (!location.eligible) continue;
      rows.push({ ...job, location: location.display });
    }
    if (page.length < PAGE_SIZE) break;
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

export async function fetchJobsSnapshot(): Promise<JobsSnapshot> {
  const generatedAt = new Date().toISOString();

  try {
    const { jobs, partialData } = await fetchActiveJobs(generatedAt);
    return {
      jobs,
      updatedAt: latestObservation(jobs),
      generatedAt,
      loadError: false,
      partialData,
    };
  } catch {
    return {
      jobs: [],
      updatedAt: null,
      generatedAt,
      loadError: true,
      partialData: false,
    };
  }
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

export async function fetchPublicJobById(
  id: string,
): Promise<PublicJobResult> {
  if (!UUID_PATTERN.test(id)) return { job: null, loadError: false };

  try {
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
  } catch {
    return { job: null, loadError: true };
  }
}

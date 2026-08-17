import type { Internship } from "@/lib/types";

function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Keep the client-side board feature-complete without serializing ingestion
 * bookkeeping and duplicated normalization fields across the RSC boundary.
 */
export function createBoardJob(job: Internship): Internship {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    category: job.category,
    role_type: job.role_type,
    season: job.season,
    salary: job.salary,
    link: job.link,
    source: job.source,
    sponsorship: job.sponsorship,
    posted_date: job.posted_date,
    first_seen_at: job.first_seen_at,
    last_seen_at: job.last_seen_at,
    is_active: job.is_active,
    ...(optionalText(job.last_verified_at)
      ? { last_verified_at: optionalText(job.last_verified_at) }
      : {}),
    ...(optionalText(job.canonical_url)
      ? { canonical_url: optionalText(job.canonical_url) }
      : {}),
    ...(optionalText(job.external_job_id)
      ? { external_job_id: optionalText(job.external_job_id) }
      : {}),
    ...(optionalText(job.requisition_id)
      ? { requisition_id: optionalText(job.requisition_id) }
      : {}),
    ...(job.verification_status
      ? { verification_status: job.verification_status }
      : {}),
    ...(optionalText(job.duplicate_group)
      ? { duplicate_group: optionalText(job.duplicate_group) }
      : {}),
  };
}

export function createBoardJobs(jobs: readonly Internship[]): Internship[] {
  return jobs.map(createBoardJob);
}

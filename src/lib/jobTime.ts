import type { Internship } from "@/lib/types";

export const HOT_DAYS = 3;
export const NEW_DAYS = 14;

export function postedTime(job: Internship): number {
  return job.posted_date
    ? new Date(`${job.posted_date}T00:00:00Z`).getTime()
    : new Date(job.first_seen_at).getTime();
}

export function daysAgo(job: Internship, now: number): number {
  return Math.max(0, Math.floor((now - postedTime(job)) / 86_400_000));
}

export function relativeJobAge(job: Internship, now: number): string {
  const days = daysAgo(job, now);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function relativeTimestamp(iso: string, now: number): string {
  const minutes = Math.max(
    0,
    Math.round((now - new Date(iso).getTime()) / 60_000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

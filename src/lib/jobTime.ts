import type { Internship } from "@/lib/types";

export const HOT_DAYS = 3;
export const NEW_DAYS = 14;
export const FUTURE_POSTING_SKEW_MS = 86_400_000;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a source posting date only when it is a real ISO calendar date and is
 * not implausibly far in the future. A one-day allowance covers sources whose
 * date boundary is ahead of the visitor or ingestion worker's clock.
 */
export function plausiblePostedTime(
  postedDate: string | null,
  now: number,
): number | null {
  if (!postedDate) return null;

  const match = ISO_DATE.exec(postedDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    time > now + FUTURE_POSTING_SKEW_MS
  ) {
    return null;
  }

  return time;
}

export function postedTime(job: Internship, now = Date.now()): number {
  const sourcePostedTime = plausiblePostedTime(job.posted_date, now);
  if (sourcePostedTime !== null) return sourcePostedTime;

  const firstSeenTime = new Date(job.first_seen_at).getTime();
  return Number.isFinite(firstSeenTime) ? firstSeenTime : now;
}

export function daysAgo(job: Internship, now: number): number {
  return Math.max(0, Math.floor((now - postedTime(job, now)) / 86_400_000));
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

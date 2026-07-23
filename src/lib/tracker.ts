import {
  TRACKED_APPLICATION_STAGES,
  type ApplicationRecord,
  type ApplicationRecords,
  type TrackedApplicationStage,
} from "@/lib/applicationTracking";
import type { Internship } from "@/lib/types";

export const TRACKER_STAGE_FILTERS = [
  "all",
  ...TRACKED_APPLICATION_STAGES,
] as const;

export type TrackerStageFilter = (typeof TRACKER_STAGE_FILTERS)[number];

export const TRACKER_ACTION_FILTERS = [
  "all",
  "overdue",
  "next-7-days",
  "no-date",
] as const;

export type TrackerActionFilter = (typeof TRACKER_ACTION_FILTERS)[number];

export const TRACKER_SORT_OPTIONS = [
  "updated-desc",
  "next-action",
  "company",
  "stage",
  "saved-desc",
  "applied-desc",
] as const;

export type TrackerSort = (typeof TRACKER_SORT_OPTIONS)[number];

export interface TrackerRow {
  jobKey: string;
  job: Internship | null;
  record: ApplicationRecord;
  listingStatus: "active" | "not-in-active-feed";
  jobTitle: string;
  company: string;
  locationArrangement: string;
  applicationUrl: string;
}

export interface TrackerSummary {
  total: number;
  activeListings: number;
  notInActiveFeed: number;
  overdue: number;
  nextSevenDays: number;
  byStage: Record<TrackedApplicationStage, number>;
}

export interface TrackerFilters {
  query: string;
  stage: TrackerStageFilter;
  action: TrackerActionFilter;
  sort: TrackerSort;
  today?: string;
}

/**
 * Reconciles browser-owned application records with the latest active feed.
 * Rich v3 snapshots preserve useful context when a listing leaves the feed.
 */
export function joinTrackedApplications(
  jobs: readonly Internship[],
  records: ApplicationRecords,
): TrackerRow[] {
  const activeJobsByLink = new Map<string, Internship>();

  for (const job of jobs) {
    if (job.is_active === false) continue;
    for (const link of [job.link, job.canonical_url]) {
      if (link && !activeJobsByLink.has(link)) activeJobsByLink.set(link, job);
    }
  }

  return Object.entries(records).map(([jobKey, record]): TrackerRow => {
    const applicationUrl = record.applicationUrl || jobKey;
    const job =
      activeJobsByLink.get(jobKey) ??
      activeJobsByLink.get(applicationUrl) ??
      null;

    return {
      jobKey,
      job,
      record,
      listingStatus: job ? "active" : "not-in-active-feed",
      jobTitle: record.jobTitle || job?.title || "Saved application",
      company:
        record.company ||
        job?.company ||
        listingHostname(applicationUrl || jobKey),
      locationArrangement:
        record.locationArrangement ||
        job?.location ||
        "Location or work arrangement not added",
      applicationUrl,
    };
  });
}

export function filterTrackerRows(
  rows: readonly TrackerRow[],
  {
    query,
    stage,
    action,
    sort,
    today = localDateKey(new Date()),
  }: TrackerFilters,
): TrackerRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const nextWeek = addDays(today, 7);

  const filtered = rows.filter((row) => {
    if (stage !== "all" && row.record.stage !== stage) return false;

    const actionDate = row.record.nextActionAt;
    if (action === "overdue" && (!actionDate || actionDate >= today)) {
      return false;
    }
    if (
      action === "next-7-days" &&
      (!actionDate || actionDate < today || actionDate > nextWeek)
    ) {
      return false;
    }
    if (action === "no-date" && actionDate) return false;

    if (!normalizedQuery) return true;
    const searchable = [
      row.company,
      row.jobTitle,
      row.locationArrangement,
      row.applicationUrl,
      row.record.nextAction ?? "",
      row.record.notes ?? "",
      row.record.contact ?? "",
      row.record.compensationNotes ?? "",
    ];
    return searchable.some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    );
  });

  return [...filtered].sort((a, b) => compareTrackerRows(a, b, sort));
}

export function summarizeTrackerRows(
  rows: readonly TrackerRow[],
  today = localDateKey(new Date()),
): TrackerSummary {
  const byStage = Object.fromEntries(
    TRACKED_APPLICATION_STAGES.map((stage) => [stage, 0]),
  ) as Record<TrackedApplicationStage, number>;
  const nextWeek = addDays(today, 7);

  let activeListings = 0;
  let overdue = 0;
  let nextSevenDays = 0;
  for (const row of rows) {
    byStage[row.record.stage] += 1;
    if (row.listingStatus === "active") activeListings += 1;

    const actionDate = row.record.nextActionAt;
    if (actionDate && actionDate < today) overdue += 1;
    if (actionDate && actionDate >= today && actionDate <= nextWeek) {
      nextSevenDays += 1;
    }
  }

  return {
    total: rows.length,
    activeListings,
    notInActiveFeed: rows.length - activeListings,
    overdue,
    nextSevenDays,
    byStage,
  };
}

export function listingHostname(jobKey: string): string {
  try {
    const url = new URL(jobKey);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Saved application";
    }
    return url.hostname.replace(/^www\./, "") || "Saved application";
  } catch {
    return "Saved application";
  }
}

export function safeListingHref(jobKey: string): string | null {
  try {
    const url = new URL(jobKey);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function compareTrackerRows(
  a: TrackerRow,
  b: TrackerRow,
  sort: TrackerSort,
): number {
  const updatedDifference =
    Date.parse(b.record.updatedAt) - Date.parse(a.record.updatedAt);
  const labelDifference =
    a.company.localeCompare(b.company) ||
    a.jobTitle.localeCompare(b.jobTitle);

  switch (sort) {
    case "next-action":
      return (
        compareOptionalDates(a.record.nextActionAt, b.record.nextActionAt) ||
        updatedDifference ||
        labelDifference
      );
    case "company":
      return labelDifference || updatedDifference;
    case "stage":
      return (
        TRACKED_APPLICATION_STAGES.indexOf(a.record.stage) -
          TRACKED_APPLICATION_STAGES.indexOf(b.record.stage) ||
        compareOptionalDates(a.record.nextActionAt, b.record.nextActionAt) ||
        labelDifference
      );
    case "saved-desc":
      return (
        compareOptionalDates(b.record.savedAt, a.record.savedAt) ||
        updatedDifference ||
        labelDifference
      );
    case "applied-desc":
      return (
        compareOptionalDates(b.record.appliedAt, a.record.appliedAt) ||
        updatedDifference ||
        labelDifference
      );
    case "updated-desc":
      return updatedDifference || labelDifference;
  }
}

function compareOptionalDates(
  a: string | undefined,
  b: string | undefined,
): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

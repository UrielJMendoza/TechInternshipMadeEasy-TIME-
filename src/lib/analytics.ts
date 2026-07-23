import type { ApplicationStage } from "@/lib/applicationTracking";
import type { Category, RoleType } from "@/lib/types";

export type AnalyticsSurface =
  | "job-board"
  | "job-detail"
  | "job-drawer"
  | "job-table"
  | "tracker"
  | "collection"
  | "company"
  | "campus";

export type CountBucket = "0" | "1" | "2-5" | "6-20" | "21-50" | "51+";

export interface AnalyticsEventDetail {
  event:
    | "search"
    | "filter"
    | "job_opened"
    | "apply_clicked"
    | "job_saved"
    | "stage_changed"
    | "search_saved"
    | "alert_enabled"
    | "collection_shared"
    | "tracker_revisited";
  [key: string]: string | number | boolean;
}

declare global {
  interface Window {
    dataLayer?: AnalyticsEventDetail[];
  }
}

export function countBucket(count: number): CountBucket {
  const safe = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (safe === 0) return "0";
  if (safe === 1) return "1";
  if (safe <= 5) return "2-5";
  if (safe <= 20) return "6-20";
  if (safe <= 50) return "21-50";
  return "51+";
}

export function queryLengthBucket(length: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(length) ? length : 0));
  if (safe === 0) return "0";
  if (safe <= 3) return "1-3";
  if (safe <= 10) return "4-10";
  if (safe <= 30) return "11-30";
  return "31+";
}

function emit(detail: AnalyticsEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AnalyticsEventDetail>("timley:analytics", { detail }),
  );
  window.dataLayer?.push(detail);
}

export function trackSearch(input: {
  roleType: RoleType;
  queryLength: number;
  resultCount: number;
}): void {
  emit({
    event: "search",
    role_type: input.roleType,
    query_length: queryLengthBucket(input.queryLength),
    result_count: countBucket(input.resultCount),
  });
}

export function trackFilter(input: {
  filter:
    | "role-type"
    | "taxonomy"
    | "location"
    | "remote"
    | "sponsorship"
    | "pay"
    | "freshness"
    | "sort"
    | "saved-only"
    | "application-stage";
  enabled: boolean;
  selectionCount: number;
}): void {
  emit({
    event: "filter",
    filter: input.filter,
    enabled: input.enabled,
    selection_count: countBucket(input.selectionCount),
  });
}

function trackPublicJobAction(
  event: "job_opened" | "apply_clicked" | "job_saved",
  input: {
    surface: AnalyticsSurface;
    roleType: RoleType;
    category: Category;
    saved?: boolean;
  },
): void {
  emit({
    event,
    surface: input.surface,
    role_type: input.roleType,
    category: input.category,
    ...(typeof input.saved === "boolean" ? { saved: input.saved } : {}),
  });
}

export function trackJobOpened(
  input: Parameters<typeof trackPublicJobAction>[1],
): void {
  trackPublicJobAction("job_opened", input);
}

export function trackApplyClicked(
  input: Parameters<typeof trackPublicJobAction>[1],
): void {
  trackPublicJobAction("apply_clicked", input);
}

export function trackJobSaved(
  input: Parameters<typeof trackPublicJobAction>[1] & { saved: boolean },
): void {
  trackPublicJobAction("job_saved", input);
}

export function trackStageChanged(input: {
  surface: AnalyticsSurface;
  from: ApplicationStage;
  to: ApplicationStage;
}): void {
  emit({
    event: "stage_changed",
    surface: input.surface,
    from_stage: input.from,
    to_stage: input.to,
  });
}

export function trackSearchSaved(input: {
  frequency: "instant" | "daily" | "weekly" | "paused";
  inApp: boolean;
  browser: boolean;
  publicFilterCount: number;
}): void {
  emit({
    event: "search_saved",
    frequency: input.frequency,
    in_app: input.inApp,
    browser: input.browser,
    public_filter_count: countBucket(input.publicFilterCount),
  });
}

export function trackAlertEnabled(input: {
  channel: "in-app" | "browser";
  enabled: boolean;
}): void {
  emit({
    event: "alert_enabled",
    channel: input.channel,
    enabled: input.enabled,
  });
}

export function trackCollectionShared(input: {
  method: "copy" | "native";
  kind: "filter" | "collection" | "company" | "campus";
  publicFilterCount?: number;
}): void {
  emit({
    event: "collection_shared",
    method: input.method,
    collection_kind: input.kind,
    public_filter_count: countBucket(input.publicFilterCount ?? 0),
  });
}

export function trackTrackerRevisited(recordCount: number): void {
  emit({
    event: "tracker_revisited",
    record_count: countBucket(recordCount),
  });
}

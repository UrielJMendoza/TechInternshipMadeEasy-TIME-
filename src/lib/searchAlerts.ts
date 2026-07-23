import {
  DEFAULT_BOARD_FILTERS,
  normalizePublicJobsUrl,
  publicBoardUrl,
  type BoardFilters,
} from "./boardFilterState";
import { annualSalary } from "./compensation";
import {
  matchesJobSearch,
  matchesVisaSponsorshipFilter,
} from "./jobFilters";
import {
  PHYSICAL_LOCATION_FACETS,
  isRemoteLocation,
  matchesPhysicalLocationSelection,
} from "./jobLocations";
import { HOT_DAYS, NEW_DAYS, daysAgo } from "./jobTime";
import { MAJORS_BY_ID } from "./jobTaxonomy";
import {
  parseSavedSearch,
  type SavedSearch,
  type SavedSearchFrequency,
} from "./savedSearches";
import type { Internship } from "./types";

export const SEARCH_ALERT_STORAGE_KEY = "timley:search-alerts:v1";
export const SEARCH_ALERT_STATE_VERSION = 1;
export const MAX_SEARCH_ALERT_INBOX = 200;
export const MAX_SEARCH_ALERT_DELIVERED_ROLE_IDS = 5_000;
export const MAX_SEARCH_ALERT_LAST_RUNS = 100;
export const MAX_NEW_SEARCH_ALERTS_PER_EVALUATION = 50;
export const MAX_SEARCH_ALERT_STORAGE_LENGTH = 2_000_000;

const DAY_MS = 86_400_000;
const MAX_ROLE_ID_LENGTH = 4_096;
const MAX_ALERT_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 80;
const MAX_JOB_TEXT_LENGTH = 500;
const MAX_REASON_LENGTH = 240;
const MAX_REASONS = 20;
const MAX_RESULTS_URL_LENGTH = 4_096;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const unsafeKeys = new Set(["__proto__", "constructor", "prototype"]);
const frequencies = new Set<SavedSearchFrequency>([
  "instant",
  "daily",
  "weekly",
  "paused",
]);

export interface SearchAlert {
  id: string;
  roleId: string;
  savedSearchId: string;
  savedSearchName: string;
  frequency: SavedSearchFrequency;
  jobTitle: string;
  company: string;
  location: string;
  resultsUrl: string;
  matchReasons: string[];
  createdAt: string;
  jobFirstSeenAt: string;
  jobPostedAt?: string;
  readAt?: string;
}

export interface SearchAlertState {
  version: typeof SEARCH_ALERT_STATE_VERSION;
  inbox: SearchAlert[];
  deliveredRoleIds: string[];
  lastRunBySearch: Record<string, string>;
}

export interface EvaluateSearchAlertsInput {
  state: SearchAlertState;
  searches: readonly SavedSearch[];
  jobs: readonly Internship[];
  browserDeliveryAvailable?: boolean;
  now?: string | Date | number;
}

export interface EvaluateSearchAlertsResult {
  state: SearchAlertState;
  newAlerts: SearchAlert[];
  ranSearchIds: string[];
}

interface MatchResult {
  reasons: string[];
}

export function createEmptySearchAlertState(): SearchAlertState {
  return {
    version: SEARCH_ALERT_STATE_VERSION,
    inbox: [],
    deliveredRoleIds: [],
    lastRunBySearch: {},
  };
}

/**
 * Parse an untrusted local snapshot. The version boundary is strict: corrupt,
 * oversized, or unknown versions safely become a fresh empty state.
 */
export function parseSearchAlertState(raw: string | null): SearchAlertState {
  if (!raw || raw.length > MAX_SEARCH_ALERT_STORAGE_LENGTH) {
    return createEmptySearchAlertState();
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return createEmptySearchAlertState();
  }
  if (!isRecord(value) || value.version !== SEARCH_ALERT_STATE_VERSION) {
    return createEmptySearchAlertState();
  }
  return normalizeState(value);
}

export function serializeSearchAlertState(state: SearchAlertState): string {
  return JSON.stringify(normalizeState(state));
}

/**
 * The stable public-role identity follows the trust pipeline's strongest
 * available identity before falling back to the current source link.
 */
export function getSearchAlertRoleId(job: Internship): string {
  for (const candidate of [
    job.canonical_record_key,
    job.canonical_url,
    job.id,
    job.link,
  ]) {
    if (
      typeof candidate === "string" &&
      candidate.trim().length > 0
    ) {
      return candidate.trim();
    }
  }
  return job.link;
}

/**
 * Evaluate due searches against the current public listing snapshot. This
 * function has no storage, notification, or network side effects.
 */
export function evaluateSearchAlerts({
  state,
  searches,
  jobs,
  browserDeliveryAvailable = false,
  now = new Date(),
}: EvaluateSearchAlertsInput): EvaluateSearchAlertsResult {
  const currentState = normalizeState(state);
  const nowMilliseconds = normalizeNow(now);
  const nowIso = new Date(nowMilliseconds).toISOString();
  const delivered = new Set(currentState.deliveredRoleIds);
  const lastRunBySearch = { ...currentState.lastRunBySearch };
  const ranSearchIds: string[] = [];
  const newAlerts: SearchAlert[] = [];
  const sortedJobs = [...jobs].sort(compareJobsForAlerts);

  for (const candidate of searches) {
    const search = parseSavedSearch(candidate);
    if (
      !search ||
      !hasSupportedLocalChannel(search) ||
      !canDeliverSearch(search, browserDeliveryAvailable) ||
      !frequencyIsDue(
        search.frequency,
        lastRunBySearch[search.id],
        nowMilliseconds,
      )
    ) {
      continue;
    }

    ranSearchIds.push(search.id);
    lastRunBySearch[search.id] = nowIso;
    if (newAlerts.length >= MAX_NEW_SEARCH_ALERTS_PER_EVALUATION) continue;

    for (const job of sortedJobs) {
      if (newAlerts.length >= MAX_NEW_SEARCH_ALERTS_PER_EVALUATION) break;
      const roleId = getSearchAlertRoleId(job);
      if (!validRoleId(roleId) || delivered.has(roleId)) continue;

      const match = matchPublicSearch(job, search.filters, nowMilliseconds);
      if (!match) continue;

      delivered.add(roleId);
      newAlerts.push(
        createAlert({
          roleId,
          search,
          job,
          nowIso,
          reasons: match.reasons,
        }),
      );
    }
  }

  const nextState = normalizeState({
    version: SEARCH_ALERT_STATE_VERSION,
    inbox: [...newAlerts, ...currentState.inbox],
    deliveredRoleIds: [
      ...newAlerts.map((alert) => alert.roleId),
      ...currentState.deliveredRoleIds,
    ],
    lastRunBySearch,
  });
  const newAlertIds = new Set(newAlerts.map((alert) => alert.id));

  return {
    state: nextState,
    newAlerts: nextState.inbox.filter((alert) => newAlertIds.has(alert.id)),
    ranSearchIds,
  };
}

function hasSupportedLocalChannel(search: SavedSearch): boolean {
  return search.channels.inApp || search.channels.browser;
}

function canDeliverSearch(
  search: SavedSearch,
  browserDeliveryAvailable: boolean,
): boolean {
  return (
    search.channels.inApp ||
    (search.channels.browser && browserDeliveryAvailable)
  );
}

function matchPublicSearch(
  job: Internship,
  filters: BoardFilters,
  now: number,
): MatchResult | null {
  if (job.is_active === false || job.role_type !== filters.tab) return null;
  if (!matchesJobSearch(job, filters.query)) return null;

  const major = MAJORS_BY_ID[filters.major] ?? MAJORS_BY_ID.all;
  if (!major.matches(job)) return null;
  const niche =
    major.niches.find((candidate) => candidate.id === filters.niche) ??
    major.niches[0];
  if (niche && !niche.matches(job)) return null;

  if (filters.remoteOnly) {
    if (!isRemoteLocation(job.location)) return null;
  } else if (
    !matchesPhysicalLocationSelection(job.location, filters.locationIds)
  ) {
    return null;
  }

  if (
    !matchesVisaSponsorshipFilter(
      job.sponsorship,
      filters.visaSponsorship,
    )
  ) {
    return null;
  }

  if (
    filters.minimumSalary !== "any" &&
    annualSalary(job.salary) < Number(filters.minimumSalary)
  ) {
    return null;
  }

  const age = daysAgo(job, now);
  if (filters.freshness === "hot" && age > HOT_DAYS) return null;
  if (filters.freshness === "new" && age > NEW_DAYS) return null;

  const reasons = [
    `Role type: ${filters.tab === "new_grad" ? "New grad" : "Internship"}`,
  ];
  const query = filters.query.trim();
  if (query) reasons.push(`Keywords: ${query}`);
  if (filters.remoteOnly) {
    reasons.push("Work arrangement: Remote");
  } else if (filters.locationIds.length > 0) {
    reasons.push(
      `Location: ${filters.locationIds.map(locationLabel).join(" or ")}`,
    );
  }
  if (filters.major !== "all") reasons.push(`Major: ${major.label}`);
  if (niche && niche.id !== "all") {
    reasons.push(`Specialization: ${niche.label}`);
  }
  if (filters.visaSponsorship) {
    reasons.push("Sponsorship: Explicitly offered");
  }
  if (filters.minimumSalary !== "any") {
    reasons.push(
      `Employer-listed pay: At least ${formatUsd(Number(filters.minimumSalary))} annually`,
    );
  }
  if (filters.freshness === "hot") {
    reasons.push(`Freshness: Added in the last ${HOT_DAYS} days`);
  } else if (filters.freshness === "new") {
    reasons.push(`Freshness: Added in the last ${NEW_DAYS} days`);
  }

  return { reasons };
}

function createAlert(input: {
  roleId: string;
  search: SavedSearch;
  job: Internship;
  nowIso: string;
  reasons: string[];
}): SearchAlert {
  const firstSeenAt =
    normalizeTimestamp(input.job.first_seen_at) ?? input.nowIso;
  const postedAt = normalizeDate(input.job.posted_date);
  return {
    id: `search-alert-${stableHash(input.roleId)}`,
    roleId: input.roleId,
    savedSearchId: input.search.id,
    savedSearchName: input.search.name,
    frequency: input.search.frequency,
    jobTitle: input.job.title,
    company: input.job.company,
    location: input.job.location || "Location unavailable",
    resultsUrl: savedSearchResultsUrl(input.search.filters),
    matchReasons: input.reasons,
    createdAt: input.nowIso,
    jobFirstSeenAt: firstSeenAt,
    ...(postedAt ? { jobPostedAt: postedAt } : {}),
  };
}

function savedSearchResultsUrl(filters: BoardFilters): string {
  // Sorting, the local saved set, and private application stages do not change
  // public alert eligibility and therefore do not belong in the alert link.
  const publicFilters: BoardFilters = {
    ...filters,
    locationOrder: DEFAULT_BOARD_FILTERS.locationOrder,
    collection: DEFAULT_BOARD_FILTERS.collection,
    sort: DEFAULT_BOARD_FILTERS.sort,
    stages: [],
  };
  return publicBoardUrl(publicFilters);
}

function frequencyIsDue(
  frequency: SavedSearchFrequency,
  lastRun: string | undefined,
  now: number,
): boolean {
  if (frequency === "paused") return false;
  if (frequency === "instant") return true;

  const lastRunMilliseconds = lastRun ? Date.parse(lastRun) : Number.NaN;
  if (!Number.isFinite(lastRunMilliseconds) || lastRunMilliseconds > now) {
    return true;
  }
  const interval = frequency === "daily" ? DAY_MS : DAY_MS * 7;
  return now - lastRunMilliseconds >= interval;
}

function normalizeState(value: unknown): SearchAlertState {
  if (!isRecord(value)) return createEmptySearchAlertState();

  const inboxCandidates = Array.isArray(value.inbox) ? value.inbox : [];
  const inboxByRole = new Map<string, SearchAlert>();
  for (const candidate of inboxCandidates) {
    const alert = normalizeAlert(candidate);
    if (!alert) continue;
    const existing = inboxByRole.get(alert.roleId);
    if (
      !existing ||
      Date.parse(alert.createdAt) > Date.parse(existing.createdAt) ||
      (alert.createdAt === existing.createdAt &&
        alert.id.localeCompare(existing.id) < 0)
    ) {
      inboxByRole.set(alert.roleId, alert);
    }
  }
  const inbox = [...inboxByRole.values()]
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, MAX_SEARCH_ALERT_INBOX);

  const deliveredRoleIds: string[] = [];
  const delivered = new Set<string>();
  const deliveredCandidates = Array.isArray(value.deliveredRoleIds)
    ? value.deliveredRoleIds
    : [];
  for (const candidate of [
    ...inbox.map((alert) => alert.roleId),
    ...deliveredCandidates,
  ]) {
    if (
      !validRoleId(candidate) ||
      delivered.has(candidate) ||
      deliveredRoleIds.length >= MAX_SEARCH_ALERT_DELIVERED_ROLE_IDS
    ) {
      continue;
    }
    delivered.add(candidate);
    deliveredRoleIds.push(candidate);
  }

  const validRuns: Array<[string, string]> = [];
  if (isRecord(value.lastRunBySearch)) {
    for (const [searchId, timestamp] of Object.entries(
      value.lastRunBySearch,
    )) {
      const id = normalizeSafeId(searchId);
      const normalizedTimestamp = normalizeTimestamp(timestamp);
      if (id && normalizedTimestamp) {
        validRuns.push([id, normalizedTimestamp]);
      }
    }
  }
  validRuns.sort(
    ([leftId, leftTime], [rightId, rightTime]) =>
      Date.parse(rightTime) - Date.parse(leftTime) ||
      leftId.localeCompare(rightId),
  );

  return {
    version: SEARCH_ALERT_STATE_VERSION,
    inbox,
    deliveredRoleIds,
    lastRunBySearch: Object.fromEntries(
      validRuns.slice(0, MAX_SEARCH_ALERT_LAST_RUNS),
    ),
  };
}

function normalizeAlert(value: unknown): SearchAlert | null {
  if (!isRecord(value)) return null;
  const id = normalizeSafeId(value.id, MAX_ALERT_ID_LENGTH);
  const roleId = validRoleId(value.roleId) ? value.roleId : null;
  const savedSearchId = normalizeSafeId(value.savedSearchId);
  const savedSearchName = normalizeText(value.savedSearchName, MAX_NAME_LENGTH);
  const frequency = frequencies.has(value.frequency as SavedSearchFrequency)
    ? (value.frequency as SavedSearchFrequency)
    : null;
  const jobTitle = normalizeText(value.jobTitle, MAX_JOB_TEXT_LENGTH);
  const company = normalizeText(value.company, MAX_JOB_TEXT_LENGTH);
  const location = normalizeText(value.location, MAX_JOB_TEXT_LENGTH);
  const resultsUrl = normalizeResultsUrl(value.resultsUrl);
  const createdAt = normalizeTimestamp(value.createdAt);
  const jobFirstSeenAt = normalizeTimestamp(value.jobFirstSeenAt);

  if (
    !id ||
    !roleId ||
    !savedSearchId ||
    !savedSearchName ||
    !frequency ||
    !jobTitle ||
    !company ||
    !location ||
    !resultsUrl ||
    !createdAt ||
    !jobFirstSeenAt ||
    !Array.isArray(value.matchReasons)
  ) {
    return null;
  }

  const matchReasons = value.matchReasons
    .map((reason) => normalizeText(reason, MAX_REASON_LENGTH))
    .filter((reason): reason is string => reason !== null)
    .slice(0, MAX_REASONS);
  if (matchReasons.length === 0) return null;

  const jobPostedAt = normalizeDate(value.jobPostedAt);
  const readAt = normalizeTimestamp(value.readAt);
  return {
    id,
    roleId,
    savedSearchId,
    savedSearchName,
    frequency,
    jobTitle,
    company,
    location,
    resultsUrl,
    matchReasons,
    createdAt,
    jobFirstSeenAt,
    ...(jobPostedAt ? { jobPostedAt } : {}),
    ...(readAt ? { readAt } : {}),
  };
}

function compareJobsForAlerts(left: Internship, right: Internship): number {
  return (
    Date.parse(right.first_seen_at) - Date.parse(left.first_seen_at) ||
    getSearchAlertRoleId(left).localeCompare(getSearchAlertRoleId(right))
  );
}

function locationLabel(id: string): string {
  const canonical = PHYSICAL_LOCATION_FACETS.find(
    (location) => location.id === id,
  );
  if (canonical) return canonical.label;
  return id
    .replace(/^place:/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeNow(value: string | Date | number): number {
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  try {
    return new Date(milliseconds).toISOString();
  } catch {
    return null;
  }
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const milliseconds = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const date = new Date(milliseconds);
  return date.toISOString().slice(0, 10) === value ? value : null;
}

function normalizeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (
    !text ||
    text.length > maximumLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  ) {
    return null;
  }
  return text;
}

function normalizeSafeId(
  value: unknown,
  maximumLength = MAX_ALERT_ID_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id.length <= maximumLength &&
    SAFE_ID_PATTERN.test(id) &&
    !unsafeKeys.has(id)
    ? id
    : null;
}

function validRoleId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ROLE_ID_LENGTH &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !unsafeKeys.has(value)
  );
}

function normalizeResultsUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > MAX_RESULTS_URL_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const url = new URL(value, "https://timley.local");
    if (
      url.origin !== "https://timley.local" ||
      url.pathname !== "/jobs" ||
      url.hash
    ) {
      return null;
    }
    return normalizePublicJobsUrl(`${url.pathname}${url.search}`);
  } catch {
    return null;
  }
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

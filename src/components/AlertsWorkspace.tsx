"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MobileFilterSheet } from "@/components/MobileFilterSheet";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import {
  APPLICATION_STAGE_LABELS,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import type { BoardFilters } from "@/lib/boardFilterState";
import { MINIMUM_SALARY_OPTIONS } from "@/lib/boardOptions";
import { PHYSICAL_LOCATION_FACETS } from "@/lib/jobLocations";
import { MAJORS_BY_ID } from "@/lib/jobTaxonomy";
import {
  SEARCH_ALERT_STORAGE_KEY,
  createEmptySearchAlertState,
  evaluateSearchAlerts,
  parseSearchAlertState,
  serializeSearchAlertState,
  type SearchAlert,
  type SearchAlertState,
} from "@/lib/searchAlerts";
import {
  MAX_SAVED_SEARCH_NAME_LENGTH,
  type SavedSearch,
  type SavedSearchChannels,
  type SavedSearchFrequency,
} from "@/lib/savedSearches";
import type { Internship } from "@/lib/types";

interface AlertsWorkspaceProps {
  jobs: Internship[];
  generatedAt: string;
  updatedAt: string | null;
  loadError: boolean;
  partialData: boolean;
}

interface AlertsWorkspaceViewProps extends AlertsWorkspaceProps {
  refreshJobs: () => void;
}

const BROWSER_ALERT_PREFERENCE_KEY =
  "timley:search-alerts:browser-enabled:v1";
const STATUS_MAX_LENGTH = 240;
const FOREGROUND_REFRESH_INTERVAL_MS = 300_000;
const REFRESH_COALESCE_MS = 250;
const MINIMUM_REFRESH_GAP_MS = 5_000;
const EMAIL_ALERTS_AVAILABLE = false;

const FREQUENCY_OPTIONS = [
  ["instant", "Instant"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["paused", "Paused"],
] as const satisfies ReadonlyArray<
  readonly [SavedSearchFrequency, string]
>;

const FREQUENCY_LABELS = Object.fromEntries(
  FREQUENCY_OPTIONS,
) as Record<SavedSearchFrequency, string>;

function boundedStatus(message: string): string {
  return message.trim().slice(0, STATUS_MAX_LENGTH);
}

function notificationCopy(alerts: readonly SearchAlert[]): {
  title: string;
  body: string;
  resultsUrl: string;
} | null {
  const first = alerts[0];
  if (!first) return null;
  const reason = first.matchReasons[0] ?? "Matched your saved search";
  const more =
    alerts.length > 1
      ? ` ${alerts.length - 1} more ${
          alerts.length - 1 === 1 ? "match is" : "matches are"
        } in delivery history.`
      : "";
  return {
    title:
      alerts.length === 1
        ? `New match · ${first.savedSearchName}`
        : `${alerts.length} new Timley matches`,
    body: boundedStatus(
      `${first.savedSearchName}: ${reason}. ${first.jobTitle} at ${first.company}.${more}`,
    ),
    resultsUrl: first.resultsUrl,
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function filterSummary(filters: BoardFilters): string[] {
  const summary = [
    filters.tab === "new_grad" ? "New-grad roles" : "Internships",
  ];
  const query = filters.query.trim();
  if (query) summary.push(`Keywords: ${query}`);

  if (filters.remoteOnly) {
    summary.push("Remote only");
  } else if (filters.locationIds.length > 0) {
    summary.push(
      `Locations: ${filters.locationIds.map(locationLabel).join(", ")}`,
    );
  }

  const major = MAJORS_BY_ID[filters.major];
  if (major && filters.major !== "all") {
    summary.push(`Major: ${major.label}`);
    const niche = major.niches.find(
      (candidate) => candidate.id === filters.niche,
    );
    if (niche && niche.id !== "all") {
      summary.push(`Specialization: ${niche.label}`);
    }
  }

  if (filters.freshness === "hot") summary.push("Hot roles");
  if (filters.freshness === "new") summary.push("New roles");
  if (filters.visaSponsorship) summary.push("Sponsorship explicitly offered");
  if (filters.minimumSalary !== "any") {
    const salary = MINIMUM_SALARY_OPTIONS.find(
      ([value]) => value === filters.minimumSalary,
    );
    summary.push(`Employer-listed pay: ${salary?.[1] ?? "Minimum set"}`);
  }
  if (filters.collection === "saved") {
    summary.push("Saved-only view retained");
  }
  if (filters.stages.length > 0) {
    summary.push(
      `Application stages retained: ${filters.stages
        .map(
          (stage) =>
            APPLICATION_STAGE_LABELS[stage as ApplicationStage] ?? stage,
        )
        .join(", ")}`,
    );
  }
  if (filters.sort !== "featured") summary.push("Custom sort retained");
  return summary;
}

export function AlertsWorkspace(props: AlertsWorkspaceProps) {
  const router = useRouter();
  const refreshJobs = useCallback(() => router.refresh(), [router]);
  return <AlertsWorkspaceView {...props} refreshJobs={refreshJobs} />;
}

export function AlertsWorkspaceView({
  jobs,
  generatedAt,
  updatedAt,
  loadError,
  partialData,
  refreshJobs,
}: AlertsWorkspaceViewProps) {
  const {
    searches,
    ready: searchesReady,
    editSearch,
    pauseSearch,
    deleteSearch,
  } = useSavedSearches();
  const [alertState, setAlertState] = useState<SearchAlertState>(
    createEmptySearchAlertState,
  );
  const alertStateRef = useRef(alertState);
  const [alertsReady, setAlertsReady] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [editingSearchId, setEditingSearchId] = useState<string | null>(
    null,
  );
  const [status, setStatus] = useState("");
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshRequestRef = useRef(0);

  const persistAlertState = useCallback((next: SearchAlertState) => {
    const canonical = parseSearchAlertState(
      serializeSearchAlertState(next),
    );
    alertStateRef.current = canonical;
    setAlertState(canonical);
    try {
      localStorage.setItem(
        SEARCH_ALERT_STORAGE_KEY,
        serializeSearchAlertState(canonical),
      );
    } catch {
      // Keep the foreground session useful when storage is restricted.
    }
  }, []);

  useEffect(() => {
    let initial = createEmptySearchAlertState();
    let browserPreference = false;
    try {
      initial = parseSearchAlertState(
        localStorage.getItem(SEARCH_ALERT_STORAGE_KEY),
      );
      browserPreference =
        localStorage.getItem(BROWSER_ALERT_PREFERENCE_KEY) === "enabled" &&
        "Notification" in window &&
        Notification.permission === "granted";
      localStorage.setItem(
        SEARCH_ALERT_STORAGE_KEY,
        serializeSearchAlertState(initial),
      );
    } catch {
      // In-memory alerts still work for this open page.
    }

    alertStateRef.current = initial;
    // Intentional hydration from anonymous, browser-owned state.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAlertState(initial);
    setBrowserEnabled(browserPreference);
    setAlertsReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const scheduleJobsRefresh = useCallback(
    (immediate = false) => {
      if (typeof window === "undefined") return;
      if (refreshTimerRef.current !== null) {
        if (!immediate) return;
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      const elapsed = Date.now() - lastRefreshRequestRef.current;
      const delay = immediate
        ? 0
        : Math.max(REFRESH_COALESCE_MS, MINIMUM_REFRESH_GAP_MS - elapsed);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        if (document.visibilityState !== "visible") return;
        lastRefreshRequestRef.current = Date.now();
        setStatus(
          boundedStatus(
            "Refreshing the server jobs snapshot before checking due searches…",
          ),
        );
        refreshJobs();
      }, delay);
    },
    [refreshJobs],
  );

  useEffect(() => {
    lastRefreshRequestRef.current = Date.now();
    const requestRefresh = () => scheduleJobsRefresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") requestRefresh();
    };
    const interval = window.setInterval(
      requestRefresh,
      FOREGROUND_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", requestRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", requestRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [scheduleJobsRefresh]);

  useEffect(() => {
    if (!searchesReady || !alertsReady || loadError) return;

    const browserDeliveryAvailable =
      browserEnabled &&
      "Notification" in window &&
      Notification.permission === "granted";
    const previous = serializeSearchAlertState(alertStateRef.current);
    const result = evaluateSearchAlerts({
      state: alertStateRef.current,
      searches,
      jobs,
      browserDeliveryAvailable,
      now: new Date(),
    });
    const next = serializeSearchAlertState(result.state);
    if (next !== previous) persistAlertState(result.state);

    if (result.newAlerts.length > 0) {
      const browserSearchIds = new Set(
        searches
          .filter((search) => search.channels.browser)
          .map((search) => search.id),
      );
      const browserAlerts = result.newAlerts.filter((alert) =>
        browserSearchIds.has(alert.savedSearchId),
      );
      if (
        browserDeliveryAvailable &&
        browserAlerts.length > 0 &&
        "Notification" in window
      ) {
        try {
          const copy = notificationCopy(browserAlerts);
          if (copy) {
            const notification = new Notification(copy.title, {
              body: copy.body,
              tag: "timley-search-alerts",
            });
            notification.onclick = () => {
              notification.close();
              window.focus();
              window.location.assign(copy.resultsUrl);
            };
          }
        } catch {
          // Delivery history remains the reliable inspection path.
        }
      }
      const inAppSearchIds = new Set(
        searches
          .filter((search) => search.channels.inApp)
          .map((search) => search.id),
      );
      const newInAppCount = result.newAlerts.filter((alert) =>
        inAppSearchIds.has(alert.savedSearchId),
      ).length;
      setStatus(
        boundedStatus(
          newInAppCount > 0
            ? `${newInAppCount} new in-app ${
                newInAppCount === 1 ? "match was" : "matches were"
              } added; ${result.newAlerts.length} ${
                result.newAlerts.length === 1 ? "delivery is" : "deliveries are"
              } available in history.`
            : `${result.newAlerts.length} new browser ${
                result.newAlerts.length === 1 ? "match was" : "matches were"
              } added to delivery history.`,
        ),
      );
    } else if (result.ranSearchIds.length > 0) {
      setStatus(
        boundedStatus(
          `Checked ${result.ranSearchIds.length} due ${
            result.ranSearchIds.length === 1 ? "search" : "searches"
          }; no unseen roles matched.`,
        ),
      );
    }
  }, [
    alertsReady,
    browserEnabled,
    generatedAt,
    jobs,
    loadError,
    persistAlertState,
    searches,
    searchesReady,
    updatedAt,
  ]);

  const searchById = useMemo(
    () => new Map(searches.map((search) => [search.id, search])),
    [searches],
  );
  const deliveryHistory = useMemo(
    () =>
      alertState.inbox.flatMap((alert) => {
        const search = searchById.get(alert.savedSearchId);
        return search ? [{ alert, search }] : [];
      }),
    [alertState.inbox, searchById],
  );
  const inAppAlertCount = useMemo(
    () =>
      deliveryHistory.filter(({ search }) => search.channels.inApp).length,
    [deliveryHistory],
  );
  const activeSearches = searches.filter(
    (search) =>
      search.frequency !== "paused" &&
      (search.channels.inApp || search.channels.browser),
  ).length;
  const editingSearch =
    searches.find((search) => search.id === editingSearchId) ?? null;

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      setStatus(
        boundedStatus("This browser does not support browser notifications."),
      );
      return;
    }

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setBrowserEnabled(false);
        try {
          localStorage.removeItem(BROWSER_ALERT_PREFERENCE_KEY);
        } catch {
          // The in-app inbox remains available.
        }
        setStatus(
          boundedStatus(
            "Browser alerts were not enabled. The local in-app inbox still works.",
          ),
        );
        return;
      }
      setBrowserEnabled(true);
      try {
        localStorage.setItem(BROWSER_ALERT_PREFERENCE_KEY, "enabled");
      } catch {
        // Permission is still usable for this foreground session.
      }
      setStatus(
        boundedStatus(
          "Browser alerts enabled for this browser while the Alerts page is open.",
        ),
      );
    } catch {
      setStatus(
        boundedStatus(
          "Browser alerts could not be enabled. The local inbox still works.",
        ),
      );
    }
  }

  function disableBrowserAlerts() {
    setBrowserEnabled(false);
    try {
      localStorage.removeItem(BROWSER_ALERT_PREFERENCE_KEY);
    } catch {
      // The in-memory preference still takes effect.
    }
    setStatus(
      boundedStatus(
        "Timley browser alerts are off. Browser permission was not changed.",
      ),
    );
  }

  function saveSearchSettings(
    search: SavedSearch,
    input: {
      name: string;
      frequency: SavedSearchFrequency;
      channels: SavedSearchChannels;
    },
  ): boolean {
    if (!input.channels.inApp && !input.channels.browser) {
      setStatus(
        boundedStatus(
          "Choose In-app inbox or Browser before saving. Email delivery is unavailable.",
        ),
      );
      return false;
    }
    const updated = editSearch(search.id, {
      name: input.name,
      frequency: input.frequency,
      channels: {
        ...input.channels,
        email: EMAIL_ALERTS_AVAILABLE ? input.channels.email : false,
      },
    });
    setStatus(
      boundedStatus(
        updated
          ? `${updated.name} settings saved in this browser.`
          : "Those search settings could not be saved.",
      ),
    );
    return updated !== null;
  }

  function togglePause(search: SavedSearch) {
    const updated =
      search.frequency === "paused"
        ? editSearch(search.id, { frequency: "daily" })
        : pauseSearch(search.id);
    setStatus(
      boundedStatus(
        updated
          ? `${updated.name} is now ${
              updated.frequency === "paused" ? "paused" : "active daily"
            }.`
          : "That search could not be updated.",
      ),
    );
  }

  function unsubscribe(search: SavedSearch) {
    const confirmed = window.confirm(
      `Unsubscribe and delete “${search.name}”? Its visible alert history will also be removed from this browser.`,
    );
    if (!confirmed) return;

    if (!deleteSearch(search.id)) {
      setStatus(boundedStatus("That saved search could not be deleted."));
      return;
    }
    const lastRunBySearch = Object.fromEntries(
      Object.entries(alertStateRef.current.lastRunBySearch).filter(
        ([id]) => id !== search.id,
      ),
    );
    persistAlertState({
      ...alertStateRef.current,
      inbox: alertStateRef.current.inbox.filter(
        (alert) => alert.savedSearchId !== search.id,
      ),
      lastRunBySearch,
    });
    if (editingSearchId === search.id) setEditingSearchId(null);
    setStatus(
      boundedStatus(
        `${search.name} and its visible alerts were deleted from this browser.`,
      ),
    );
  }

  function removeAlert(alert: SearchAlert) {
    const confirmed = window.confirm(
      `Remove the alert for “${alert.jobTitle}” from this browser?`,
    );
    if (!confirmed) return;
    persistAlertState({
      ...alertStateRef.current,
      inbox: alertStateRef.current.inbox.filter(
        (candidate) => candidate.id !== alert.id,
      ),
    });
    setStatus(boundedStatus("Alert removed from this browser."));
  }

  function saveEditedFilters(filters: BoardFilters) {
    if (!editingSearch) return;
    const updated = editSearch(editingSearch.id, { filters });
    setStatus(
      boundedStatus(
        updated
          ? `${updated.name} filters saved.`
          : "Those filters could not be saved.",
      ),
    );
  }

  return (
    <main
      id="main-content"
      className="min-h-[calc(100dvh-4rem)] bg-bg text-fg"
    >
      <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="grid gap-6 border-b border-border pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-accent">
              Anonymous and local
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-4xl">
              Search alerts
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
              Turn saved searches into a local alert inbox, see exactly why a
              role matched, and choose how often each search runs. No account is
              required.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => scheduleJobsRefresh(true)}
              className="ui-button ui-button--secondary"
            >
              Refresh jobs and check
            </button>
            <Link href="/jobs" className="ui-button ui-button--primary">
              Find and save a search
            </Link>
          </div>
        </header>

        {loadError ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-warning/35 bg-warning/10 p-4 text-sm leading-relaxed text-muted"
          >
            The current jobs snapshot could not be loaded. Your saved searches
            and local alert inbox are still available; no search is being
            treated as empty or deleted.
          </div>
        ) : partialData ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-warning/35 bg-warning/10 p-4 text-sm leading-relaxed text-muted"
          >
            The current jobs snapshot is partial. Alerts are evaluated only
            against the roles that loaded successfully.
          </div>
        ) : null}

        <section
          aria-labelledby="alert-summary-title"
          className="mt-7 grid gap-3 sm:grid-cols-3"
        >
          <h2 id="alert-summary-title" className="sr-only">
            Alert summary
          </h2>
          <SummaryCard label="Saved searches" value={searches.length} />
          <SummaryCard label="Active schedules" value={activeSearches} />
          <SummaryCard label="In-app alerts" value={inAppAlertCount} />
        </section>

        <p
          role="status"
          aria-live="polite"
          className="mt-4 min-h-5 text-sm font-semibold text-muted"
        >
          {status}
        </p>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
          <section
            aria-labelledby="inbox-title"
            className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="inbox-title" className="text-xl font-black text-fg">
                  Alert delivery history
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Every delivered in-app or browser match stays inspectable
                  here. Matching roles are globally deduplicated across saved
                  searches.
                </p>
              </div>
              <span className="rounded-full bg-raised px-3 py-1 text-xs font-extrabold text-muted">
                {deliveryHistory.length}{" "}
                {deliveryHistory.length === 1 ? "delivery" : "deliveries"}
              </span>
            </div>

            {!alertsReady || !searchesReady ? (
              <p className="mt-6 text-sm text-muted">Loading local alerts…</p>
            ) : deliveryHistory.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
                <h3 className="text-base font-extrabold text-fg">
                  No alert deliveries yet
                </h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                  Save a search from Jobs with In-app or Browser selected.
                  Timley refreshes the public jobs snapshot while this Alerts
                  page is open, including when it regains focus.
                </p>
                <Link
                  href="/jobs"
                  className="ui-button ui-button--secondary mt-4"
                >
                  Browse jobs
                </Link>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {deliveryHistory.map(({ alert, search }) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    search={search}
                    onRemove={() => removeAlert(alert)}
                    onTogglePause={() => togglePause(search)}
                    onUnsubscribe={() => unsubscribe(search)}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <section
              aria-labelledby="delivery-title"
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"
            >
              <h2 id="delivery-title" className="text-lg font-black text-fg">
                Delivery
              </h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-border p-4">
                  <h3 className="text-sm font-extrabold text-fg">
                    Browser alerts
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Optional notices are sent only for new matches from searches
                    whose Browser channel is on, and only while this Alerts page
                    is open. This is not background push.
                  </p>
                  {browserEnabled ? (
                    <button
                      type="button"
                      onClick={disableBrowserAlerts}
                      className="ui-button ui-button--secondary ui-button--sm mt-3"
                    >
                      Disable Timley browser alerts
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={enableBrowserAlerts}
                      className="ui-button ui-button--primary ui-button--sm mt-3"
                    >
                      Enable browser alerts
                    </button>
                  )}
                </div>

                <div
                  aria-disabled="true"
                  className="rounded-xl border border-border bg-raised/50 p-4"
                >
                  <h3 className="text-sm font-extrabold text-fg">
                    Email alerts
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Provider setup required. Email delivery is scaffolded but
                    unavailable, so no email address is collected or sent.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="ui-button ui-button--secondary ui-button--sm mt-3"
                  >
                    Email unavailable
                  </button>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="privacy-title"
              className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"
            >
              <h2 id="privacy-title" className="text-lg font-black text-fg">
                Privacy and persistence
              </h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
                <li>
                  Saved searches, schedules, and channel choices start in this
                  browser. Optional account continuity includes saved searches
                  only after you explicitly select and sync that category.
                </li>
                <li>
                  Alert inbox history, delivered-role IDs, and the foreground
                  browser preference remain browser-only. Search alerts are not
                  included in account continuity or the Tracker JSON backup.
                  Clearing this site&apos;s browser data removes them.
                </li>
                <li>
                  Foreground checks refresh the server jobs snapshot about every
                  five minutes and when this Alerts page returns to focus. Other
                  Timley pages do not run saved-search browser delivery.
                </li>
                <li>
                  Deleting a search removes its settings and visible alerts from
                  this browser. A bounded role-ID dedupe list remains until site
                  data is cleared so the same role is not alerted twice.
                  Signing out does not silently clear anonymous browser storage.
                </li>
                <li>
                  Timley evaluates public job data locally. It does not silently
                  transmit personal notes or contact information.
                </li>
              </ul>
            </section>
          </aside>
        </div>

        <section
          aria-labelledby="searches-title"
          className="mt-6 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="searches-title" className="text-xl font-black text-fg">
                Manage saved searches
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
                Edit names, schedules, channels, and the complete set of job
                filters. Saved-only, application-stage, and sort settings stay
                attached to the search but do not affect public alert matching.
                At least one supported local channel is required.
              </p>
            </div>
            <p className="text-xs font-semibold text-faint">
              Jobs snapshot: {formatDateTime(updatedAt ?? generatedAt)}
            </p>
          </div>

          {!searchesReady ? (
            <p className="mt-6 text-sm text-muted">
              Loading saved searches…
            </p>
          ) : searches.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border p-6 text-center">
              <h3 className="text-base font-extrabold text-fg">
                Save your first search
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Set filters on the Jobs page, choose Save search, then return
                here to manage its schedule and alert channels.
              </p>
              <Link
                href="/jobs"
                className="ui-button ui-button--primary mt-4"
              >
                Open job search
              </Link>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {searches.map((search) => (
                <SearchSettingsCard
                  key={`${search.id}:${search.updatedAt}`}
                  search={search}
                  onSave={(input) => saveSearchSettings(search, input)}
                  onTogglePause={() => togglePause(search)}
                  onEditFilters={() => setEditingSearchId(search.id)}
                  onDelete={() => unsubscribe(search)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {editingSearch ? (
        <MobileFilterSheet
          key={`${editingSearch.id}:${editingSearch.updatedAt}`}
          open
          onClose={() => setEditingSearchId(null)}
          filters={editingSearch.filters}
          jobs={jobs}
          applications={{}}
          onApply={saveEditedFilters}
        />
      ) : null}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-faint">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums text-fg">{value}</p>
    </div>
  );
}

function AlertCard({
  alert,
  search,
  onRemove,
  onTogglePause,
  onUnsubscribe,
}: {
  alert: SearchAlert;
  search: SavedSearch;
  onRemove: () => void;
  onTogglePause: () => void;
  onUnsubscribe: () => void;
}) {
  const channelLabels = [
    search.channels.inApp ? "In-app" : null,
    search.channels.browser ? "Browser" : null,
  ].filter((label): label is string => label !== null);

  return (
    <article className="rounded-xl border border-border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-fg">
            {alert.jobTitle}
          </h3>
          <p className="mt-1 text-sm font-semibold text-muted">
            {alert.company} · {alert.location}
          </p>
          <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-extrabold text-faint">Triggered by</dt>
              <dd className="mt-0.5 text-muted">{alert.savedSearchName}</dd>
            </div>
            <div>
              <dt className="font-extrabold text-faint">Frequency</dt>
              <dd className="mt-0.5 text-muted">
                {FREQUENCY_LABELS[alert.frequency]}
              </dd>
            </div>
            <div>
              <dt className="font-extrabold text-faint">Search channels</dt>
              <dd className="mt-0.5 text-muted">
                {channelLabels.length > 0
                  ? channelLabels.join(" and ")
                  : "No active local channel"}
              </dd>
            </div>
            <div>
              <dt className="font-extrabold text-faint">Alert created</dt>
              <dd className="mt-0.5 text-muted">
                {formatDateTime(alert.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="font-extrabold text-faint">First seen</dt>
              <dd className="mt-0.5 text-muted">
                {formatDateTime(alert.jobFirstSeenAt)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={alert.resultsUrl}
            className="ui-button ui-button--primary ui-button--sm"
          >
            View matching results
          </Link>
          <button
            type="button"
            onClick={onRemove}
            className="ui-button ui-button--quiet ui-button--sm"
          >
            Remove alert
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            className="ui-button ui-button--secondary ui-button--sm"
          >
            {search.frequency === "paused" ? "Resume daily" : "Pause search"}
          </button>
          <button
            type="button"
            onClick={onUnsubscribe}
            className="ui-button ui-button--quiet ui-button--sm text-error"
          >
            Unsubscribe and delete
          </button>
        </div>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-extrabold text-faint">Why it matched</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {alert.matchReasons.map((reason) => (
            <li
              key={reason}
              className="rounded-full bg-raised px-2.5 py-1 text-xs font-semibold text-muted"
            >
              {reason}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function SearchSettingsCard({
  search,
  onSave,
  onTogglePause,
  onEditFilters,
  onDelete,
}: {
  search: SavedSearch;
  onSave: (input: {
    name: string;
    frequency: SavedSearchFrequency;
    channels: SavedSearchChannels;
  }) => boolean;
  onTogglePause: () => void;
  onEditFilters: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(search.name);
  const [frequency, setFrequency] = useState(search.frequency);
  const [channels, setChannels] = useState<SavedSearchChannels>({
    ...search.channels,
    email: EMAIL_ALERTS_AVAILABLE ? search.channels.email : false,
  });
  const [channelError, setChannelError] = useState("");
  const summary = filterSummary(search.filters);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channels.inApp && !channels.browser) {
      setChannelError(
        "Choose In-app inbox or Browser before saving. Email delivery is unavailable.",
      );
      return;
    }
    setChannelError("");
    onSave({ name, frequency, channels });
  }

  function setChannel(
    channel: keyof SavedSearchChannels,
    checked: boolean,
  ) {
    setChannels((current) => ({ ...current, [channel]: checked }));
    setChannelError("");
  }

  return (
    <article className="rounded-xl border border-border p-4 sm:p-5">
      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <label className="text-xs font-extrabold text-muted">
            Search name
            <input
              type="text"
              required
              maxLength={MAX_SAVED_SEARCH_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="ui-control ui-input mt-1.5 w-full"
            />
          </label>
          <label className="text-xs font-extrabold text-muted">
            Frequency
            <select
              value={frequency}
              onChange={(event) =>
                setFrequency(
                  event.target.value as SavedSearchFrequency,
                )
              }
              className="ui-control ui-input mt-1.5 w-full"
            >
              {FREQUENCY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-extrabold text-muted">
            Alert channels
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <ChannelToggle
              label="In-app inbox"
              checked={channels.inApp}
              onChange={(checked) => setChannel("inApp", checked)}
            />
            <ChannelToggle
              label="Browser"
              checked={channels.browser}
              onChange={(checked) => setChannel("browser", checked)}
            />
            <ChannelToggle
              label="Email unavailable"
              checked={channels.email}
              disabled={!EMAIL_ALERTS_AVAILABLE}
              onChange={(checked) => setChannel("email", checked)}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Choosing Browser here does not request permission. Use the separate
            Enable browser alerts button above when you are ready.
          </p>
          <p
            role={channelError ? "alert" : "status"}
            aria-live="polite"
            className="mt-2 min-h-4 text-xs font-semibold text-error"
          >
            {channelError}
          </p>
        </fieldset>

        <div className="mt-4">
          <p className="text-xs font-extrabold text-faint">Filter summary</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {summary.map((item) => (
              <li
                key={item}
                className="rounded-full bg-raised px-2.5 py-1 text-xs font-semibold text-muted"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="submit"
            className="ui-button ui-button--primary ui-button--sm"
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={onEditFilters}
            className="ui-button ui-button--secondary ui-button--sm"
          >
            Edit filters
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            className="ui-button ui-button--secondary ui-button--sm"
          >
            {search.frequency === "paused" ? "Resume daily" : "Pause"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ui-button ui-button--quiet ui-button--sm sm:ml-auto"
          >
            Unsubscribe and delete
          </button>
        </div>
      </form>
    </article>
  );
}

function ChannelToggle({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`ui-control flex min-h-11 items-center gap-2 px-3 text-xs font-bold ${
        disabled
          ? "cursor-not-allowed bg-raised text-faint"
          : "cursor-pointer text-muted hover:border-muted hover:text-fg"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      <span>{label}</span>
    </label>
  );
}

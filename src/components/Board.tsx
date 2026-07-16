"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  APPLICATION_STAGE_ORDER,
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  getApplicationStage,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import {
  activeFilterCount,
  type BoardFilters,
  type Collection,
  type MajorId,
  type SortKey,
  type ViewMode,
} from "@/lib/boardFilterState";
import { SORT_OPTIONS } from "@/lib/boardOptions";
import {
  PHYSICAL_LOCATION_FACETS,
  buildLocationFacetOptionsFromCounts,
  countRemoteJobs,
  type PhysicalLocationFacetId,
} from "@/lib/jobLocations";
import { MAJORS, MAJORS_BY_ID } from "@/lib/jobTaxonomy";
import {
  HOT_DAYS,
  NEW_DAYS,
  daysAgo,
  relativeTimestamp,
} from "@/lib/jobTime";
import type { Internship, RoleType } from "@/lib/types";
import type { JobPage, JobQuery } from "@/lib/jobQuery";
import { useApplicationTracking } from "@/hooks/useApplicationTracking";
import { useBoardFilters } from "@/hooks/useBoardFilters";
import {
  useSavedTracking,
  usePersistentString,
} from "@/hooks/useLocalStorageState";
import {
  FilterChip,
  LocationFilterMenu,
  QuickToggle,
  StageFilterMenu,
  TermFilterMenu,
} from "@/components/BoardFilterControls";
import { JobCard, JOB_GRID } from "@/components/JobCard";
import { MobileFilterSheet } from "@/components/MobileFilterSheet";
import { ApplicationTrackingTransfer } from "@/components/ApplicationTrackingTransfer";
import {
  exportTrackingDataCsv,
  exportTrackingDataJson,
  importTrackingDataCsv,
  importTrackingDataJson,
} from "@/lib/trackingDataTransfer";
import {
  buildTermFacetOptions,
  termLabelFromKey,
  type InternshipTermKey,
} from "@/lib/jobTerms";

const PAGE_SIZE = 30;
const LOCATION_LABELS = new Map<PhysicalLocationFacetId, string>(
  PHYSICAL_LOCATION_FACETS.map((location) => [location.id, location.label]),
);

function isViewMode(value: string): value is ViewMode {
  return value === "card" || value === "table";
}

export function Board({
  jobs: initialJobs,
  initialPage,
  loadError,
  generatedAt,
  updatedAt,
}: {
  jobs: Internship[];
  initialPage?: JobPage;
  loadError: boolean;
  generatedAt: string;
  updatedAt: string | null;
}) {
  const now = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const { filters, ready: filtersReady, updateFilters, clearFilters } =
    useBoardFilters();
  const [view, setView, viewReady] = usePersistentString<ViewMode>(
    "timley:view",
    "card",
    isViewMode,
  );
  const [page, setPage] = useState<JobPage>(() => initialPage ?? {
    items: initialJobs,
    total: initialJobs.length,
    facets: { locations: [], categories: [], sources: [], terms: [] },
    nextCursor: null,
    hasMore: false,
    updatedAt,
    roleTotals: {
      internship: initialJobs.filter((job) => job.role_type === "internship").length,
      new_grad: initialJobs.filter((job) => job.role_type === "new_grad").length,
    },
  });
  const [resolvedTrackingAliases, setResolvedTrackingAliases] = useState<
    Record<string, string>
  >({});
  const trackingAliases = useMemo(
    () => ({
      ...resolvedTrackingAliases,
      ...Object.fromEntries(
        page.items.map((job) => [job.link, job.tracking_key]),
      ),
    }),
    [page.items, resolvedTrackingAliases],
  );
  const {
    saved,
    unmatchedSaved,
    store: savedStore,
    ready: savedReady,
    storageAvailable: savedStorageAvailable,
    toggleSaved,
    importStore: importSavedStore,
  } = useSavedTracking(trackingAliases);
  const {
    store: applicationStore,
    records,
    unmatchedRecords,
    ready: applicationsReady,
    storageAvailable: applicationsStorageAvailable,
    updateStage,
    importStore: importApplicationStore,
  } = useApplicationTracking(trackingAliases);
  const [networkState, setNetworkState] = useState<
    "idle" | "loading" | "loading-more" | "error"
  >("idle");
  const [failedRequest, setFailedRequest] = useState<"query" | "more" | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestSequence = useRef(0);
  const attemptedTrackingAliases = useRef(new Set<string>());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [stageAnnouncement, setStageAnnouncement] = useState("");
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);

  const {
    tab,
    query,
    major,
    niche,
    locationIds,
    locationOrder,
    termKeys,
    freshness,
    collection,
    sort,
    stages,
    remoteOnly,
    visaSponsorship,
  } = filters;
  const deferredQuery = useDeferredValue(query);
  const jobs = page.items;
  const storageReady =
    filtersReady && savedReady && applicationsReady && viewReady;
  const trackingStorageAvailable =
    savedStorageAvailable === false || applicationsStorageAvailable === false
      ? false
      : savedStorageAvailable === true && applicationsStorageAvailable === true
        ? true
        : null;
  const exportTrackingJson = useCallback(
    () =>
      exportTrackingDataJson({
        applications: applicationStore,
        saved: savedStore,
      }),
    [applicationStore, savedStore],
  );
  const exportTrackingCsv = useCallback(
    () =>
      exportTrackingDataCsv({
        applications: applicationStore,
        saved: savedStore,
      }),
    [applicationStore, savedStore],
  );
  const importTrackingJson = useCallback(
    (raw: string) => {
      const imported = importTrackingDataJson(raw);
      importApplicationStore(imported.applications);
      if (imported.saved) importSavedStore(imported.saved);
    },
    [importApplicationStore, importSavedStore],
  );
  const importTrackingCsv = useCallback(
    (raw: string) => {
      const imported = importTrackingDataCsv(raw);
      importApplicationStore(imported.applications);
      if (imported.saved) importSavedStore(imported.saved);
    },
    [importApplicationStore, importSavedStore],
  );

  useEffect(() => {
    if (!savedReady || !applicationsReady) return;
    const pendingUrls = [
      ...new Set([
        ...unmatchedSaved,
        ...Object.keys(unmatchedRecords),
      ]),
    ].filter(
      (url) =>
        isHttpsUrl(url) &&
        !trackingAliases[url] &&
        !attemptedTrackingAliases.current.has(url),
    ).slice(0, 100);
    if (pendingUrls.length === 0) return;
    pendingUrls.forEach((url) => attemptedTrackingAliases.current.add(url));

    const controller = new AbortController();
    void fetch("/api/tracking/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: pendingUrls }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`alias request failed: ${response.status}`);
        const payload: unknown = await response.json();
        if (!isRecord(payload) || !isStringRecord(payload.aliases)) {
          throw new Error("invalid alias response");
        }
        const aliases = payload.aliases;
        setResolvedTrackingAliases((current) => ({
          ...current,
          ...aliases,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        pendingUrls.forEach((url) => attemptedTrackingAliases.current.delete(url));
        console.error(error);
      });

    return () => controller.abort();
  }, [
    applicationsReady,
    savedReady,
    trackingAliases,
    unmatchedRecords,
    unmatchedSaved,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = document.activeElement;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.getAttribute("contenteditable") === "true";
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        const visibleSearch = [mobileSearchRef.current, desktopSearchRef.current]
          .find((input) => input && input.getClientRects().length > 0);
        visibleSearch?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!stageAnnouncement) return;
    const timeout = window.setTimeout(() => setStageAnnouncement(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [stageAnnouncement]);

  const tabJobs = jobs;
  const activeMajor = MAJORS_BY_ID[major];
  const activeNiche =
    activeMajor.niches.find((option) => option.id === niche) ??
    activeMajor.niches[0];

  useEffect(() => {
    if (!filtersReady) return;
    if (!activeMajor.niches.some((option) => option.id === niche)) {
      updateFilters({ niche: "all" }, "replace");
    }
  }, [activeMajor, filtersReady, niche, updateFilters]);

  const nicheCounts = useMemo(
    () =>
      new Map(
        activeMajor.niches.map((option) => [
          option.id,
          tabJobs.filter(
            (job) => activeMajor.matches(job) && option.matches(job),
          ).length,
        ]),
      ),
    [activeMajor, tabJobs],
  );
  const hotCount = useMemo(
    () => tabJobs.filter((job) => daysAgo(job, now) <= HOT_DAYS).length,
    [now, tabJobs],
  );
  const newCount = useMemo(
    () => tabJobs.filter((job) => daysAgo(job, now) <= NEW_DAYS).length,
    [now, tabJobs],
  );
  const remoteCount = useMemo(() => countRemoteJobs(tabJobs), [tabJobs]);
  const locationOptions = useMemo(
    () => buildLocationFacetOptionsFromCounts(page.facets.locations, locationOrder),
    [locationOrder, page.facets.locations],
  );
  const termOptions = useMemo(
    () => buildTermFacetOptions(page.facets.terms),
    [page.facets.terms],
  );
  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        APPLICATION_STAGES.map((stage) => [
          stage,
          tabJobs.filter(
            (job) => getApplicationStage(records, job.tracking_key) === stage,
          ).length,
        ]),
      ) as Record<ApplicationStage, number>,
    [records, tabJobs],
  );

  const filtered = useMemo(() => {
    if (sort !== "application-stage") return tabJobs;
    const rank = new Map(APPLICATION_STAGE_ORDER.map((stage, index) => [stage, index]));
    return [...tabJobs].sort((left, right) =>
      (rank.get(getApplicationStage(records, left.tracking_key)) ?? 99) -
        (rank.get(getApplicationStage(records, right.tracking_key)) ?? 99) ||
      right.first_seen_at.localeCompare(left.first_seen_at),
    );
  }, [records, sort, tabJobs]);

  const visibleJobs = filtered;
  const remainingCount = Math.max(0, page.total - visibleJobs.length);
  const nextPageCount = Math.min(PAGE_SIZE, remainingCount);
  const internCount = page.roleTotals.internship;
  const gradCount = page.roleTotals.new_grad;
  const savedInTab = tabJobs.filter((job) => saved.has(job.tracking_key)).length;
  const filterCount = activeFilterCount(filters);
  const dense = view === "table";

  const trackingKeys = useMemo(() => {
    let keys: Set<string> | null = null;
    if (collection === "saved") keys = new Set(saved);
    if (stages.length > 0) {
      const stageKeys = new Set(
        Object.entries(records)
          .filter(([, record]) => stages.includes(record.stage))
          .map(([trackingKey]) => trackingKey),
      );
      keys = keys
        ? new Set([...keys].filter((trackingKey) => stageKeys.has(trackingKey)))
        : stageKeys;
    }
    return keys ? [...keys].slice(0, 500) : null;
  }, [collection, records, saved, stages]);

  const queryBody = useMemo<JobQuery>(() => ({
    roleType: tab,
    query: deferredQuery,
    majorId: major,
    nicheId: niche,
    locationIds,
    termKeys,
    remoteOnly,
    visaSponsorship,
    freshness,
    trackingKeys,
    sort,
    cursor: null,
    pageSize: PAGE_SIZE,
  }), [
    deferredQuery,
    freshness,
    locationIds,
    major,
    niche,
    remoteOnly,
    sort,
    tab,
    termKeys,
    trackingKeys,
    visaSponsorship,
  ]);

  useEffect(() => {
    if (!storageReady) return;
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    queueMicrotask(() => {
      if (!controller.signal.aborted && sequence === requestSequence.current) {
        setFailedRequest(null);
        setNetworkState("loading");
      }
    });

    void fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryBody),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`jobs request failed: ${response.status}`);
        const payload: unknown = await response.json();
        if (!isJobPage(payload)) throw new Error("invalid jobs response");
        if (sequence !== requestSequence.current) return;
        setPage(payload);
        setFailedRequest(null);
        setNetworkState("idle");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        console.error(error);
        setFailedRequest("query");
        setNetworkState("error");
      });

    return () => controller.abort();
  }, [queryBody, retryNonce, storageReady]);

  const loadMore = async () => {
    if (!page.nextCursor || networkState === "loading" || networkState === "loading-more") return;
    const sequence = ++requestSequence.current;
    setFailedRequest(null);
    setNetworkState("loading-more");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...queryBody, cursor: page.nextCursor }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`jobs request failed: ${response.status}`);
      const payload: unknown = await response.json();
      if (!isJobPage(payload)) throw new Error("invalid jobs response");
      if (sequence !== requestSequence.current) return;
      setPage((current) => {
        const seen = new Set(current.items.map((job) => job.id));
        return {
          ...payload,
          items: [...current.items, ...payload.items.filter((job) => !seen.has(job.id))],
          total: current.total,
          roleTotals: current.roleTotals,
        };
      });
      setFailedRequest(null);
      setNetworkState("idle");
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      console.error(error);
      setFailedRequest("more");
      setNetworkState("error");
    }
  };

  const update = (
    changes: Partial<BoardFilters>,
    mode: "push" | "replace" = "push",
  ) => updateFilters(changes, mode);

  const switchTab = (nextTab: RoleType) =>
    update({ tab: nextTab, termKeys: nextTab === "internship" ? termKeys : [] });
  const selectMajor = (nextMajor: MajorId) =>
    update({ major: nextMajor, niche: "all" });
  const toggleLocation = (id: PhysicalLocationFacetId) =>
    update({
      locationIds: locationIds.includes(id)
        ? locationIds.filter((selected) => selected !== id)
        : [...locationIds, id],
    });
  const toggleTerm = (key: InternshipTermKey) =>
    update({
      termKeys: termKeys.includes(key)
        ? termKeys.filter((selected) => selected !== key)
        : [...termKeys, key],
    });
  const toggleStageFilter = (stage: ApplicationStage) =>
    update({
      stages: stages.includes(stage)
        ? stages.filter((selected) => selected !== stage)
        : [...stages, stage],
    });
  const setRemoteOnly = (next: boolean) =>
    update({ remoteOnly: next, locationIds: next ? [] : locationIds });

  const onRoleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    current: RoleType,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = current === "internship" ? "new_grad" : "internship";
    switchTab(next);
    window.requestAnimationFrame(() =>
      document.getElementById(`role-tab-${next}`)?.focus(),
    );
  };

  const optionLabels = new Map(
    locationOptions.map((option) => [option.id, option.label]),
  );
  const selectedLocationLabels = locationIds.map(
    (id) =>
      optionLabels.get(id) ??
      LOCATION_LABELS.get(id) ??
      id.replace(/^place:/, "").replace(/-/g, " "),
  );

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            timley<span className="text-accent">.</span>
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            US-focused internship &amp; new grad listings from six maintained
            sources — sorted by opening date and refreshed every 2 hours.
          </p>
        </div>
        <p className="text-[13px] font-medium text-faint">
          {page.roleTotals.internship + page.roleTotals.new_grad} open roles
          {(page.updatedAt ?? updatedAt) && (
            <> · updated {relativeTimestamp(page.updatedAt ?? updatedAt!, now)}</>
          )}
        </p>
      </header>

      <div
        data-sticky-toolbar
        data-testid="job-toolbar"
        data-filters-ready={filtersReady}
        aria-hidden={!filtersReady}
        inert={!filtersReady}
        className={`sticky top-0 z-50 isolate -mx-4 mt-8 border-b border-border/60 bg-bg px-4 pt-3 pb-3 shadow-[0_14px_28px_rgba(0,0,0,0.82)] sm:-mx-6 sm:px-6 ${
          filtersReady ? "" : "invisible pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="inline-flex min-w-0 rounded-full border border-border bg-surface p-1"
            role="tablist"
            aria-label="Role type"
          >
            {(
              [
                ["internship", "Internships", internCount],
                ["new_grad", "New Grad", gradCount],
              ] as Array<[RoleType, string, number]>
            ).map(([key, label, count]) => (
              <button
                id={`role-tab-${key}`}
                key={key}
                type="button"
                role="tab"
                tabIndex={tab === key ? 0 : -1}
                aria-selected={tab === key}
                aria-controls="job-results"
                onKeyDown={(event) => onRoleTabKeyDown(event, key)}
                onClick={() => switchTab(key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent sm:px-4 ${
                  tab === key ? "bg-fg text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 text-xs font-medium ${
                    tab === key ? "text-bg/60" : "text-faint"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden rounded-full border border-border bg-surface p-1 lg:inline-flex">
              {(
                [
                  ["all", "All", null],
                  ["hot", `Hot ${hotCount}`, "hot"],
                  ["new", `New ${newCount}`, "new"],
                ] as const
              ).map(([key, label, tone]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={freshness === key}
                  onClick={() => update({ freshness: key })}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    freshness === key
                      ? tone === "hot"
                        ? "bg-hot-soft text-hot"
                        : tone === "new"
                          ? "bg-new-soft text-new"
                          : "bg-raised text-fg"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="hidden lg:inline-flex">
              <ViewToggle view={view} ready={viewReady} onChange={setView} />
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 lg:hidden">
          <SearchInput
            inputRef={mobileSearchRef}
            value={query}
            onChange={(value) => update({ query: value }, "replace")}
          />
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              filterCount > 0
                ? "border-accent/45 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted"
            }`}
          >
            <FilterIcon /> Filters
            {filterCount > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                {filterCount}
              </span>
            )}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 lg:hidden">
          <QuickToggle
            label="Remote Only"
            checked={remoteOnly}
            count={remoteCount}
            onChange={setRemoteOnly}
          />
          <QuickToggle
            label="Visa Sponsorship"
            checked={visaSponsorship}
            description="Only shows roles explicitly marked as offering visa sponsorship."
            onChange={(value) => update({ visaSponsorship: value })}
          />
        </div>

        <div className="mt-3 hidden flex-wrap items-center gap-2.5 lg:flex">
          <SearchInput
            inputRef={desktopSearchRef}
            value={query}
            onChange={(value) => update({ query: value }, "replace")}
          />
          <LocationFilterMenu
            options={locationOptions}
            selected={locationIds}
            order={locationOrder}
            disabled={remoteOnly}
            onToggle={toggleLocation}
            onOrderChange={(value) => update({ locationOrder: value })}
          />
          {tab === "internship" && (
            <TermFilterMenu
              options={termOptions}
              selected={termKeys}
              onToggle={toggleTerm}
              onClear={() => update({ termKeys: [] })}
            />
          )}
          <select
            value={sort}
            onChange={(event) => update({ sort: event.target.value as SortKey })}
            aria-label="Sort jobs"
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-muted focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {SORT_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div
            className="inline-flex rounded-xl border border-border bg-surface p-1"
            role="group"
            aria-label="Job collection"
          >
            {(
              [
                ["all", "All"],
                ["saved", `To apply ${savedInTab || ""}`.trim()],
              ] as Array<[Collection, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={collection === key}
                onClick={() => update({ collection: key })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  collection === key
                    ? "bg-raised text-fg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <StageFilterMenu
            selected={stages}
            counts={stageCounts}
            onToggle={toggleStageFilter}
          />
          <QuickToggle
            label="Remote Only"
            checked={remoteOnly}
            count={remoteCount}
            onChange={setRemoteOnly}
          />
          <QuickToggle
            label="Visa Sponsorship"
            checked={visaSponsorship}
            description="Only shows roles explicitly marked as offering visa sponsorship."
            onChange={(value) => update({ visaSponsorship: value })}
          />
          <span
            aria-label={`${filterCount} active filters`}
            className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-[11px] font-bold ${
              filterCount > 0
                ? "border-accent/35 bg-accent/10 text-accent"
                : "border-border bg-surface text-faint"
            }`}
          >
            Filters {filterCount}
          </span>
        </div>

        <div className="mt-4 hidden overflow-x-auto border-b border-border/70 lg:block">
          <div
            className="-mb-px flex min-w-max items-center gap-1 pb-px"
            role="group"
            aria-label="Browse internships by major"
          >
            {MAJORS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={major === option.id}
                onClick={() => selectMajor(option.id)}
                className={`rounded-t-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
                  major === option.id
                    ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(231,201,139,0.1))] text-champagne shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-champagne/20 backdrop-blur-md"
                    : "text-muted hover:bg-white/[0.04] hover:text-fg"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 hidden min-w-0 items-center gap-2 lg:flex">
          <div
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
            role="group"
            aria-label={`${activeMajor.label} specializations`}
          >
            {activeMajor.niches.map((option) => {
              const available =
                page.total > tabJobs.length || (nicheCounts.get(option.id) ?? 0) > 0;
              const selected = niche === option.id;
              const unavailableMessage = `${option.label} has no live roles yet`;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={available ? option.label : unavailableMessage}
                  disabled={!available}
                  title={available ? option.label : unavailableMessage}
                  onClick={() => update({ niche: option.id })}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-[color,background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
                    selected
                      ? "border-border-strong bg-raised text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                      : available
                        ? "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
                        : "cursor-not-allowed border-border/60 bg-surface/60 text-faint/70"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {(filterCount > 0 || query) && (
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
              {remoteOnly && (
                <FilterChip label="Remote Only" onRemove={() => setRemoteOnly(false)} />
              )}
              {visaSponsorship && (
                <FilterChip
                  label="Visa Sponsorship"
                  onRemove={() => update({ visaSponsorship: false })}
                />
              )}
              {locationIds.map((id, index) => (
                <FilterChip
                  key={id}
                  label={selectedLocationLabels[index]}
                  onRemove={() => toggleLocation(id)}
                />
              ))}
              {termKeys.map((key) => {
                const option = termOptions.find((term) => term.id === key);
                return (
                  <FilterChip
                    key={key}
                    label={option?.label ?? termLabelFromKey(key)}
                    onRemove={() => toggleTerm(key)}
                  />
                );
              })}
              {stages.map((stage) => (
                <FilterChip
                  key={stage}
                  label={APPLICATION_STAGE_LABELS[stage]}
                  onRemove={() => toggleStageFilter(stage)}
                />
              ))}
              {freshness !== "all" && (
                <FilterChip
                  label={freshness === "hot" ? "Hot" : "New"}
                  onRemove={() => update({ freshness: "all" })}
                />
              )}
              {collection === "saved" && (
                <FilterChip label="To apply" onRemove={() => update({ collection: "all" })} />
              )}
              {(major !== "all" || niche !== "all") && (
                <FilterChip
                  label={
                    niche !== "all"
                      ? activeNiche.label
                      : activeMajor.label
                  }
                  onRemove={() => update({ major: "all", niche: "all" })}
                />
              )}
              {sort !== "newest" && (
                <FilterChip
                  label={SORT_OPTIONS.find(([key]) => key === sort)?.[1] ?? sort}
                  onRemove={() => update({ sort: "newest" })}
                />
              )}
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 px-2 py-1 text-xs font-semibold text-faint underline underline-offset-2 hover:text-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {mobileFiltersOpen && (
        <MobileFilterSheet
          open
          onClose={() => setMobileFiltersOpen(false)}
          filters={filters}
          jobs={jobs}
          applications={records}
          termOptions={termOptions}
          onApply={(nextFilters) => updateFilters(nextFilters, "push")}
        />
      )}

      <section
        id="job-results"
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`role-tab-${tab}`}
        className="focus:outline-none"
      >
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <p className="text-xs font-medium text-faint" aria-live="polite">
            {visibleJobs.length === 0
              ? `0 of ${page.total} roles`
              : `Showing ${visibleJobs.length} of ${page.total} ${
                  page.total === 1 ? "role" : "roles"
                }`}
          </p>
          <div className="max-w-xl text-[11px] leading-snug text-faint sm:text-right">
            <p>
              Star a role for To apply; use Track once you start. “Term not
              listed” means the source did not provide enough evidence to
              classify it.
            </p>
            <p className="mt-1">
              Pay guide: amounts without “Est.” come from source listings;
              estimates are broad US category ranges.
            </p>
          </div>
        </div>

        {dense && storageReady && networkState !== "loading" && filtered.length > 0 && (
          <div
            className={`${JOB_GRID} mt-3 hidden px-5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint lg:grid`}
          >
            <span />
            <span>Company / Role</span>
            <span>Category</span>
            <span>Location</span>
            <span>Comp</span>
            <span className="text-right">Age</span>
            <span className="text-right">Actions</span>
          </div>
        )}

        <ul
          data-job-list
          aria-busy={!storageReady || networkState === "loading" || networkState === "loading-more"}
          className={dense ? "mt-1 space-y-1" : "mt-3 space-y-2.5"}
        >
          {storageReady && networkState !== "loading" && visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              dense={dense}
              saved={saved.has(job.tracking_key)}
              stage={getApplicationStage(records, job.tracking_key)}
              onToggleSaved={() => toggleSaved(job.tracking_key)}
              onStageChange={(stage) => {
                updateStage(job.tracking_key, stage);
                setStageAnnouncement(
                  `${job.company} moved to ${APPLICATION_STAGE_LABELS[stage]}.`,
                );
              }}
            />
          ))}
          {(!storageReady || networkState === "loading") && (
            <li
              role="status"
              className="rounded-2xl border border-border bg-surface px-4 py-16 text-center text-sm text-muted"
            >
              {!storageReady
                ? "Restoring your saved roles, filters, and application stages…"
                : "Loading matching roles…"}
            </li>
          )}
          {storageReady && networkState !== "loading" && filtered.length === 0 && (
            <li className="rounded-2xl border border-border bg-surface px-4 py-16 text-center text-sm text-muted">
              <EmptyState
                loadError={loadError || networkState === "error"}
                jobs={jobs}
                filters={filters}
                locationLabels={selectedLocationLabels}
              />
            </li>
          )}
        </ul>

        {storageReady && networkState !== "loading" && filtered.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-3 border-t border-border/70 pt-6">
            {networkState === "error" ? (
              <button
                type="button"
                onClick={() => {
                  if (failedRequest === "more") void loadMore();
                  else setRetryNonce((value) => value + 1);
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-action bg-action px-5 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Retry loading roles
              </button>
            ) : page.hasMore && page.nextCursor && remainingCount > 0 ? (
              <button
                data-load-more
                data-testid="load-more"
                type="button"
                aria-label={`Load ${nextPageCount} more roles, ${remainingCount} remaining`}
                disabled={networkState === "loading-more"}
                onClick={() => void loadMore()}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/45 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent transition-[color,background-color,border-color,box-shadow] hover:border-accent hover:bg-action hover:text-white hover:shadow-[0_8px_24px_rgba(10,132,255,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60"
              >
                <span>{networkState === "loading-more" ? "Loading…" : `Load ${nextPageCount} more`}</span>
                <span className="text-xs font-medium">
                  {remainingCount} remaining
                </span>
              </button>
            ) : (
              <p className="inline-flex items-center gap-2 text-xs font-medium text-faint">
                <span className="size-1.5 rounded-full bg-new" />
                All {visibleJobs.length} {visibleJobs.length === 1 ? "role" : "roles"}{" "}
                loaded
              </p>
            )}
          </div>
        )}
      </section>

      <ApplicationTrackingTransfer
        exportJson={exportTrackingJson}
        exportCsv={exportTrackingCsv}
        importJson={importTrackingJson}
        importCsv={importTrackingCsv}
        ready={savedReady && applicationsReady}
        storageAvailable={trackingStorageAvailable}
        unmatchedCount={
          Object.keys(unmatchedRecords).length +
          Object.keys(savedStore.unmatched).length
        }
      />

      {stageAnnouncement && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-4 z-[130] max-w-[calc(100vw-2rem)] rounded-xl border border-border-strong bg-raised px-4 py-3 text-sm font-semibold text-fg shadow-[0_18px_48px_rgba(0,0,0,0.75)]"
        >
          {stageAnnouncement}
        </div>
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(
    (entry) => typeof entry === "string",
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isJobPage(value: unknown): value is JobPage {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.facets)) {
    return false;
  }
  if (!isRecord(value.roleTotals) || typeof value.total !== "number") return false;
  if (value.nextCursor !== null && typeof value.nextCursor !== "string") return false;
  if (typeof value.hasMore !== "boolean") return false;
  return value.items.every(
    (job) =>
      isRecord(job) &&
      typeof job.id === "string" &&
      typeof job.tracking_key === "string" &&
      typeof job.title === "string" &&
      typeof job.link === "string",
  );
}

function SearchInput({
  inputRef,
  value,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search company, role, or city…  ( / )"
      aria-label="Search company, role, or city"
      className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-sm outline-none placeholder:text-faint focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:w-full lg:max-w-xs lg:flex-none"
    />
  );
}

function ViewToggle({
  view,
  ready,
  onChange,
}: {
  view: ViewMode;
  ready: boolean;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <div
      data-view-toggle-ready={ready}
      aria-hidden={!ready}
      className={`inline-flex rounded-full border border-border bg-surface p-1 ${
        ready ? "" : "invisible pointer-events-none"
      }`}
      role="group"
      aria-label="View density"
    >
      {(
        [
          ["card", "Card view", <CardIcon key="card" />],
          ["table", "Table view", <TableIcon key="table" />],
        ] as Array<[ViewMode, string, React.ReactNode]>
      ).map(([key, label, icon]) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={view === key}
          disabled={!ready}
          tabIndex={ready ? 0 : -1}
          onClick={() => onChange(key)}
          className={`rounded-full p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
            view === key ? "bg-raised text-fg" : "text-faint hover:text-fg"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function EmptyState({
  loadError,
  jobs,
  filters,
  locationLabels,
}: {
  loadError: boolean;
  jobs: Internship[];
  filters: BoardFilters;
  locationLabels: string[];
}) {
  if (loadError) return <>Couldn&apos;t load listings — try refreshing in a minute.</>;
  if (filters.collection === "saved") {
    return <>No To apply roles match these filters — add one with its star button.</>;
  }
  if (filters.stages.length > 0) {
    return <>No jobs are currently in the selected application stages.</>;
  }
  if (filters.remoteOnly) {
    return <>No explicitly remote roles match the other selected filters.</>;
  }
  if (filters.visaSponsorship) {
    return <>No roles explicitly marked as sponsoring match the other filters.</>;
  }
  if (locationLabels.length > 0) {
    return (
      <>
        No roles match {locationLabels.join(" or ")}. Try another location or
        clear the location filter.
      </>
    );
  }
  if (jobs.length === 0) {
    return <>No listings yet — the first ingestion run hasn&apos;t landed.</>;
  }
  return <>Nothing matches those filters. Try clearing one or two.</>;
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="10" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

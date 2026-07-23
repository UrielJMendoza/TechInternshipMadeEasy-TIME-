"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AdvancedFilterPanel } from "@/components/AdvancedFilterPanel";
import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  getApplicationStage,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import {
  activeFilterCount,
  publicBoardFilterCount,
  publicBoardUrl,
  type BoardFilters,
  type MajorId,
  type SortKey,
  type ViewMode,
} from "@/lib/boardFilterState";
import {
  MINIMUM_SALARY_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/boardOptions";
import { filterAndSortJobs } from "@/lib/jobFilters";
import {
  PHYSICAL_LOCATION_FACETS,
  buildLocationFacetOptions,
  countRemoteJobs,
  type PhysicalLocationFacetId,
} from "@/lib/jobLocations";
import {
  missingJobEvidence,
  similarJobsFor,
} from "@/lib/jobPresentation";
import { MAJORS, MAJORS_BY_ID } from "@/lib/jobTaxonomy";
import {
  HOT_DAYS,
  NEW_DAYS,
  daysAgo,
  relativeTimestamp,
} from "@/lib/jobTime";
import type { Internship, RoleType } from "@/lib/types";
import { useApplicationTracking } from "@/hooks/useApplicationTracking";
import { useBoardFilters } from "@/hooks/useBoardFilters";
import {
  usePersistentSet,
  usePersistentString,
} from "@/hooks/useLocalStorageState";
import {
  FilterChip,
  LocationFilterMenu,
  QuickToggle,
} from "@/components/BoardFilterControls";
import { JobCard } from "@/components/JobCard";
import { JobDetailsDrawer } from "@/components/JobDetailsDrawer";
import { JobTable } from "@/components/JobTable";
import { MobileFilterSheet } from "@/components/MobileFilterSheet";
import { SavedSearchButton } from "@/components/SavedSearchButton";
import { ShareControls } from "@/components/ShareControls";
import {
  trackFilter,
  trackJobOpened,
  trackJobSaved,
  trackSearch,
  trackStageChanged,
} from "@/lib/analytics";

const PAGE_SIZE = 30;
const LOCATION_LABELS = new Map<PhysicalLocationFacetId, string>(
  PHYSICAL_LOCATION_FACETS.map((location) => [location.id, location.label]),
);

function isViewMode(value: string): value is ViewMode {
  return value === "card" || value === "table";
}

export function Board({
  jobs,
  loadError,
  partialData,
  generatedAt,
  updatedAt,
}: {
  jobs: Internship[];
  loadError: boolean;
  partialData: boolean;
  generatedAt: string;
  updatedAt: string | null;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const now = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const { filters, ready: filtersReady, updateFilters, clearFilters } =
    useBoardFilters();
  const [view, setView] = usePersistentString<ViewMode>(
    "timley:view",
    "card",
    isViewMode,
  );
  const [saved, toggleSaved] = usePersistentSet("timley:saved");
  const { records, updateStage, ensureSaved } = useApplicationTracking(jobs);
  const [pagination, setPagination] = useState({
    key: "",
    count: PAGE_SIZE,
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<Internship | null>(null);
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
    freshness,
    collection,
    sort,
    stages,
    remoteOnly,
    visaSponsorship,
    minimumSalary,
  } = filters;

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
        const visibleSearch = [
          mobileSearchRef.current,
          desktopSearchRef.current,
        ].find((input) => input && input.getClientRects().length > 0);
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

  const tabJobs = useMemo(
    () => jobs.filter((job) => job.role_type === tab),
    [jobs, tab],
  );
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
    () => buildLocationFacetOptions(tabJobs, locationOrder),
    [locationOrder, tabJobs],
  );
  const stageCounts = useMemo(
    () =>
      Object.fromEntries(
        APPLICATION_STAGES.map((stage) => [
          stage,
          tabJobs.filter(
            (job) => getApplicationStage(records, job.link) === stage,
          ).length,
        ]),
      ) as Record<ApplicationStage, number>,
    [records, tabJobs],
  );

  const filtered = useMemo(
    () =>
      filterAndSortJobs(tabJobs, {
        query,
        locationIds,
        remoteOnly,
        visaSponsorship,
        minimumSalary,
        stages,
        freshness,
        collection,
        sort,
        saved,
        applications: records,
        now,
        matchesMajor: activeMajor.matches,
        matchesNiche: activeNiche.matches,
      }),
    [
      activeMajor,
      activeNiche,
      collection,
      freshness,
      locationIds,
      minimumSalary,
      now,
      query,
      records,
      remoteOnly,
      saved,
      sort,
      stages,
      tabJobs,
      visaSponsorship,
    ],
  );

  useEffect(() => {
    if (!filtersReady || !query.trim()) return;
    const timeout = window.setTimeout(() => {
      trackSearch({
        roleType: tab,
        queryLength: query.trim().length,
        resultCount: filtered.length,
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [filtered.length, filtersReady, query, tab]);

  const paginationKey = useMemo(
    () => filtered.map((job) => job.id).join("\u001f"),
    [filtered],
  );
  const visibleCount =
    pagination.key === paginationKey ? pagination.count : PAGE_SIZE;
  const visibleJobs = filtered.slice(0, visibleCount);
  const remainingCount = Math.max(0, filtered.length - visibleJobs.length);
  const nextPageCount = Math.min(PAGE_SIZE, remainingCount);
  const internCount = jobs.filter(
    (job) => job.role_type === "internship",
  ).length;
  const gradCount = jobs.length - internCount;
  const savedInTab = tabJobs.filter((job) => saved.has(job.link)).length;
  const filterCount = activeFilterCount(filters);
  const dense = view === "table";
  const partialListingCount = useMemo(
    () => jobs.filter((job) => missingJobEvidence(job).length > 0).length,
    [jobs],
  );

  const selectedJob = useMemo(() => {
    if (!selectedSnapshot) return null;
    return (
      jobs.find((job) => job.id === selectedSnapshot.id) ?? {
        ...selectedSnapshot,
        is_active: false,
      }
    );
  }, [jobs, selectedSnapshot]);
  const similarJobs = useMemo(
    () => (selectedJob ? similarJobsFor(selectedJob, jobs) : []),
    [jobs, selectedJob],
  );

  const update = (
    changes: Partial<BoardFilters>,
    mode: "push" | "replace" = "push",
  ) => {
    updateFilters(changes, mode);
    const keys = Object.keys(changes) as Array<keyof BoardFilters>;
    const tracked = new Set<string>();
    for (const key of keys) {
      if (key === "query") continue;
      const filter =
        key === "tab"
          ? "role-type"
          : key === "major" || key === "niche"
            ? "taxonomy"
            : key === "locationIds" || key === "locationOrder"
              ? "location"
              : key === "remoteOnly"
                ? "remote"
                : key === "visaSponsorship"
                  ? "sponsorship"
                  : key === "minimumSalary"
                    ? "pay"
                    : key === "freshness"
                      ? "freshness"
                      : key === "sort"
                        ? "sort"
                        : key === "collection"
                          ? "saved-only"
                          : key === "stages"
                            ? "application-stage"
                            : null;
      if (!filter || tracked.has(filter)) continue;
      tracked.add(filter);
      const value = changes[key];
      const selectionCount = Array.isArray(value)
        ? value.length
        : value === false || value === null || value === undefined
          ? 0
          : 1;
      trackFilter({
        filter,
        enabled: selectionCount > 0,
        selectionCount,
      });
    }
  };
  const switchTab = (nextTab: RoleType) => update({ tab: nextTab });
  const selectMajor = (nextMajor: MajorId) =>
    update({ major: nextMajor, niche: "all" });
  const toggleLocation = (id: PhysicalLocationFacetId) =>
    update({
      locationIds: locationIds.includes(id)
        ? locationIds.filter((selected) => selected !== id)
        : [...locationIds, id],
    });
  const toggleStageFilter = (stage: ApplicationStage) =>
    update({
      stages: stages.includes(stage)
        ? stages.filter((selected) => selected !== stage)
        : [...stages, stage],
    });
  const setRemoteOnly = (next: boolean) =>
    update({
      remoteOnly: next,
      locationIds: next ? [] : locationIds,
    });
  const changeStage = (job: Internship, stage: ApplicationStage) => {
    const previousStage = getApplicationStage(records, job.link);
    updateStage(job.link, stage, job);
    if (stage === "saved" && !saved.has(job.link)) toggleSaved(job.link);
    setStageAnnouncement(
      `${job.company} moved to ${APPLICATION_STAGE_LABELS[stage]}.`,
    );
    trackStageChanged({
      surface: "job-board",
      from: previousStage,
      to: stage,
    });
  };
  const toggleJobSaved = (job: Internship) => {
    const nextSaved = !saved.has(job.link);
    if (nextSaved) ensureSaved(job.link, job);
    toggleSaved(job.link);
    trackJobSaved({
      surface: "job-board",
      roleType: job.role_type,
      category: job.category,
      saved: nextSaved,
    });
  };
  const openDetails = (job: Internship) => {
    setSelectedSnapshot(job);
    trackJobOpened({
      surface: "job-board",
      roleType: job.role_type,
      category: job.category,
    });
  };
  const refresh = () => {
    setIsRefreshing(true);
    window.setTimeout(() => window.location.reload(), 80);
  };

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
    <div className="jobs-app">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-accent-hover">
            Job discovery
          </p>
          <h1 className="mt-1.5 text-3xl font-extrabold tracking-[-0.04em] text-fg sm:text-4xl">
            Browse opportunities
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Search active internship and new-grad listings, inspect the source
            evidence, and keep applications organized.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="ui-card hidden min-w-44 px-3.5 py-2.5 text-xs font-semibold text-faint sm:block">
            <p>
              <span
                key={jobs.length}
                className="motion-value-update font-extrabold text-fg"
              >
                {jobs.length}
              </span>{" "}
              active listings
            </p>
            <p className="mt-0.5">
              {updatedAt
                ? `Last source observation ${relativeTimestamp(updatedAt, now)}`
                : "Source observation unavailable"}
            </p>
          </div>
          <button
            type="button"
            aria-busy={isRefreshing}
            onClick={refresh}
            className="ui-button ui-button--secondary"
          >
            <RefreshIcon />
            <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </header>

      <div
        data-sticky-toolbar
        data-testid="job-toolbar"
        className="sticky top-[4.75rem] z-[var(--layer-sticky)] isolate -mx-4 mt-5 border-y border-border bg-bg/95 px-4 py-3 shadow-[var(--shadow-sticky)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="ui-tabs" role="tablist" aria-label="Role type">
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
                className="ui-tab whitespace-nowrap sm:px-4"
              >
                {label}
                <span className="ml-1.5 text-xs font-medium text-current">
                  {count}
                </span>
              </button>
            ))}
          </div>
          <p className="hidden text-xs font-medium text-faint md:block">
            Press <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono">/</kbd>{" "}
            to search
          </p>
        </div>

        <div className="mt-3 lg:hidden">
          <SearchInput
            inputRef={mobileSearchRef}
            value={query}
            onChange={(value) => update({ query: value }, "replace")}
            large
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className={`ui-button min-h-11 flex-1 ${
                filterCount > 0 ? "ui-selected" : "ui-button--secondary"
              }`}
            >
              <FilterIcon />
              Filters
              {filterCount > 0 && (
                <span className="inline-flex size-5 items-center justify-center rounded-md bg-accent text-[10px] text-on-accent">
                  {filterCount}
                </span>
              )}
            </button>
            <QuickToggle
              label="Remote"
              checked={remoteOnly}
              count={remoteCount}
              onChange={setRemoteOnly}
            />
          </div>
        </div>

        <div className="mt-3 hidden grid-cols-[minmax(18rem,1fr)_auto_auto_auto_auto_auto] items-end gap-2 lg:grid">
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
          <CompactSelect
            label="Major"
            value={major}
            onChange={(value) => selectMajor(value as MajorId)}
            options={MAJORS.map(
              (option) => [option.id, option.label] as const,
            )}
          />
          <CompactSelect
            label="Specialization"
            value={niche}
            onChange={(value) => update({ niche: value })}
            options={activeMajor.niches.map(
              (option) =>
                [
                  option.id,
                  option.label,
                  option.id !== "all" &&
                    (nicheCounts.get(option.id) ?? 0) === 0,
                ] as const,
            )}
          />
          <QuickToggle
            label="Remote"
            checked={remoteOnly}
            count={remoteCount}
            onChange={setRemoteOnly}
          />
          <AdvancedFilterPanel
            filters={filters}
            hotCount={hotCount}
            newCount={newCount}
            savedCount={savedInTab}
            stageCounts={stageCounts}
            onUpdate={(changes) => update(changes)}
            onToggleStage={toggleStageFilter}
          />
        </div>

        {(filterCount > 0 || query) && (
          <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border/70 pt-2.5">
            <div
              className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1"
              aria-label="Active filters"
            >
              {remoteOnly && (
                <FilterChip
                  label="Remote"
                  onRemove={() => setRemoteOnly(false)}
                />
              )}
              {visaSponsorship && (
                <FilterChip
                  label="Visa Sponsorship"
                  onRemove={() => update({ visaSponsorship: false })}
                />
              )}
              {minimumSalary !== "any" && (
                <FilterChip
                  label={
                    MINIMUM_SALARY_OPTIONS.find(
                      ([value]) => value === minimumSalary,
                    )?.[1] ?? "Listed pay"
                  }
                  onRemove={() => update({ minimumSalary: "any" })}
                />
              )}
              {locationIds.map((id, index) => (
                <FilterChip
                  key={id}
                  label={selectedLocationLabels[index]}
                  onRemove={() => toggleLocation(id)}
                />
              ))}
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
                <FilterChip
                  label="Saved"
                  onRemove={() => update({ collection: "all" })}
                />
              )}
              {(major !== "all" || niche !== "all") && (
                <FilterChip
                  label={
                    niche !== "all" ? activeNiche.label : activeMajor.label
                  }
                  onRemove={() =>
                    update({ major: "all", niche: "all" })
                  }
                />
              )}
              {sort !== "featured" && (
                <FilterChip
                  label={
                    SORT_OPTIONS.find(([key]) => key === sort)?.[1] ?? sort
                  }
                  onRemove={() => update({ sort: "featured" })}
                />
              )}
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className="ui-button ui-button--quiet ui-button--sm shrink-0 underline underline-offset-2"
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
          onApply={(nextFilters) => updateFilters(nextFilters, "push")}
        />
      )}

      <section
        id="job-results"
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`role-tab-${tab}`}
        aria-busy={isRefreshing}
        className="scroll-mt-56 rounded-lg"
      >
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2
              key={`${visibleJobs.length}-${filtered.length}-${tabJobs.length}`}
              className="motion-value-update text-sm font-extrabold text-fg"
              aria-live="polite"
            >
              {filtered.length === 0
                ? `0 of ${tabJobs.length} roles`
                : `Showing ${visibleJobs.length} of ${filtered.length} ${
                    filtered.length === 1 ? "role" : "roles"
                  }`}
            </h2>
            <p className="mt-0.5 text-[11px] text-faint">
              Select a role to review its source, pay, and sponsorship evidence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SavedSearchButton filters={filters} />
            <ShareControls
              path={publicBoardUrl(filters)}
              title="Timley filtered job collection"
              kind="filter"
              publicFilterCount={publicBoardFilterCount(filters)}
              compact
            />
            <label className="hidden items-center gap-2 text-xs font-bold text-faint lg:flex">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) =>
                  update({ sort: event.target.value as SortKey })
                }
                aria-label="Sort jobs"
                className="ui-control ui-input h-10 min-h-10 text-muted"
              >
                {SORT_OPTIONS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <span className="hidden xl:inline-flex">
              <ViewToggle view={view} onChange={setView} />
            </span>
          </div>
        </div>

        {isRefreshing && (
          <div
            role="status"
            className="mt-3 flex items-center gap-2 rounded-lg border border-info/25 bg-info-soft px-3.5 py-2.5 text-xs font-semibold text-info"
          >
            <span className="ui-inline-spinner" aria-hidden />
            Refreshing listings while keeping current results visible…
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-error/30 bg-error-soft px-4 py-3"
          >
            <div>
              <p className="text-sm font-extrabold text-error">
                Listings are temporarily unavailable
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Timley could not read the active feed. Try again in a moment.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="ui-button ui-button--secondary ui-button--sm"
            >
              Try again
            </button>
          </div>
        )}

        {partialData && (
          <div
            role="status"
            className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3"
          >
            <p className="text-sm font-extrabold text-warning">
              Partial feed loaded
            </p>
            <p className="mt-0.5 text-xs text-muted">
              A later data page could not be read. Available roles remain
              usable, but the result count may be incomplete.
            </p>
          </div>
        )}

        {!loadError && !partialData && partialListingCount > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Some source listings omit pay, sponsorship, start period, or
            original posting dates. Missing evidence stays unavailable or is
            labeled as an estimate.
          </p>
        )}

        {filtered.length > 0 && (
          <>
            {dense ? (
              <>
                <ul data-job-list className="mt-3 space-y-2.5 xl:hidden">
                  {visibleJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      now={now}
                      dense
                      saved={saved.has(job.link)}
                      stage={getApplicationStage(records, job.link)}
                      onOpenDetails={() => openDetails(job)}
                      onToggleSaved={() => toggleJobSaved(job)}
                      onStageChange={(stage) => changeStage(job, stage)}
                    />
                  ))}
                </ul>
                <div className="mt-3 hidden xl:block">
                  <JobTable
                    jobs={visibleJobs}
                    now={now}
                    saved={saved}
                    applications={records}
                    onOpenDetails={openDetails}
                    onToggleSaved={toggleJobSaved}
                    onStageChange={changeStage}
                  />
                </div>
              </>
            ) : (
              <ul data-job-list className="mt-3 space-y-2.5">
                {visibleJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    now={now}
                    dense={false}
                    saved={saved.has(job.link)}
                    stage={getApplicationStage(records, job.link)}
                    onOpenDetails={() => openDetails(job)}
                    onToggleSaved={() => toggleJobSaved(job)}
                    onStageChange={(stage) => changeStage(job, stage)}
                  />
                ))}
              </ul>
            )}
          </>
        )}

        {filtered.length === 0 && (
          <div className="ui-card mt-3 px-4 py-14 text-center">
            <EmptyState
              loadError={loadError}
              jobs={jobs}
              filters={filters}
              locationLabels={selectedLocationLabels}
              onClear={clearFilters}
            />
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-7 flex flex-col items-center gap-3 border-t border-border/70 pt-6">
            {remainingCount > 0 ? (
              <button
                data-load-more
                data-testid="load-more"
                type="button"
                aria-label={`Load ${nextPageCount} more roles, ${remainingCount} remaining`}
                onClick={() =>
                  setPagination({
                    key: paginationKey,
                    count: Math.min(
                      filtered.length,
                      visibleCount + PAGE_SIZE,
                    ),
                  })
                }
                className="ui-button ui-button--secondary min-h-11 px-5"
              >
                <span>Load {nextPageCount} more</span>
                <span className="text-xs font-medium text-faint">
                  {remainingCount} remaining
                </span>
              </button>
            ) : (
              <p className="inline-flex items-center gap-2 text-xs font-medium text-faint">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                All {filtered.length} {filtered.length === 1 ? "role" : "roles"}{" "}
                loaded
              </p>
            )}
          </div>
        )}
      </section>

      {selectedJob && (
        <JobDetailsDrawer
          job={selectedJob}
          now={now}
          saved={saved.has(selectedJob.link)}
          stage={getApplicationStage(records, selectedJob.link)}
          similarJobs={similarJobs}
          onClose={() => setSelectedSnapshot(null)}
          onToggleSaved={() => toggleJobSaved(selectedJob)}
          onStageChange={(stage) => changeStage(selectedJob, stage)}
          onSelectSimilar={openDetails}
        />
      )}

      {stageAnnouncement && (
        <div
          role="status"
          aria-live="polite"
          className="ui-popover motion-toast fixed right-4 bottom-4 z-[var(--layer-toast)] max-w-[calc(100vw-2rem)] px-4 py-3 text-sm font-semibold"
        >
          {stageAnnouncement}
        </div>
      )}
    </div>
  );
}

function SearchInput({
  inputRef,
  value,
  onChange,
  large = false,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  large?: boolean;
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">Search company, role, or city</span>
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search company, role, or city…"
        aria-label="Search company, role, or city"
        className={`ui-control ui-input w-full pl-10 outline-none ${
          large ? "h-12 text-base" : "h-10"
        }`}
      />
    </label>
  );
}

function CompactSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string, boolean?]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-32">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="ui-control ui-input h-10 max-w-44 text-muted"
      >
        {options.map(([option, optionLabel, disabled]) => (
          <option key={option} value={option} disabled={disabled}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <div className="ui-tabs" role="group" aria-label="Results view">
      {(
        [
          ["card", "Cards", <CardIcon key="card" />],
          ["table", "Table", <TableIcon key="table" />],
        ] as Array<[ViewMode, string, React.ReactNode]>
      ).map(([key, label, icon]) => (
        <button
          key={key}
          type="button"
          aria-label={`${label} view`}
          aria-pressed={view === key}
          onClick={() => onChange(key)}
          className="ui-tab gap-1.5 px-2.5 text-xs"
        >
          {icon}
          {label}
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
  onClear,
}: {
  loadError: boolean;
  jobs: Internship[];
  filters: BoardFilters;
  locationLabels: string[];
  onClear: () => void;
}) {
  let title = "No matching roles";
  let body = "Nothing matches those filters. Try clearing one or two.";
  let canClear = true;

  if (loadError) {
    title = "Listings could not be loaded";
    body = "Use Try again above to request the active feed.";
    canClear = false;
  } else if (filters.collection === "saved") {
    title = "No saved roles here";
    body = "No saved roles match these filters. Save a role with the star button.";
  } else if (filters.stages.length > 0) {
    title = "No roles in these stages";
    body = "No jobs are currently in the selected application stages.";
  } else if (filters.remoteOnly) {
    title = "No remote matches";
    body = "No explicitly remote roles match the other selected filters.";
  } else if (filters.visaSponsorship) {
    title = "No explicit sponsorship matches";
    body =
      "No roles explicitly marked as sponsoring match the other filters.";
  } else if (locationLabels.length > 0) {
    title = "No location matches";
    body = `No roles match ${locationLabels.join(
      " or ",
    )}. Try another location or clear the location filter.`;
  } else if (jobs.length === 0) {
    title = "No active listings yet";
    body = "The first successful ingestion run has not landed.";
    canClear = false;
  }

  return (
    <div className="mx-auto max-w-md">
      <span
        aria-hidden
        className="mx-auto flex size-10 items-center justify-center rounded-lg border border-border bg-raised text-faint"
      >
        <SearchIcon positioned={false} />
      </span>
      <h2 className="mt-3 text-base font-extrabold text-fg">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      {canClear && (
        <button
          type="button"
          onClick={onClear}
          className="ui-button ui-button--secondary mt-4"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function SearchIcon({ positioned = true }: { positioned?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      className={
        positioned
          ? "pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-faint"
          : "text-faint"
      }
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 11a8 8 0 1 0 2 5.5" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="10" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

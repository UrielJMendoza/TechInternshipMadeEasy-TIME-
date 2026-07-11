"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  filterAndSortJobs,
} from "@/lib/jobFilters";
import {
  PHYSICAL_LOCATION_FACETS,
  buildLocationFacetOptions,
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
  StageFilterMenu,
} from "@/components/BoardFilterControls";
import { JobCard, JOB_GRID } from "@/components/JobCard";
import { MobileFilterSheet } from "@/components/MobileFilterSheet";

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
  generatedAt,
  updatedAt,
}: {
  jobs: Internship[];
  loadError: boolean;
  generatedAt: string;
  updatedAt: string | null;
}) {
  const now = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const { filters, ready: filtersReady, updateFilters, clearFilters } =
    useBoardFilters();
  const [view, setView] = usePersistentString<ViewMode>(
    "timley:view",
    "card",
    isViewMode,
  );
  const [saved, toggleSaved] = usePersistentSet("timley:saved");
  const { records, updateStage } = useApplicationTracking();
  const [pagination, setPagination] = useState({
    key: "",
    count: PAGE_SIZE,
  });
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
    freshness,
    collection,
    sort,
    stages,
    remoteOnly,
    visaSponsorship,
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

  const filtered = useMemo(() => {
    return filterAndSortJobs(tabJobs, {
      query,
      locationIds,
      remoteOnly,
      visaSponsorship,
      stages,
      freshness,
      collection,
      sort,
      saved,
      applications: records,
      now,
      matchesMajor: activeMajor.matches,
      matchesNiche: activeNiche.matches,
    });
  }, [
    activeMajor,
    activeNiche,
    collection,
    freshness,
    locationIds,
    now,
    query,
    records,
    remoteOnly,
    saved,
    sort,
    stages,
    tabJobs,
    visaSponsorship,
  ]);

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

  const update = (
    changes: Partial<BoardFilters>,
    mode: "push" | "replace" = "push",
  ) => updateFilters(changes, mode);

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
            Every 2027 tech internship &amp; new grad role in the US — live,
            deduped, refreshed every 2 hours.
          </p>
        </div>
        <p className="text-[13px] font-medium text-faint">
          {jobs.length} open roles
          {updatedAt && <> · updated {relativeTimestamp(updatedAt, now)}</>}
        </p>
      </header>

      <div
        data-sticky-toolbar
        data-testid="job-toolbar"
        className="sticky top-0 z-50 isolate -mx-4 mt-8 border-b border-border/60 bg-bg px-4 pt-3 pb-3 shadow-[0_14px_28px_rgba(0,0,0,0.82)] sm:-mx-6 sm:px-6"
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
            <span className="hidden sm:inline-flex">
              <ViewToggle view={view} onChange={setView} />
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
                ["saved", `Saved ${savedInTab || ""}`.trim()],
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
              const available = (nicheCounts.get(option.id) ?? 0) > 0;
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
                <FilterChip label="Saved" onRemove={() => update({ collection: "all" })} />
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
              {sort !== "featured" && (
                <FilterChip
                  label={SORT_OPTIONS.find(([key]) => key === sort)?.[1] ?? sort}
                  onRemove={() => update({ sort: "featured" })}
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
        <p className="mt-6 text-xs font-medium text-faint" aria-live="polite">
          {filtered.length === 0
            ? `0 of ${tabJobs.length} roles`
            : `Showing ${visibleJobs.length} of ${filtered.length} ${
                filtered.length === 1 ? "role" : "roles"
              }`}
        </p>

        {dense && filtered.length > 0 && (
          <div
            className={`${JOB_GRID} mt-3 hidden px-5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint sm:grid`}
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
          className={dense ? "mt-1 space-y-1" : "mt-3 space-y-2.5"}
        >
          {visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              dense={dense}
              saved={saved.has(job.link)}
              stage={getApplicationStage(records, job.link)}
              onToggleSaved={() => toggleSaved(job.link)}
              onStageChange={(stage) => {
                updateStage(job.link, stage);
                setStageAnnouncement(
                  `${job.company} moved to ${APPLICATION_STAGE_LABELS[stage]}.`,
                );
              }}
            />
          ))}
          {filtered.length === 0 && (
            <li className="rounded-2xl border border-border bg-surface px-4 py-16 text-center text-sm text-muted">
              <EmptyState
                loadError={loadError}
                jobs={jobs}
                filters={filters}
                locationLabels={selectedLocationLabels}
              />
            </li>
          )}
        </ul>

        {filtered.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-3 border-t border-border/70 pt-6">
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
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/45 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent transition-[color,background-color,border-color,box-shadow] hover:border-accent hover:bg-accent hover:text-white hover:shadow-[0_8px_24px_rgba(10,132,255,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span>Load {nextPageCount} more</span>
                <span className="text-xs font-medium opacity-70">
                  {remainingCount} remaining
                </span>
              </button>
            ) : (
              <p className="inline-flex items-center gap-2 text-xs font-medium text-faint">
                <span className="size-1.5 rounded-full bg-new" />
                All {filtered.length} {filtered.length === 1 ? "role" : "roles"}{" "}
                loaded
              </p>
            )}
          </div>
        )}
      </section>

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
  onChange,
}: {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-border bg-surface p-1"
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
    return <>No saved roles match these filters — save a role with the star button.</>;
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Internship, RoleType } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { CompanyLogo } from "./CompanyLogo";

const CATEGORIES: Category[] = ["software", "cloud", "data-ml", "quant", "security", "hardware", "other"];
const HOT_DAYS = 3;
const NEW_DAYS = 14;

type SortKey = "featured" | "newest" | "company" | "salary";
type Freshness = "all" | "hot" | "new";
type Collection = "all" | "saved" | "applied";
type ViewMode = "card" | "table";

const SORTS: Array<[SortKey, string]> = [
  ["featured", "Featured"],
  ["newest", "Newest"],
  ["company", "Company A–Z"],
  ["salary", "Top salary"],
];

// Shared column template so every row lines up into vertical columns on sm+,
// and header labels (table view) align with the data beneath them.
const GRID =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[auto_minmax(0,2.1fr)_6.5rem_minmax(0,1.25fr)_5.5rem_3.25rem_auto] sm:gap-x-4 sm:items-center";

function postedTime(job: Internship): number {
  return job.posted_date
    ? new Date(`${job.posted_date}T00:00:00Z`).getTime()
    : new Date(job.first_seen_at).getTime();
}

function daysAgo(job: Internship, now: number): number {
  return Math.max(0, Math.floor((now - postedTime(job)) / 86_400_000));
}

function relative(job: Internship, now: number): string {
  const days = daysAgo(job, now);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function relativeTimestamp(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "$62/hr" | "$201k/yr" -> approximate annual USD, for sorting only. */
function annualSalary(s: string | null): number {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)\s*(k)?\s*\/\s*(hr|yr|mo)/i);
  if (!m) return 0;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  const unit = m[3].toLowerCase();
  return unit === "hr" ? n * 2080 : unit === "mo" ? n * 12 : n;
}

// ---------------------------------------------------------------------------
// localStorage-backed state. Saved/applied roles are keyed by apply link (a
// stable identity that survives re-ingestion, unlike the DB row id).

function usePersistentSet(key: string): [Set<string>, (id: string) => void, boolean] {
  const [set, setSet] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSet(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* corrupt or unavailable — start empty */
    }
    setReady(true);
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* quota/unavailable — keep in-memory */
        }
        return next;
      });
    },
    [key],
  );

  return [set, toggle, ready];
}

function usePersistentValue<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key) as T | null;
      if (raw) setValue(raw);
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set];
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
  const [tab, setTab] = useState<RoleType>("internship");
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<Category>>(new Set());
  const [location, setLocation] = useState("");
  const [freshness, setFreshness] = useState<Freshness>("all");
  const [collection, setCollection] = useState<Collection>("all");
  const [sort, setSort] = useState<SortKey>("featured");
  const [view, setView] = usePersistentValue<ViewMode>("timley:view", "card");
  const [saved, toggleSaved] = usePersistentSet("timley:saved");
  const [applied, toggleApplied] = usePersistentSet("timley:applied");
  const searchRef = useRef<HTMLInputElement>(null);

  // Shareable tab links: /?tab=new-grad
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "new-grad") {
      setTab("new_grad");
    }
  }, []);
  const switchTab = (next: RoleType) => {
    setTab(next);
    const url = next === "new_grad" ? "?tab=new-grad" : window.location.pathname;
    window.history.replaceState(null, "", url);
  };

  // "/" focuses search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.key === "/" && el?.tagName !== "INPUT" && el?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tabJobs = useMemo(() => jobs.filter((j) => j.role_type === tab), [jobs, tab]);
  const hotCount = useMemo(
    () => tabJobs.filter((j) => daysAgo(j, now) <= HOT_DAYS).length,
    [tabJobs, now],
  );
  const newCount = useMemo(
    () => tabJobs.filter((j) => daysAgo(j, now) <= NEW_DAYS).length,
    [tabJobs, now],
  );

  const locations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of tabJobs) {
      for (const part of j.location.split(";")) {
        const loc = part.trim();
        if (loc) counts.set(loc, (counts.get(loc) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([loc]) => loc);
  }, [tabJobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tabJobs.filter((j) => {
      if (collection === "saved" && !saved.has(j.link)) return false;
      if (collection === "applied" && !applied.has(j.link)) return false;
      if (q && !j.title.toLowerCase().includes(q) && !j.company.toLowerCase().includes(q)) return false;
      if (cats.size > 0 && !cats.has(j.category)) return false;
      if (location === "Remote") {
        if (!/remote/i.test(j.location)) return false;
      } else if (location && !j.location.includes(location)) {
        return false;
      }
      if (freshness === "hot" && daysAgo(j, now) > HOT_DAYS) return false;
      if (freshness === "new" && daysAgo(j, now) > NEW_DAYS) return false;
      return true;
    });

    const byNewest = (a: Internship, b: Internship) =>
      postedTime(b) - postedTime(a) || a.company.localeCompare(b.company);
    switch (sort) {
      case "featured":
        // SWE + cloud float to the top, everything else stays visible below —
        // a default lens, not a filter.
        list.sort((a, b) => {
          const fa = a.category === "software" || a.category === "cloud" ? 0 : 1;
          const fb = b.category === "software" || b.category === "cloud" ? 0 : 1;
          return fa - fb || byNewest(a, b);
        });
        break;
      case "newest":
        list.sort(byNewest);
        break;
      case "company":
        list.sort((a, b) => a.company.localeCompare(b.company) || byNewest(a, b));
        break;
      case "salary":
        list.sort((a, b) => annualSalary(b.salary) - annualSalary(a.salary) || byNewest(a, b));
        break;
    }
    return list;
  }, [tabJobs, query, cats, location, freshness, collection, saved, applied, sort, now]);

  const internCount = jobs.filter((j) => j.role_type === "internship").length;
  const gradCount = jobs.length - internCount;
  const savedInTab = useMemo(() => tabJobs.filter((j) => saved.has(j.link)).length, [tabJobs, saved]);
  const appliedInTab = useMemo(
    () => tabJobs.filter((j) => applied.has(j.link)).length,
    [tabJobs, applied],
  );
  const hasFilters =
    cats.size > 0 || location !== "" || query !== "" || freshness !== "all" || collection !== "all";

  const toggleCat = (c: Category) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const dense = view === "table";

  return (
    <div>
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            timley<span className="text-accent">.</span>
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            Every 2027 tech internship &amp; new grad role in the US — live, deduped, refreshed every 2 hours.
          </p>
        </div>
        <p className="text-[13px] font-medium text-faint">
          {jobs.length} open roles
          {updatedAt && <> · updated {relativeTimestamp(updatedAt, now)}</>}
        </p>
      </header>

      {/* Toolbar — sticky while scrolling the list */}
      <div className="sticky top-0 z-10 -mx-4 mt-8 border-b border-border/60 bg-bg/85 px-4 pt-3 pb-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tabs — segmented control */}
          <div className="inline-flex rounded-full border border-border bg-surface p-1" role="tablist">
            {(
              [
                ["internship", "Internships", internCount],
                ["new_grad", "New Grad", gradCount],
              ] as Array<[RoleType, string, number]>
            ).map(([key, label, count]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => switchTab(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  tab === key ? "bg-fg text-bg" : "text-muted hover:text-fg"
                }`}
              >
                {label}
                <span className={`ml-1.5 text-xs font-medium ${tab === key ? "text-bg/60" : "text-faint"}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Freshness */}
            <div className="inline-flex rounded-full border border-border bg-surface p-1">
              {(
                [
                  ["all", "All", null],
                  ["hot", `Hot ${hotCount}`, "hot"],
                  ["new", `New ${newCount}`, "new"],
                ] as Array<[Freshness, string, string | null]>
              ).map(([key, label, tone]) => (
                <button
                  key={key}
                  aria-pressed={freshness === key}
                  onClick={() => setFreshness(key)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
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

            {/* View density */}
            <div className="inline-flex rounded-full border border-border bg-surface p-1" role="group" aria-label="View density">
              {(
                [
                  ["card", "Card view", <CardIcon key="c" />],
                  ["table", "Table view", <TableIcon key="t" />],
                ] as Array<[ViewMode, string, React.ReactNode]>
              ).map(([key, label, icon]) => (
                <button
                  key={key}
                  aria-label={label}
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={`rounded-full p-1.5 transition-colors ${
                    view === key ? "bg-raised text-fg" : "text-faint hover:text-fg"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company or role…  ( / )"
            aria-label="Search company or role"
            className="h-10 w-full max-w-xs rounded-xl border border-border bg-surface px-3.5 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-label="Filter by location"
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-muted focus:border-accent"
          >
            <option value="">All locations</option>
            <option value="Remote">Remote</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            className="h-10 rounded-xl border border-border bg-surface px-3 text-sm text-muted focus:border-accent"
          >
            {SORTS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          {/* Collections */}
          <div className="inline-flex rounded-xl border border-border bg-surface p-1">
            {(
              [
                ["all", "All"],
                ["saved", `Saved ${savedInTab || ""}`.trim()],
                ["applied", `Applied ${appliedInTab || ""}`.trim()],
              ] as Array<[Collection, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={collection === key}
                onClick={() => setCollection(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  collection === key ? "bg-raised text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => toggleCat(c)}
                aria-pressed={cats.has(c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cats.has(c)
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
            {hasFilters && (
              <button
                onClick={() => {
                  setCats(new Set());
                  setLocation("");
                  setQuery("");
                  setFreshness("all");
                  setCollection("all");
                }}
                className="px-2 py-1 text-xs font-medium text-faint underline underline-offset-2 hover:text-muted"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Result count */}
      <p className="mt-6 text-xs font-medium text-faint">
        {filtered.length === tabJobs.length
          ? `${tabJobs.length} roles`
          : `${filtered.length} of ${tabJobs.length} roles`}
      </p>

      {/* Column headers — only in the dense table view */}
      {dense && filtered.length > 0 && (
        <div
          className={`${GRID} mt-3 hidden px-5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint sm:grid`}
        >
          <span />
          <span>Company / Role</span>
          <span>Category</span>
          <span>Location</span>
          <span>Comp</span>
          <span className="text-right">Age</span>
          <span />
        </div>
      )}

      {/* List */}
      <ul className={dense ? "mt-1 space-y-1" : "mt-3 space-y-2.5"}>
        {filtered.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            now={now}
            dense={dense}
            saved={saved.has(job.link)}
            applied={applied.has(job.link)}
            onToggleSaved={() => toggleSaved(job.link)}
            onToggleApplied={() => toggleApplied(job.link)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-border bg-surface px-4 py-16 text-center text-sm text-muted">
            {loadError
              ? "Couldn't load listings — try refreshing in a minute."
              : collection === "saved"
                ? "No saved roles yet — tap the ☆ on any role to save it."
                : collection === "applied"
                  ? "Nothing marked applied yet — tap the ✓ once you apply."
                  : jobs.length === 0
                    ? "No listings yet — the first ingestion run hasn't landed."
                    : "Nothing matches those filters."}
          </li>
        )}
      </ul>
    </div>
  );
}

function JobRow({
  job,
  now,
  dense,
  saved,
  applied,
  onToggleSaved,
  onToggleApplied,
}: {
  job: Internship;
  now: number;
  dense: boolean;
  saved: boolean;
  applied: boolean;
  onToggleSaved: () => void;
  onToggleApplied: () => void;
}) {
  const days = daysAgo(job, now);
  const logoSize = dense ? 28 : 40;

  return (
    <li>
      <div
        className={`group relative ${GRID} rounded-2xl border border-border bg-surface transition-[border-color,box-shadow,background-color] hover:border-white/25 hover:bg-surface/70 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] ${
          dense ? "px-3 py-2 sm:px-5" : "px-4 py-4 sm:px-5"
        } ${applied ? "opacity-60" : ""}`}
      >
        {/* Stretched click target — opens the listing. Sits beneath the
            content; the save/apply buttons opt back into pointer events. */}
        <a
          href={job.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${job.title} at ${job.company} — open listing`}
          className="absolute inset-0 z-0 rounded-2xl"
        />

        {/* Logo */}
        <span className="pointer-events-none relative z-10 row-span-2 sm:row-span-1">
          <CompanyLogo company={job.company} size={logoSize} />
        </span>

        {/* Company + role */}
        <div className="pointer-events-none relative z-10 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`truncate font-semibold ${dense ? "text-[13px]" : "text-[15px]"}`}>
              {job.company}
            </span>
            <FreshnessBadge days={days} />
            {job.season && !dense && (
              <span className="hidden text-[11px] font-medium text-faint md:inline">{job.season}</span>
            )}
          </div>
          <div className={`mt-0.5 truncate text-muted ${dense ? "text-xs" : "text-sm"}`} title={job.title}>
            {job.title}
          </div>
        </div>

        {/* Category */}
        <div className="pointer-events-none relative z-10 col-start-2 row-start-2 flex items-center sm:col-start-3 sm:row-start-1">
          <span className={`cat cat-${job.category}`}>{CATEGORY_LABELS[job.category]}</span>
        </div>

        {/* Location */}
        <div className="pointer-events-none relative z-10 col-start-2 row-start-2 flex min-w-0 items-center sm:col-start-4 sm:row-start-1">
          <span className="hidden truncate text-xs text-muted sm:inline" title={job.location}>
            {job.location || "—"}
          </span>
        </div>

        {/* Comp / rules */}
        <div className="pointer-events-none relative z-10 hidden min-w-0 flex-col items-start justify-center sm:col-start-5 sm:row-start-1 sm:flex">
          {job.salary && <span className="truncate text-xs font-semibold text-fg/80">{job.salary}</span>}
          {job.sponsorship && (
            <span className="truncate text-[10px] font-medium text-faint">
              {job.sponsorship.includes("citizen")
                ? "Citizens only"
                : job.sponsorship.includes("offers")
                  ? "Sponsors visa"
                  : "No sponsorship"}
            </span>
          )}
        </div>

        {/* Age */}
        <div className="pointer-events-none relative z-10 col-start-3 row-start-2 flex items-center justify-end sm:col-start-6 sm:row-start-1">
          <span className="text-right text-xs font-medium text-faint" title={job.posted_date ?? undefined}>
            {relative(job, now)}
          </span>
        </div>

        {/* Actions */}
        <div className="pointer-events-none relative z-10 col-start-3 row-start-1 flex items-center justify-end gap-1 justify-self-end sm:col-start-7">
          <IconButton
            label={saved ? "Remove from saved" : "Save role"}
            active={saved}
            onClick={onToggleSaved}
          >
            <StarIcon filled={saved} />
          </IconButton>
          <IconButton
            label={applied ? "Mark not applied" : "Mark as applied"}
            active={applied}
            activeClass="text-new"
            onClick={onToggleApplied}
          >
            <CheckIcon />
          </IconButton>
          {!dense && (
            <span className="ml-1 hidden rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-white sm:inline">
              Apply
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function FreshnessBadge({ days }: { days: number }) {
  if (days <= HOT_DAYS) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide text-hot">
        <span className="size-1.5 animate-pulse rounded-full bg-hot" />
        HOT
      </span>
    );
  }
  if (days <= NEW_DAYS) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide text-new">
        <span className="size-1.5 rounded-full bg-new" />
        NEW
      </span>
    );
  }
  return null;
}

function IconButton({
  label,
  active,
  activeClass = "text-hot",
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  activeClass?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`pointer-events-auto flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-raised ${
        active ? activeClass : "text-faint hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline icons (no dependency).

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
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

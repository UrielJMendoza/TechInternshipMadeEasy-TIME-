"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Internship, RoleType } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";

const CATEGORIES: Category[] = ["software", "cloud", "data-ml", "quant", "security", "hardware", "other"];
const HOT_DAYS = 3;
const NEW_DAYS = 14;

type SortKey = "featured" | "newest" | "company" | "salary";
type Freshness = "all" | "hot" | "new";

const SORTS: Array<[SortKey, string]> = [
  ["featured", "Featured"],
  ["newest", "Newest"],
  ["company", "Company A–Z"],
  ["salary", "Top salary"],
];

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

// Deterministic avatar color per company, drawn from the iOS dark palette.
const AVATAR_COLORS = [
  "10, 132, 255", // blue
  "100, 210, 255", // teal
  "191, 90, 242", // purple
  "255, 214, 10", // yellow
  "255, 159, 10", // orange
  "48, 209, 88", // green
  "255, 55, 95", // pink
  "172, 142, 104", // brown
];

function avatarColor(company: string): string {
  let h = 0;
  for (let i = 0; i < company.length; i++) h = (h * 31 + company.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
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
  const [sort, setSort] = useState<SortKey>("featured");
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
  }, [tabJobs, query, cats, location, freshness, sort, now]);

  const internCount = jobs.filter((j) => j.role_type === "internship").length;
  const gradCount = jobs.length - internCount;
  const hasFilters = cats.size > 0 || location !== "" || query !== "" || freshness !== "all";

  const toggleCat = (c: Category) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

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

      {/* List */}
      <ul className="mt-3 space-y-2.5">
        {filtered.map((job) => (
          <JobRow key={job.id} job={job} now={now} />
        ))}
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-border bg-surface px-4 py-16 text-center text-sm text-muted">
            {loadError
              ? "Couldn't load listings — try refreshing in a minute."
              : jobs.length === 0
                ? "No listings yet — the first ingestion run hasn't landed."
                : "Nothing matches those filters."}
          </li>
        )}
      </ul>
    </div>
  );
}

function JobRow({ job, now }: { job: Internship; now: number }) {
  const days = daysAgo(job, now);
  const rgb = avatarColor(job.company);
  return (
    <li>
      <a
        href={job.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-surface px-4 py-4 transition-colors hover:border-border-strong hover:bg-raised sm:grid-cols-[auto_minmax(0,2.1fr)_minmax(0,1.3fr)_auto_auto] sm:px-5"
      >
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-xl text-base font-bold"
          style={{ background: `rgba(${rgb}, 0.15)`, color: `rgb(${rgb})` }}
        >
          {job.company.charAt(0).toUpperCase()}
        </span>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{job.company}</span>
            {days <= HOT_DAYS ? (
              <span className="rounded-full bg-hot-soft px-2 py-px text-[10px] font-bold tracking-wide text-hot">
                HOT
              </span>
            ) : days <= NEW_DAYS ? (
              <span className="rounded-full bg-new-soft px-2 py-px text-[10px] font-bold tracking-wide text-new">
                NEW
              </span>
            ) : null}
            {job.season && (
              <span className="hidden text-[11px] font-medium text-faint md:inline">{job.season}</span>
            )}
          </div>
          <div className="mt-1 truncate text-sm text-muted" title={job.title}>
            {job.title}
          </div>
        </div>

        <div className="col-start-2 row-start-2 flex min-w-0 items-center gap-2 sm:col-start-3 sm:row-start-1">
          <span className={`cat cat-${job.category}`}>{CATEGORY_LABELS[job.category]}</span>
          <span className="truncate text-xs text-muted" title={job.location}>
            {job.location || "—"}
          </span>
          {job.sponsorship && (
            <span className="hidden whitespace-nowrap text-[10px] font-medium text-faint lg:inline">
              {job.sponsorship.includes("citizen") ? "Citizens only" : "No sponsorship"}
            </span>
          )}
        </div>

        <div className="col-start-3 row-start-2 flex items-center gap-3 justify-self-end sm:col-start-4 sm:row-start-1">
          {job.salary && <span className="text-xs font-semibold text-fg/80">{job.salary}</span>}
          <span className="w-14 text-right text-xs font-medium text-faint" title={job.posted_date ?? undefined}>
            {relative(job, now)}
          </span>
        </div>

        <span className="col-start-3 row-start-1 justify-self-end rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-white sm:col-start-5">
          Apply
        </span>
      </a>
    </li>
  );
}

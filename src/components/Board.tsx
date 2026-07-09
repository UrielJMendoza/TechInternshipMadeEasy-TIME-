"use client";

import { useMemo, useState } from "react";
import type { Category, Internship, RoleType } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";

const CATEGORIES: Category[] = ["software", "cloud", "data-ml", "quant", "security", "hardware", "other"];
const FRESH_MS = 48 * 60 * 60 * 1000;

type SortKey = "featured" | "newest" | "company" | "salary";

const SORTS: Array<[SortKey, string]> = [
  ["featured", "Featured — SWE/Cloud first"],
  ["newest", "Newest"],
  ["company", "Company A–Z"],
  ["salary", "Top salary"],
];

function postedTime(job: Internship): number {
  return job.posted_date
    ? new Date(`${job.posted_date}T00:00:00Z`).getTime()
    : new Date(job.first_seen_at).getTime();
}

function relative(job: Internship, now: number): string {
  const days = Math.max(0, Math.floor((now - postedTime(job)) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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

function isFresh(job: Internship, now: number): boolean {
  return now - new Date(job.first_seen_at).getTime() < FRESH_MS;
}

export function Board({
  jobs,
  loadError,
  generatedAt,
}: {
  jobs: Internship[];
  loadError: boolean;
  generatedAt: string;
}) {
  const now = useMemo(() => new Date(generatedAt).getTime(), [generatedAt]);
  const [tab, setTab] = useState<RoleType>("internship");
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState<Set<Category>>(new Set());
  const [location, setLocation] = useState("");
  const [freshOnly, setFreshOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("featured");

  const tabJobs = useMemo(() => jobs.filter((j) => j.role_type === tab), [jobs, tab]);

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
      if (freshOnly && !isFresh(j, now)) return false;
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
  }, [tabJobs, query, cats, location, freshOnly, sort, now]);

  const freshCount = useMemo(() => tabJobs.filter((j) => isFresh(j, now)).length, [tabJobs, now]);
  const internCount = jobs.filter((j) => j.role_type === "internship").length;
  const gradCount = jobs.length - internCount;

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
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            TIME<span className="text-accent">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live 2027 tech internships &amp; new grad roles — updated every 2 hours.
          </p>
        </div>
        <p className="text-xs font-medium text-faint">
          {jobs.length} open roles · <span className="text-new">{freshCount} new in 48h</span>
        </p>
      </header>

      {/* Tabs — segmented control */}
      <div
        className="mt-6 inline-flex rounded-full border border-border bg-surface p-1"
        role="tablist"
      >
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
            onClick={() => setTab(key)}
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

      {/* Controls */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company or role…"
            aria-label="Search company or role"
            className="h-9 w-full max-w-xs rounded-lg border border-border bg-surface px-3 text-sm outline-none placeholder:text-faint focus:border-accent"
          />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-label="Filter by location"
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-muted focus:border-accent"
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
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-muted focus:border-accent"
          >
            {SORTS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setFreshOnly((v) => !v)}
            aria-pressed={freshOnly}
            className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              freshOnly
                ? "border-new/50 bg-new-soft text-new"
                : "border-border bg-surface text-muted hover:text-fg"
            }`}
          >
            Last 48h
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => toggleCat(c)}
              aria-pressed={cats.has(c)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                cats.has(c)
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
          {(cats.size > 0 || location || query || freshOnly) && (
            <button
              onClick={() => {
                setCats(new Set());
                setLocation("");
                setQuery("");
                setFreshOnly(false);
              }}
              className="px-2 py-1 text-xs text-faint underline hover:text-muted"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      <p className="mt-4 text-xs font-medium text-faint">
        {filtered.length === tabJobs.length
          ? `${tabJobs.length} roles`
          : `${filtered.length} of ${tabJobs.length} roles`}
      </p>

      {/* List */}
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {filtered.map((job) => (
          <JobRow key={job.id} job={job} now={now} />
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-12 text-center text-sm text-muted">
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
  const fresh = isFresh(job, now);
  return (
    <li>
      <a
        href={job.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-raised sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_auto_auto]"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">{job.company}</span>
            {fresh && (
              <span className="rounded-full bg-new-soft px-2 py-px text-[10px] font-bold tracking-wide text-new">
                NEW
              </span>
            )}
            {job.season && <span className="hidden text-[11px] font-medium text-faint md:inline">{job.season}</span>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-muted" title={job.title}>
              {job.title}
            </span>
          </div>
        </div>

        <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 sm:col-start-2 sm:row-start-1">
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

        <div className="col-start-2 row-start-2 flex items-center gap-3 justify-self-end sm:col-start-3 sm:row-start-1">
          {job.salary && <span className="text-xs font-semibold text-fg/80">{job.salary}</span>}
          <span className="w-14 text-right text-xs font-medium text-faint" title={job.posted_date ?? undefined}>
            {relative(job, now)}
          </span>
        </div>

        <span className="col-start-2 row-start-1 justify-self-end rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-white sm:col-start-4">
          Apply
        </span>
      </a>
    </li>
  );
}

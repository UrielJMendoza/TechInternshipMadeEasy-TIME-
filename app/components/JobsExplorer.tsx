"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { JobCard } from "./JobCard";
import type { JobCardData, JobFilters } from "./job-types";

type JobsExplorerProps = {
  initialJobs: JobCardData[];
  initialCursor: string | null;
  initialFilters: JobFilters;
  initialQuery: string;
  total: number;
  majorOptions: Array<{
    id: JobFilters["major"];
    label: string;
    niches: Array<{ id: string; label: string }>;
  }>;
};

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

type CompanyJobGroup = {
  key: string;
  company: string;
  items: JobCardData[];
};

function groupAdjacentCompanies(jobs: JobCardData[]): CompanyJobGroup[] {
  const groups: CompanyJobGroup[] = [];

  for (const job of jobs) {
    const previous = groups.at(-1);
    if (previous?.company === job.company) {
      previous.items.push(job);
    } else {
      groups.push({
        key: `${job.company}\u001f${job.id}`,
        company: job.company,
        items: [job],
      });
    }
  }

  return groups;
}

export function JobsExplorer({
  initialJobs,
  initialCursor,
  initialFilters,
  initialQuery,
  total,
  majorOptions,
}: JobsExplorerProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [totalCount, setTotalCount] = useState(total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paginationStatus, setPaginationStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [major, setMajor] = useState<JobFilters["major"]>(initialFilters.major);
  const [niche, setNiche] = useState(initialFilters.niche);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [collapsedCompanyGroups, setCollapsedCompanyGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const activeMajor = majorOptions.find((option) => option.id === major) ?? majorOptions[0];
  const companyGroups = useMemo(() => groupAdjacentCompanies(jobs), [jobs]);
  const returnPath = initialQuery ? `/jobs?${initialQuery}` : "/jobs";
  const cacheKey = `timley:results:${returnPath}`;
  useEffect(() => {
    if (!window.location.hash.startsWith("#listing-")) return;
    let frame = 0;
    try {
      const stored = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null");
      if (!stored || stored.query !== initialQuery || Date.now() - stored.savedAt > 10 * 60_000 ||
          !Array.isArray(stored.jobs) || stored.jobs.length > 720 || !stored.jobs.every((job: JobCardData) =>
            typeof job?.id === "string" && typeof job.title === "string" && typeof job.company === "string" &&
            typeof job.applyUrl === "string" && job.applyUrl.startsWith("https://"))) return;
      frame = requestAnimationFrame(() => {
        setJobs(stored.jobs);
        setCursor(typeof stored.cursor === "string" ? stored.cursor : null);
        setTotalCount(typeof stored.total === "number" ? stored.total : total);
        setCollapsedCompanyGroups(new Set(Array.isArray(stored.collapsed) ? stored.collapsed : []));
        frame = requestAnimationFrame(() => window.scrollTo(0, Math.max(0, Number(stored.scrollY) || 0)));
      });
    } catch { /* Fresh server results remain available when session storage is blocked. */ }
    return () => cancelAnimationFrame(frame);
  }, [cacheKey, initialQuery, total]);

  function preserveResults(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target.closest('a[href^="/jobs/"]') : null;
    if (!target) return;
    try {
      if (jobs.length > 720) { sessionStorage.removeItem(cacheKey); return; }
      const keys = Object.keys(sessionStorage).filter(key => key.startsWith("timley:results:"));
      for (const key of keys.slice(0, Math.max(0, keys.length - 5))) sessionStorage.removeItem(key);
      sessionStorage.setItem(cacheKey, JSON.stringify({query:initialQuery,jobs,cursor,total:totalCount,
        collapsed:[...collapsedCompanyGroups],scrollY:window.scrollY,savedAt:Date.now()}));
    } catch { /* The filtered return URL still works without session storage. */ }
  }

  const filterChips = Object.entries(initialFilters).flatMap(([key,value]) => {
    if (!value || value === "all") return [];
    const params = new URLSearchParams(initialQuery);
    params.delete(key);
    if (key === "major") params.delete("niche");
    const label = key === "sponsorship" ? "Confirmed sponsorship" : key === "remote" ? "Remote" : String(value).replace(/-/g," ");
    return [{key,label,href:params.size ? `/jobs?${params}` : "/jobs"}];
  });
  const activeAdvancedFilterCount = [
    Boolean(initialFilters.location),
    initialFilters.major !== "all",
    initialFilters.niche !== "all",
    initialFilters.remote,
    initialFilters.sponsorship,
    Boolean(initialFilters.company),
    Boolean(initialFilters.source),
  ].filter(Boolean).length;
  const hasActiveFilters = Boolean(
    initialFilters.q ||
    initialFilters.company ||
    initialFilters.location ||
    initialFilters.remote ||
    initialFilters.sponsorship ||
    initialFilters.source ||
    initialFilters.level !== "all" ||
    initialFilters.major !== "all" ||
    initialFilters.niche !== "all"
  );

  function levelHref(level: JobFilters["level"]) {
    const params = new URLSearchParams(initialQuery);
    if (level === "all") params.delete("level");
    else params.set("level", level);
    params.delete("cursor");
    const query = params.toString();
    return query ? `/jobs?${query}` : "/jobs";
  }

  function toggleCompanyGroup(groupKey: string) {
    setCollapsedCompanyGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    setPaginationStatus("");
    try {
      const params = new URLSearchParams(initialQuery);
      params.set("cursor", cursor);
      const response = await fetch(`/api/jobs?${params.toString()}`, {signal: AbortSignal.timeout(15_000)});
      if (response.status === 409) {
        const problem = (await response.json()) as { code?: string };
        if (problem.code !== "CURSOR_REFRESH_REQUIRED") {
          throw new Error("Unable to refresh jobs");
        }
        const refreshParams = new URLSearchParams(initialQuery);
        refreshParams.delete("cursor");
        const refreshResponse = await fetch(`/api/jobs?${refreshParams.toString()}`, {signal: AbortSignal.timeout(15_000)});
        if (!refreshResponse.ok) throw new Error("Unable to refresh jobs");
        const refreshed = (await refreshResponse.json()) as {
          items: JobCardData[];
          nextCursor: string | null;
          total: number;
        };
        setJobs(refreshed.items);
        setCursor(refreshed.nextCursor);
        setTotalCount(refreshed.total);
        setPaginationStatus("Results refreshed with the same filters because the feed changed.");
        return;
      }
      if (!response.ok) throw new Error("Unable to load more jobs");
      const page = (await response.json()) as {
        items: JobCardData[];
        nextCursor: string | null;
        total: number;
      };
      setJobs((current) => {
        const known = new Set(current.map((job) => job.id));
        return [...current, ...page.items.filter((job) => !known.has(job.id))];
      });
      setCursor(page.nextCursor);
      setTotalCount(page.total);
    } catch {
      setError("We couldn’t load the next page. Your current results are still here. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copySearch() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied");
      window.setTimeout(() => setShareStatus(""), 8000);
    } catch {
      const temporary = document.createElement("textarea");
      temporary.value = url;
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.appendChild(temporary);
      temporary.select();
      const copied = document.execCommand("copy");
      temporary.remove();
      setShareStatus(copied ? "Link copied" : "Copy the address from your browser");
      if (copied) window.setTimeout(() => setShareStatus(""), 8000);
    }
  }

  function cleanSubmission(event: FormEvent<HTMLFormElement>) {
    for (const field of Array.from(event.currentTarget.elements)) {
      if (
        (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) &&
        field.name &&
        field.value.trim() === ""
      ) {
        field.disabled = true;
      }
    }
  }

  return (
    <>
      <section className="filters-panel" aria-label="Job filters">
        <div className="level-tabs" aria-label="Role level">
          <a className={initialFilters.level === "all" ? "selected" : undefined} href={levelHref("all")} aria-current={initialFilters.level === "all" ? "page" : undefined}>All</a>
          <a className={initialFilters.level === "internship" ? "selected" : undefined} href={levelHref("internship")} aria-current={initialFilters.level === "internship" ? "page" : undefined}>Internships</a>
          <a className={initialFilters.level === "new-grad" ? "selected" : undefined} href={levelHref("new-grad")} aria-current={initialFilters.level === "new-grad" ? "page" : undefined}>New grad</a>
        </div>

        <form className="filter-form" action="/jobs" method="get" onSubmit={cleanSubmission}>
          {initialFilters.level !== "all" && <input type="hidden" name="level" value={initialFilters.level} />}
          {initialFilters.company && <input type="hidden" name="company" value={initialFilters.company} />}
          {initialFilters.source && <input type="hidden" name="source" value={initialFilters.source} />}
          <label className="filter-field search-field">
            <span className="field-label">Search</span>
            <input name="q" defaultValue={initialFilters.q} placeholder="Title, company, location, or keyword" autoComplete="off" />
          </label>
          <button
            className="mobile-filter-toggle"
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-job-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <span>Filters ({activeAdvancedFilterCount})</span>
            <span aria-hidden="true">{mobileFiltersOpen ? "−" : "+"}</span>
          </button>
          <div
            className={`advanced-filters${mobileFiltersOpen ? " is-open" : ""}`}
            id="mobile-job-filters"
          >
            <label className="filter-field location-field">
              <span className="field-label">Location</span>
              <input name="location" defaultValue={initialFilters.location} placeholder="City or state" autoComplete="address-level2" />
            </label>
            <label className="filter-field major-field">
              <span className="field-label">Major</span>
              <select
                name="major"
                value={major === "all" ? "" : major}
                onChange={(event) => {
                  setMajor((event.target.value || "all") as JobFilters["major"]);
                  setNiche("all");
                }}
              >
                {majorOptions.map((option) => (
                  <option key={option.id} value={option.id === "all" ? "" : option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field niche-field">
              <span className="field-label">Specialization</span>
              <select
                name="niche"
                value={niche === "all" ? "" : niche}
                onChange={(event) => setNiche(event.target.value || "all")}
                disabled={activeMajor.id === "all"}
              >
                {activeMajor.niches.map((option) => (
                  <option key={option.id} value={option.id === "all" ? "" : option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="remote-toggle">
              <input type="checkbox" name="remote" value="true" defaultChecked={initialFilters.remote} />
              <span aria-hidden="true" />
              Remote
            </label>
            <details className="more-filters">
              <summary>More filters <span aria-hidden="true">＋</span></summary>
              <div className="more-menu">
                <div className="more-menu-heading">
                  <strong>More filters</strong>
                  <span>Visa support</span>
                </div>
                <label className="menu-check" htmlFor="sponsorship-filter" aria-label="Confirmed sponsorship">
                  <input id="sponsorship-filter" type="checkbox" name="sponsorship" value="true" defaultChecked={initialFilters.sponsorship} />
                  <span>
                    <strong>Confirmed sponsorship</strong>
                    <small>Only roles that explicitly confirm it</small>
                  </span>
                </label>
                <div className="menu-actions">
                  <a href="/jobs">Clear all</a>
                  <button type="submit">Apply filters</button>
                </div>
              </div>
            </details>
          </div>
          <button className="filter-submit" type="submit">Search</button>
        </form>
        {filterChips.length ? <nav className="active-filter-chips" aria-label="Active filters">
          {filterChips.map(chip=><a key={chip.key} href={chip.href} aria-label={`Remove ${chip.label} filter`}>{chip.label} <span aria-hidden="true">×</span></a>)}
          <a href="/jobs">Clear all</a>
        </nav> : null}
      </section>

      <section className="results-section" aria-labelledby="results-title" onClickCapture={preserveResults}>
        <div className="results-heading">
          <div>
            <h2 id="results-title">{hasActiveFilters ? "Filtered jobs" : "Newest jobs"}</h2>
            <p>{number(totalCount)} matching opportunities</p>
          </div>
          <div className="results-tools">
            <button type="button" onClick={copySearch}>Copy search link</button>
            <span className="share-status" role="status">{shareStatus}</span>
          </div>
        </div>

        {jobs.length > 0 ? (
          <div className="job-list">
            {companyGroups.map((group, index) => {
              const collapsed = collapsedCompanyGroups.has(group.key);
              const headingId = `company-group-${index}-heading`;
              const jobsId = `company-group-${index}-jobs`;
              return (
                <section className="company-job-group" aria-labelledby={headingId} key={group.key}>
                  <div className="company-group-heading">
                    <div>
                      <h3 id={headingId}>{group.company}</h3>
                      <span>{group.items.length} {group.items.length === 1 ? "role" : "roles"}</span>
                    </div>
                    <button
                      type="button"
                      aria-expanded={!collapsed}
                      aria-controls={jobsId}
                      onClick={() => toggleCompanyGroup(group.key)}
                    >
                      {collapsed ? "Show" : "Hide"}
                      <span className="sr-only"> jobs at {group.company}</span>
                    </button>
                  </div>
                  <div className="company-group-jobs" id={jobsId} hidden={collapsed}>
                    {group.items.map((job) => (
                      <JobCard job={job} key={job.id} returnTo={returnPath} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No jobs match those filters yet.</h3>
            <p>Try a broader location or clear one of the extra filters.</p>
            <a className="button primary" href="/jobs">Clear filters</a>
          </div>
        )}

        <div className="load-more-wrap">
          {error && <p className="load-error" role="alert">{error}</p>}
          {cursor ? (
            <button className="load-more" type="button" onClick={loadMore} disabled={loading}>
              {loading ? "Loading…" : "Load more jobs"}
            </button>
          ) : jobs.length > 0 ? (
            <p className="end-of-feed">You’ve reached the end of these results.</p>
          ) : null}
          <p className="pagination-note" aria-live="polite">
            {paginationStatus || `Showing ${number(jobs.length)} of ${number(totalCount)} · Results load 36 at a time`}
          </p>
        </div>
      </section>
    </>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { JobCard } from "./JobCard";
import type { JobCardData, JobFilters } from "./job-types";

type JobsExplorerProps = {
  initialJobs: JobCardData[];
  initialCursor: string | null;
  initialFilters: JobFilters;
  initialQuery: string;
  total: number;
  sourceOptions: Array<{ id: string; name: string }>;
};

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function JobsExplorer({
  initialJobs,
  initialCursor,
  initialFilters,
  initialQuery,
  total,
  sourceOptions,
}: JobsExplorerProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");

  function levelHref(level: JobFilters["level"]) {
    const params = new URLSearchParams(initialQuery);
    if (level === "all") params.delete("level");
    else params.set("level", level);
    params.delete("cursor");
    const query = params.toString();
    return query ? `/jobs?${query}` : "/jobs";
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(initialQuery);
      params.set("cursor", cursor);
      const response = await fetch(`/api/jobs?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to load more jobs");
      const page = (await response.json()) as { items: JobCardData[]; nextCursor: string | null };
      setJobs((current) => {
        const known = new Set(current.map((job) => job.id));
        return [...current, ...page.items.filter((job) => !known.has(job.id))];
      });
      setCursor(page.nextCursor);
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
          <label className="filter-field search-field">
            <span className="field-label">Search</span>
            <input name="q" defaultValue={initialFilters.q} placeholder="Title, company, or keyword" autoComplete="off" />
          </label>
          <label className="filter-field location-field">
            <span className="field-label">Location</span>
            <input name="location" defaultValue={initialFilters.location} placeholder="City or state" autoComplete="address-level2" />
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
                <span>Keep the feed focused</span>
              </div>
              <label>
                <span>Source</span>
                <select name="source" defaultValue={initialFilters.source}>
                  <option value="">All sources</option>
                  {sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
              </label>
              <label className="menu-check" htmlFor="sponsorship-filter" aria-label="Confirmed sponsorship">
                <input id="sponsorship-filter" type="checkbox" name="sponsorship" value="true" defaultChecked={initialFilters.sponsorship} />
                <span>
                  <strong>Confirmed sponsorship</strong>
                  <small>Only roles that explicitly confirm it</small>
                </span>
              </label>
              <label>
                <span>Sort order</span>
                <select disabled aria-label="Sort order, fixed to newest first">
                  <option>Newest first</option>
                </select>
              </label>
              <div className="menu-actions">
                <a href="/jobs">Clear all</a>
                <button type="submit">Apply filters</button>
              </div>
            </div>
          </details>
          <button className="filter-submit" type="submit">Search</button>
        </form>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading">
          <div>
            <span className="section-kicker">Newest first · No category boosts</span>
            <h2 id="results-title">{initialFilters.q || initialFilters.location || initialFilters.remote || initialFilters.level !== "all" ? "Filtered jobs" : "Newest jobs"}</h2>
            <p>{number(total)} matching opportunities</p>
          </div>
          <div className="results-tools">
            <button type="button" onClick={copySearch}>Copy search link</button>
            <span className="share-status" role="status">{shareStatus}</span>
          </div>
        </div>

        {jobs.length > 0 ? (
          <div className="job-list">
            {jobs.map((job) => <JobCard job={job} key={job.id} />)}
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
          <p className="pagination-note" aria-live="polite">Showing {number(jobs.length)} of {number(total)} · Results load 36 at a time</p>
        </div>
      </section>
    </>
  );
}

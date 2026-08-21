"use client";

import { useSyncExternalStore } from "react";
import { JobCard } from "./JobCard";
import { useSavedJobs } from "./SaveButton";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function SavedJobs() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const jobs = useSavedJobs();

  if (!hydrated) {
    return <div className="saved-loading" aria-label="Loading saved jobs"><span /><span /><span /></div>;
  }

  if (jobs.length === 0) {
    return (
      <div className="empty-state saved-empty">
        <h2>No saved jobs.</h2>
        <p>Save a job and it will stay on this device.</p>
        <a className="text-link" href="/jobs">Browse jobs</a>
      </div>
    );
  }

  return (
    <section className="saved-results" aria-labelledby="saved-count">
      <div className="saved-count-row">
        <h2 id="saved-count">{jobs.length} saved {jobs.length === 1 ? "job" : "jobs"}</h2>
        <span>Stored only in this browser</span>
      </div>
      <div className="job-list">
        {jobs.map((job) => <JobCard job={job} key={job.id} liveRecency />)}
      </div>
    </section>
  );
}

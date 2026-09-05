"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { JobCardData } from "./job-types";
import { JobCard } from "./JobCard";
import { readSavedJobs, writeSavedJobs, useSavedJobs } from "./SaveButton";
import { SavedWorkflow } from "./SavedWorkflow";

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
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [refreshMessage, setRefreshMessage] = useState("");
  const savedIds = jobs.map(job => job.id).sort().join(",");
  useEffect(() => {
    if (!savedIds) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    void (async () => {
      try {
        const updates = new Map<string, JobCardData | null>();
        const ids = savedIds.split(",");
        let live = true;
        for (let start = 0; start < ids.length; start += 100) {
          const response = await fetch("/api/saved/refresh", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: ids.slice(start, start + 100) }), signal: controller.signal,
          });
          if (!response.ok) throw new Error("Refresh failed");
          const data = await response.json() as { mode: string; items: { requestedId: string; job: JobCardData | null }[] };
          live &&= data.mode === "live";
          for (const item of data.items) updates.set(item.requestedId, item.job);
        }
        if (controller.signal.aborted) return;
        const merged = new Map<string, JobCardData>();
        for (const saved of readSavedJobs()) {
          const fresh = updates.get(saved.id);
          const next = fresh ? { ...fresh, legacyIds: [...new Set([saved.id, ...(saved.legacyIds ?? []), ...(fresh.legacyIds ?? [])])] } : saved;
          const previous = merged.get(next.id);
          merged.set(next.id, previous ? { ...next, legacyIds: [...new Set([...(previous.legacyIds ?? []), ...(next.legacyIds ?? [])])] } : next);
        }
        setUnavailable([...updates].filter(([, job]) => !job).map(([id]) => id));
        setRefreshMessage(writeSavedJobs([...merged.values()])
          ? live ? "Listing details refreshed. Your notes remain private on this device." : "Showing the last available listing details. Live updates are temporarily unavailable."
          : "Details could not be saved in this browser. Your existing saves are unchanged.");
      } catch { if (!controller.signal.aborted) setRefreshMessage("Listing details could not be refreshed. Your saved jobs and notes are still here."); }
      finally { clearTimeout(timer); }
    })();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [savedIds]);

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
      {refreshMessage ? <p className="saved-refresh-note" role="status">{refreshMessage}</p> : null}
      <div className="job-list">
        {jobs.map((job) => (
          <div className="saved-job-entry" key={job.id}>
            {unavailable.includes(job.id) ? <p className="saved-availability">No longer in the current feed. Check the employer page for availability.</p> : null}
            <JobCard job={job} liveRecency returnTo="/saved" />
            <SavedWorkflow legacyIds={job.legacyIds} jobId={job.id} jobTitle={`${job.title} at ${job.company}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import type { JobCardData } from "./job-types";

const STORAGE_KEY = "timley:saved-jobs:v1";
const EMPTY_SAVED_JOBS: JobCardData[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | undefined;
let cachedJobs: JobCardData[] = EMPTY_SAVED_JOBS;
let storageListenerAttached = false;

function hasUsableApplicationUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      hostname !== "example.com" &&
      hostname !== "example.org" &&
      hostname !== "example.net" &&
      !hostname.endsWith(".example.com") &&
      !hostname.endsWith(".example.org") &&
      !hostname.endsWith(".example.net")
    );
  } catch {
    return false;
  }
}

function parseSavedJobs(raw: string): JobCardData[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY_SAVED_JOBS;
    return parsed.filter((item): item is JobCardData => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.company === "string" &&
        typeof candidate.title === "string" &&
        typeof candidate.location === "string" &&
        typeof candidate.freshnessLabel === "string" &&
        (candidate.freshnessKind === "posted" || candidate.freshnessKind === "found") &&
        (candidate.roleLevel === "Internship" || candidate.roleLevel === "New grad") &&
        (candidate.workplace === "Remote" || candidate.workplace === "Hybrid" || candidate.workplace === "On-site") &&
        typeof candidate.logoText === "string" &&
        typeof candidate.logoTone === "string" &&
        (candidate.companyDomain === undefined || typeof candidate.companyDomain === "string") &&
        hasUsableApplicationUrl(candidate.applyUrl) &&
        Array.isArray(candidate.sourceNames) &&
        candidate.sourceNames.length > 0 &&
        candidate.sourceNames.every((source) => typeof source === "string")
      );
    });
  } catch {
    return EMPTY_SAVED_JOBS;
  }
}

function getSavedSnapshot(): JobCardData[] {
  if (typeof window === "undefined") return EMPTY_SAVED_JOBS;
  let raw = "[]";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return cachedJobs;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedJobs = parseSavedJobs(raw);
  }
  return cachedJobs;
}

function emitSavedChange() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) {
    cachedRaw = undefined;
    emitSavedChange();
  }
}

function subscribeToSavedJobs(listener: () => void) {
  listeners.add(listener);
  if (!storageListenerAttached) {
    window.addEventListener("storage", handleStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached) {
      window.removeEventListener("storage", handleStorage);
      storageListenerAttached = false;
    }
  };
}

export function readSavedJobs(): JobCardData[] {
  return getSavedSnapshot();
}

export function useSavedJobs(): JobCardData[] {
  return useSyncExternalStore(subscribeToSavedJobs, getSavedSnapshot, () => EMPTY_SAVED_JOBS);
}

function writeSavedJobs(jobs: JobCardData[]) {
  const serialized = JSON.stringify(jobs);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Keep the in-page shortlist usable when browser storage is unavailable.
  }
  cachedRaw = serialized;
  cachedJobs = jobs;
  emitSavedChange();
}

type SaveButtonProps = {
  job: JobCardData;
};

export function SaveButton({ job }: SaveButtonProps) {
  const savedJobs = useSavedJobs();
  const saved = savedJobs.some((item) => item.id === job.id);

  function toggleSaved() {
    const next = saved
      ? savedJobs.filter((item) => item.id !== job.id)
      : [job, ...savedJobs.filter((item) => item.id !== job.id)];
    writeSavedJobs(next);
  }

  return (
    <button
      className={`save-button${saved ? " is-saved" : ""}`}
      type="button"
      aria-label={`${saved ? "Remove" : "Save"} ${job.title} at ${job.company}${saved ? " from saved jobs" : ""}`}
      aria-pressed={saved}
      onClick={toggleSaved}
    >
      <span>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}

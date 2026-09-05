"use client";

import { useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "timley:saved-workflow:v1";
const EMPTY_WORKFLOW: Readonly<Record<string, SavedJobWorkflow>> = Object.freeze({});
const listeners = new Set<() => void>();
let cachedRaw: string | undefined;
let cachedWorkflow: Readonly<Record<string, SavedJobWorkflow>> = EMPTY_WORKFLOW;
let storageListenerAttached = false;

type SavedJobStatus = "saved" | "applied" | "interviewing" | "offer" | "closed";

type SavedJobWorkflow = {
  status: SavedJobStatus;
  note: string;
};

const STATUS_OPTIONS: ReadonlyArray<{ value: SavedJobStatus; label: string }> = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "closed", label: "Not moving forward" },
];

function parseWorkflow(raw: string): Readonly<Record<string, SavedJobWorkflow>> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return EMPTY_WORKFLOW;
    }
    const valid = Object.entries(parsed).flatMap(([jobId, value]) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
      const candidate = value as Record<string, unknown>;
      if (
        !STATUS_OPTIONS.some((option) => option.value === candidate.status) ||
        typeof candidate.note !== "string"
      ) {
        return [];
      }
      return [[jobId.slice(0, 128), {
        status: candidate.status as SavedJobStatus,
        note: candidate.note.normalize("NFKC").slice(0, 500),
      }] as const];
    });
    return Object.freeze(Object.fromEntries(valid));
  } catch {
    return EMPTY_WORKFLOW;
  }
}

function getWorkflowSnapshot(): Readonly<Record<string, SavedJobWorkflow>> {
  if (typeof window === "undefined") return EMPTY_WORKFLOW;
  let raw = "{}";
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? "{}";
  } catch {
    return cachedWorkflow;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedWorkflow = parseWorkflow(raw);
  }
  return cachedWorkflow;
}

function emitChange() {
  for (const listener of listeners) listener();
}

function handleStorage(event: StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) {
    cachedRaw = undefined;
    emitChange();
  }
}

function subscribe(listener: () => void) {
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

function writeWorkflow(workflow: Readonly<Record<string, SavedJobWorkflow>>) {
  const serialized = JSON.stringify(workflow);
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    return false;
  }
  cachedRaw = serialized;
  cachedWorkflow = workflow;
  emitChange();
  return true;
}

export function SavedWorkflow({ jobId, jobTitle, legacyIds = [] }: { jobId: string; jobTitle: string; legacyIds?: readonly string[] }) {
  const workflows = useSyncExternalStore(subscribe, getWorkflowSnapshot, () => EMPTY_WORKFLOW);
  const workflow = workflows[jobId] ?? legacyIds.map(id => workflows[id]).find(Boolean) ?? { status: "saved", note: "" };
  const otherNotes = [...new Set(legacyIds.filter(id => id !== jobId).map(id => workflows[id]?.note).filter(note => note && note !== workflow.note))];
  const [storageError, setStorageError] = useState("");

  function update(next: Partial<SavedJobWorkflow>) {
    const saved = writeWorkflow(Object.freeze({
      ...workflows,
      [jobId]: { ...workflow, ...next },
    }));
    setStorageError(saved ? "" : "Your browser could not save this change. Please try again after enabling browser storage.");
  }

  return (
    <div className="saved-workflow" aria-label={`Application tracking for ${jobTitle}`}>
      {storageError ? <p className="storage-error" role="status">{storageError}</p> : null}
      <label>
        <span>Status</span>
        <select
          value={workflow.status}
          onChange={(event) => update({ status: event.target.value as SavedJobStatus })}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {otherNotes.length ? <details className="saved-previous-notes"><summary>Notes from earlier saved versions</summary>{otherNotes.map(note => <p key={note}>{note}</p>)}</details> : null}
      <label className="saved-note-field">
        <span>Private note</span>
        <textarea
          value={workflow.note}
          maxLength={500}
          rows={2}
          placeholder="Add a deadline, contact, or next step"
          onChange={(event) => update({ note: event.target.value.slice(0, 500) })}
        />
      </label>
    </div>
  );
}

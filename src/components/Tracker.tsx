"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPLICATION_STAGE_LABELS,
  TRACKED_APPLICATION_STAGES,
  type ApplicationRecord,
  type ApplicationRecords,
  type ApplicationStage,
  type TrackedApplicationStage,
} from "@/lib/applicationTracking";
import { ApplicationStageBadge } from "@/components/ApplicationStageMenu";
import {
  ApplicationEditor,
  type ApplicationDraft,
} from "@/components/ApplicationEditor";
import { TrackerApplicationCard } from "@/components/TrackerApplicationCard";
import { TrackerDataControls } from "@/components/TrackerDataControls";
import { useApplicationTracking } from "@/hooks/useApplicationTracking";
import {
  filterTrackerRows,
  joinTrackedApplications,
  localDateKey,
  summarizeTrackerRows,
  type TrackerActionFilter,
  type TrackerRow,
  type TrackerSort,
  type TrackerStageFilter,
} from "@/lib/tracker";
import { usePersistentSet, usePersistentString } from "@/hooks/useLocalStorageState";
import type { Internship } from "@/lib/types";
import {
  trackStageChanged,
  trackTrackerRevisited,
} from "@/lib/analytics";

interface TrackerProps {
  jobs: Internship[];
  generatedAt: string;
  updatedAt: string | null;
  loadError: boolean;
}

type TrackerView = "list" | "board";
type EditorState = { type: "new" } | { type: "edit"; jobKey: string };

type UndoState =
  | {
      kind: "stage";
      message: string;
      jobKey: string;
      previousStage: TrackedApplicationStage;
    }
  | {
      kind: "delete";
      message: string;
      jobKey: string;
      record: ApplicationRecord;
    };

const SORT_LABELS: Record<TrackerSort, string> = {
  "updated-desc": "Recently updated",
  "next-action": "Next action",
  company: "Company",
  stage: "Stage",
  "saved-desc": "Date saved",
  "applied-desc": "Date applied",
};

const ACTION_LABELS: Record<TrackerActionFilter, string> = {
  all: "Any action date",
  overdue: "Overdue",
  "next-7-days": "Next 7 days",
  "no-date": "No action date",
};

function isTrackerView(value: string): value is TrackerView {
  return value === "list" || value === "board";
}

export function Tracker({ jobs, updatedAt, loadError }: TrackerProps) {
  const {
    records,
    ready,
    updateStage,
    updateRecord,
    createRecord,
    deleteRecord,
    restoreRecord,
    mergeRecords,
  } = useApplicationTracking(jobs);
  const [saved, toggleSaved] = usePersistentSet("timley:saved");
  const [view, setView] = usePersistentString<TrackerView>(
    "timley:tracker-view:v1",
    "list",
    isTrackerView,
  );
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<TrackerStageFilter>("all");
  const [action, setAction] = useState<TrackerActionFilter>("all");
  const [sort, setSort] = useState<TrackerSort>("updated-desc");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [undo, setUndo] = useState<UndoState | null>(null);
  const revisitTracked = useRef(false);
  const today = localDateKey(new Date());

  useEffect(() => {
    if (!ready || revisitTracked.current) return;
    revisitTracked.current = true;
    trackTrackerRevisited(Object.keys(records).length);
  }, [ready, records]);

  const rows = useMemo(
    () => joinTrackedApplications(jobs, records),
    [jobs, records],
  );
  const filteredRows = useMemo(
    () =>
      filterTrackerRows(rows, {
        query,
        stage,
        action,
        sort,
        today,
      }),
    [action, query, rows, sort, stage, today],
  );
  const summary = useMemo(
    () => summarizeTrackerRows(rows, today),
    [rows, today],
  );
  const upcoming = useMemo(
    () => buildUpcomingItems(rows, today).slice(0, 6),
    [rows, today],
  );

  const editingRow =
    editor?.type === "edit"
      ? rows.find((row) => row.jobKey === editor.jobKey) ?? null
      : null;

  const announce = (message: string) => {
    setAnnouncement(message);
    window.setTimeout(() => {
      setAnnouncement((current) => (current === message ? "" : current));
    }, 2800);
  };

  const changeStage = (row: TrackerRow, nextStage: ApplicationStage) => {
    if (nextStage === "not_applied" || nextStage === row.record.stage) return;
    updateStage(row.jobKey, nextStage, row.job ?? undefined);
    if (nextStage === "saved" && !saved.has(row.jobKey)) {
      toggleSaved(row.jobKey);
    }
    setUndo({
      kind: "stage",
      message: `${row.company} moved to ${APPLICATION_STAGE_LABELS[nextStage]}.`,
      jobKey: row.jobKey,
      previousStage: row.record.stage,
    });
    announce(
      `${row.jobTitle} at ${row.company} moved to ${APPLICATION_STAGE_LABELS[nextStage]}.`,
    );
    trackStageChanged({
      surface: "tracker",
      from: row.record.stage,
      to: nextStage,
    });
  };

  const archive = (row: TrackerRow) => {
    if (row.record.stage === "archived") return;
    updateStage(row.jobKey, "archived", row.job ?? undefined);
    setUndo({
      kind: "stage",
      message: `${row.company} archived.`,
      jobKey: row.jobKey,
      previousStage: row.record.stage,
    });
    setEditor(null);
    announce(`${row.jobTitle} at ${row.company} archived.`);
    trackStageChanged({
      surface: "tracker",
      from: row.record.stage,
      to: "archived",
    });
  };

  const permanentlyDelete = (row: TrackerRow) => {
    deleteRecord(row.jobKey);
    setUndo({
      kind: "delete",
      message: `${row.company} deleted from this browser.`,
      jobKey: row.jobKey,
      record: row.record,
    });
    setEditor(null);
    announce(`${row.jobTitle} at ${row.company} deleted.`);
  };

  const saveEditor = (draft: ApplicationDraft) => {
    if (editor?.type === "edit") {
      updateRecord(editor.jobKey, draft);
      const company = draft.company || editingRow?.company || "Application";
      announce(`${company} updated.`);
    } else {
      const existingKey = draft.applicationUrl
        ? findRecordKeyByUrl(records, draft.applicationUrl)
        : null;
      if (existingKey) {
        setEditor({ type: "edit", jobKey: existingKey });
        announce(
          "That application URL is already tracked. Opened its existing record.",
        );
        return;
      }
      createRecord({
        ...draft,
        savedAt: draft.savedAt || today,
      });
      announce(`${draft.company || "Application"} added.`);
    }
    setEditor(null);
  };

  const clearFilters = () => {
    setQuery("");
    setStage("all");
    setAction("all");
    setSort("updated-desc");
  };

  return (
    <main
      id="main-content"
      className="theme-application min-h-[calc(100dvh-4rem)] bg-bg text-fg"
    >
      <div className="mx-auto max-w-[94rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="grid gap-6 border-b border-border pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-extrabold tracking-[0.12em] text-accent-hover uppercase">
              Application workspace
            </p>
            <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-[-0.045em] text-fg sm:text-5xl">
              Your search, organized.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              Save opportunities, plan each next step, and move applications
              through one private, browser-first workspace. Signing in never
              uploads it; optional continuity syncs tracker data only after you
              explicitly select it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => setEditor({ type: "new" })}
              className="ui-button ui-button--primary"
            >
              Add application
            </button>
            <Link
              href="/jobs"
              prefetch={false}
              className="ui-button ui-button--secondary"
            >
              Browse jobs
            </Link>
          </div>
        </header>

        {loadError && (
          <div
            role="status"
            className="mt-5 rounded-sm border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
          >
            Your saved tracker data is available. Timley could not refresh
            active-listing status, so no application is being treated as
            removed.
          </div>
        )}

        <section aria-labelledby="tracker-summary-heading" className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="tracker-summary-heading"
                className="text-lg font-extrabold tracking-[-0.02em]"
              >
                At a glance
              </h2>
              <p className="mt-1 text-sm text-muted">
                Totals and action dates from the local browser copy.
              </p>
            </div>
            <p className="text-xs text-faint">
              {loadError
                ? "Listing status unavailable"
                : updatedAt
                  ? `Listings observed ${formatDate(updatedAt)}`
                  : "Listing observation unavailable"}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryMetric
              label="Applications"
              value={ready ? summary.total : null}
              detail="All stages"
            />
            <SummaryMetric
              label="Due in 7 days"
              value={ready ? summary.nextSevenDays : null}
              detail="Including today"
              tone="accent"
            />
            <SummaryMetric
              label="Overdue"
              value={ready ? summary.overdue : null}
              detail="Needs attention"
              tone={summary.overdue > 0 ? "danger" : "default"}
            />
            <SummaryMetric
              label="Active listings"
              value={ready ? summary.activeListings : null}
              detail={
                loadError
                  ? "Status unavailable"
                  : `${summary.notInActiveFeed} outside active feed`
              }
            />
          </div>

          <div className="mt-3 overflow-x-auto pb-2">
            <div className="grid min-w-[62rem] grid-cols-9 gap-2">
              {TRACKED_APPLICATION_STAGES.map((filterStage) => (
                <button
                  key={filterStage}
                  type="button"
                  aria-pressed={stage === filterStage}
                  onClick={() =>
                    setStage((current) =>
                      current === filterStage ? "all" : filterStage,
                    )
                  }
                  className={`ui-card min-h-20 p-3 text-left hover:border-border-strong ${
                    stage === filterStage ? "ui-selected" : ""
                  }`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <ApplicationStageBadge stage={filterStage} compact />
                    <span className="text-lg font-extrabold tabular-nums">
                      {ready ? summary.byStage[filterStage] : "—"}
                    </span>
                  </span>
                  <span className="mt-2 block text-[11px] font-semibold text-muted">
                    {APPLICATION_STAGE_LABELS[filterStage]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="upcoming-actions-heading"
          className="mt-8 grid gap-4 rounded-sm border border-border bg-surface p-4 sm:p-5 lg:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.12em] text-accent-hover uppercase">
              Reminders
            </p>
            <h2
              id="upcoming-actions-heading"
              className="mt-1 text-lg font-extrabold"
            >
              Upcoming actions
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Next actions and interviews, ordered by date.
            </p>
          </div>
          {ready && upcoming.length > 0 ? (
            <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border px-3 py-3 ${
                    item.overdue
                      ? "border-error/30 bg-error-soft"
                      : "border-border bg-raised"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-1 text-xs font-extrabold">
                      {item.company}
                    </p>
                    <time
                      dateTime={item.date}
                      className={`shrink-0 text-[10px] font-bold ${
                        item.overdue ? "text-error" : "text-faint"
                      }`}
                    >
                      {relativeDateLabel(item.date, today)}
                    </time>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                    {item.label}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex min-h-20 items-center rounded-lg border border-dashed border-border px-4 text-sm text-muted">
              Add a next-action date or interview date to see it here.
            </div>
          )}
        </section>

        <section
          aria-labelledby="applications-heading"
          className="mt-8 border-t border-border pt-7"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="applications-heading"
                className="text-2xl font-extrabold tracking-[-0.03em]"
              >
                Applications
              </h2>
              <p className="mt-1 text-sm text-muted">
                Update stages from any card. Archive completed work and keep
                deletion as a confirmed last resort.
              </p>
            </div>
            <TrackerDataControls
              records={records}
              savedJobs={[...saved]}
              onRestore={(backup) => {
                mergeRecords(backup.records);
                for (const jobKey of backup.savedJobs) {
                  if (!saved.has(jobKey)) toggleSaved(jobKey);
                }
                announce(
                  `Restored ${Object.keys(backup.records).length} application records.`,
                );
              }}
            />
          </div>

          <div className="mt-5 rounded-sm border border-border bg-surface p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_12rem_12rem_13rem_auto] lg:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">
                  Search
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Company, job, action, notes, or contact"
                  className="ui-control ui-input w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">
                  Stage
                </span>
                <select
                  value={stage}
                  onChange={(event) =>
                    setStage(event.target.value as TrackerStageFilter)
                  }
                  className="ui-control ui-input w-full"
                >
                  <option value="all">All stages</option>
                  {TRACKED_APPLICATION_STAGES.map((option) => (
                    <option key={option} value={option}>
                      {APPLICATION_STAGE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">
                  Actions
                </span>
                <select
                  value={action}
                  onChange={(event) =>
                    setAction(event.target.value as TrackerActionFilter)
                  }
                  className="ui-control ui-input w-full"
                >
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-muted">
                  Sort
                </span>
                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as TrackerSort)
                  }
                  className="ui-control ui-input w-full"
                >
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                role="group"
                aria-label="Tracker view"
                className="grid grid-cols-2 rounded-lg border border-border bg-raised p-1"
              >
                {(["list", "board"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={`min-h-9 rounded-md px-3 text-xs font-bold capitalize ${
                      view === option
                        ? "bg-surface text-fg shadow-[var(--shadow-control)]"
                        : "text-muted hover:text-fg"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            {(query || stage !== "all" || action !== "all" || sort !== "updated-desc") && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-faint">
                  {filteredRows.length} of {rows.length} applications
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ui-button ui-button--quiet ui-button--sm"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          <div className="mt-5">
            {!ready ? (
              <TrackerLoadingState />
            ) : rows.length === 0 ? (
              <EmptyTracker onAdd={() => setEditor({ type: "new" })} />
            ) : filteredRows.length === 0 ? (
              <NoResults onClear={clearFilters} />
            ) : view === "list" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredRows.map((row) => (
                  <TrackerApplicationCard
                    key={row.jobKey}
                    row={row}
                    feedAvailable={!loadError}
                    onEdit={() =>
                      setEditor({ type: "edit", jobKey: row.jobKey })
                    }
                    onArchive={() => archive(row)}
                    onStageChange={(nextStage) =>
                      changeStage(row, nextStage)
                    }
                  />
                ))}
              </div>
            ) : (
              <TrackerBoard
                rows={filteredRows}
                feedAvailable={!loadError}
                onEdit={(row) =>
                  setEditor({ type: "edit", jobKey: row.jobKey })
                }
                onArchive={archive}
                onStageChange={changeStage}
              />
            )}
          </div>
        </section>
      </div>

      {editor && (
        <ApplicationEditor
          key={editor.type === "edit" ? editor.jobKey : "new-application"}
          title={
            editor.type === "edit" ? "Application details" : "Add application"
          }
          initial={
            editingRow
              ? editableRecord(editingRow)
              : {
                  stage: "saved",
                  updatedAt: new Date().toISOString(),
                  savedAt: today,
                }
          }
          onClose={() => setEditor(null)}
          onSave={saveEditor}
          onArchive={
            editingRow && editingRow.record.stage !== "archived"
              ? () => archive(editingRow)
              : undefined
          }
          onDelete={
            editingRow ? () => permanentlyDelete(editingRow) : undefined
          }
        />
      )}

      {undo && (
        <div
          role="status"
          className="ui-popover motion-toast fixed right-4 bottom-4 z-[var(--layer-toast)] flex max-w-[calc(100vw-2rem)] items-center gap-3 px-4 py-3 text-sm font-semibold"
        >
          <span>{undo.message}</span>
          <button
            type="button"
            onClick={() => {
              if (undo.kind === "stage") {
                updateStage(undo.jobKey, undo.previousStage);
              } else if (records[undo.jobKey]) {
                setUndo(null);
                announce(
                  "This application was added again, so the deleted version was not restored.",
                );
                return;
              } else {
                restoreRecord(undo.jobKey, undo.record);
              }
              setUndo(null);
              announce("Previous application state restored.");
            }}
            className="ui-button ui-button--quiet ui-button--sm shrink-0 text-accent-hover"
          >
            Undo
          </button>
          <button
            type="button"
            aria-label="Dismiss undo"
            onClick={() => setUndo(null)}
            className="ui-button ui-button--quiet ui-button--sm shrink-0"
          >
            ×
          </button>
        </div>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </main>
  );
}

function TrackerBoard({
  rows,
  feedAvailable,
  onEdit,
  onArchive,
  onStageChange,
}: {
  rows: TrackerRow[];
  feedAvailable: boolean;
  onEdit: (row: TrackerRow) => void;
  onArchive: (row: TrackerRow) => void;
  onStageChange: (row: TrackerRow, stage: ApplicationStage) => void;
}) {
  const groups = TRACKED_APPLICATION_STAGES.map((stage) => ({
    stage,
    rows: rows.filter((row) => row.record.stage === stage),
  })).filter((group) => group.rows.length > 0);

  return (
    <>
      <div className="hidden overflow-x-auto pb-4 xl:block">
        <div className="grid min-w-max auto-cols-[18rem] grid-flow-col gap-3">
          {groups.map((group) => (
            <section
              key={group.stage}
              aria-labelledby={`board-${group.stage}`}
              className="rounded-sm border border-border bg-raised/70 p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 id={`board-${group.stage}`}>
                  <ApplicationStageBadge stage={group.stage} />
                </h3>
                <span className="text-xs font-extrabold tabular-nums text-faint">
                  {group.rows.length}
                </span>
              </div>
              <div className="space-y-3">
                {group.rows.map((row) => (
                  <TrackerApplicationCard
                    key={row.jobKey}
                    row={row}
                    compact
                    feedAvailable={feedAvailable}
                    onEdit={() => onEdit(row)}
                    onArchive={() => onArchive(row)}
                    onStageChange={(stage) => onStageChange(row, stage)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="space-y-3 xl:hidden">
        {groups.map((group) => (
          <details
            key={group.stage}
            open
            className="ui-card overflow-hidden"
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <ApplicationStageBadge stage={group.stage} />
              <span className="text-xs font-extrabold tabular-nums text-faint">
                {group.rows.length}
              </span>
            </summary>
            <div className="space-y-3 border-t border-border bg-raised/50 p-3">
              {group.rows.map((row) => (
                <TrackerApplicationCard
                  key={row.jobKey}
                  row={row}
                  compact
                  feedAvailable={feedAvailable}
                  onEdit={() => onEdit(row)}
                  onArchive={() => onArchive(row)}
                  onStageChange={(stage) => onStageChange(row, stage)}
                />
              ))}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: number | null;
  detail: string;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <div
      className={`ui-card p-4 ${
        tone === "danger"
          ? "border-error/30"
          : tone === "accent"
            ? "border-accent/30"
            : ""
      }`}
    >
      <p className="text-xs font-bold text-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-extrabold tabular-nums ${
          tone === "danger"
            ? "text-error"
            : tone === "accent"
              ? "text-accent-hover"
              : "text-fg"
        }`}
      >
        {value ?? "—"}
      </p>
      <p className="mt-1 text-[11px] text-faint">{detail}</p>
    </div>
  );
}

function TrackerLoadingState() {
  return (
    <div role="status" className="grid gap-3 lg:grid-cols-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="ui-card min-h-40 animate-pulse p-4 motion-reduce:animate-none"
        >
          <span className="block h-3 w-28 rounded bg-raised" />
          <span className="mt-3 block h-3 max-w-sm rounded bg-raised" />
          <span className="mt-8 block h-10 rounded bg-raised" />
        </div>
      ))}
      <span className="sr-only">Loading browser-saved applications.</span>
    </div>
  );
}

function EmptyTracker({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="ui-card flex flex-col items-center px-5 py-14 text-center">
      <span className="text-3xl" aria-hidden>
        ◎
      </span>
      <h3 className="mt-4 text-lg font-extrabold">Your tracker is ready.</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        Save a role from job search or add an application you found elsewhere.
        It is saved in this browser first.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="ui-button ui-button--primary"
        >
          Add application
        </button>
        <Link
          href="/jobs"
          prefetch={false}
          className="ui-button ui-button--secondary"
        >
          Browse jobs
        </Link>
      </div>
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="ui-card px-5 py-12 text-center">
      <h3 className="text-base font-extrabold">No applications match.</h3>
      <p className="mt-2 text-sm text-muted">
        Try a different search, stage, action window, or sort.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="ui-button ui-button--secondary mt-5"
      >
        Clear filters
      </button>
    </div>
  );
}

function editableRecord(row: TrackerRow): ApplicationRecord {
  return {
    ...row.record,
    jobTitle: row.record.jobTitle || row.jobTitle,
    company: row.record.company || row.company,
    locationArrangement:
      row.record.locationArrangement || row.locationArrangement,
    applicationUrl: row.record.applicationUrl || row.applicationUrl,
  };
}

function findRecordKeyByUrl(
  records: Readonly<ApplicationRecords>,
  applicationUrl: string,
): string | null {
  const normalized = applicationUrl.trim();
  return (
    Object.entries(records).find(
      ([jobKey, record]) =>
        jobKey === normalized || record.applicationUrl === normalized,
    )?.[0] ?? null
  );
}

interface UpcomingItem {
  id: string;
  date: string;
  label: string;
  company: string;
  overdue: boolean;
}

function buildUpcomingItems(
  rows: readonly TrackerRow[],
  today: string,
): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const row of rows) {
    if (
      row.record.stage === "archived" ||
      row.record.stage === "rejected" ||
      row.record.stage === "withdrawn"
    ) {
      continue;
    }
    if (row.record.nextActionAt) {
      items.push({
        id: `${row.jobKey}:action:${row.record.nextActionAt}`,
        date: row.record.nextActionAt,
        label: row.record.nextAction || `Next step for ${row.jobTitle}`,
        company: row.company,
        overdue: row.record.nextActionAt < today,
      });
    }
    for (const [index, date] of (row.record.interviewDates ?? []).entries()) {
      if (date.slice(0, 10) < today) continue;
      items.push({
        id: `${row.jobKey}:interview:${index}:${date}`,
        date,
        label: `Interview · ${row.jobTitle}`,
        company: row.company,
        overdue: false,
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function relativeDateLabel(value: string, today: string): string {
  const date = value.slice(0, 10);
  if (date < today) return `Overdue · ${formatDate(value)}`;
  if (date === today) return "Today";
  return formatDate(value);
}

function formatDate(value: string): string {
  const normalized =
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(normalized));
}

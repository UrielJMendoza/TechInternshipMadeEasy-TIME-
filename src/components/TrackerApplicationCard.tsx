"use client";

import { ApplicationStageMenu } from "@/components/ApplicationStageMenu";
import { CompanyLogo } from "@/components/CompanyLogo";
import {
  APPLICATION_STAGE_LABELS,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import {
  safeListingHref,
  type TrackerRow,
} from "@/lib/tracker";

interface TrackerApplicationCardProps {
  row: TrackerRow;
  compact?: boolean;
  feedAvailable: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onStageChange: (stage: ApplicationStage) => void;
}

export function TrackerApplicationCard({
  row,
  compact = false,
  feedAvailable,
  onEdit,
  onArchive,
  onStageChange,
}: TrackerApplicationCardProps) {
  const { job, record } = row;
  const href = safeListingHref(row.applicationUrl);
  const label = `${row.jobTitle} at ${row.company}`;
  const nextActionTone =
    record.nextActionAt && record.nextActionAt < todayKey()
      ? "border-error/30 bg-error-soft text-error"
      : "border-border bg-raised text-muted";

  return (
    <article
      data-application-stage={record.stage}
      className={`ui-card min-w-0 p-4 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-[var(--shadow-card-hover)] ${
        record.stage === "offer"
          ? "border-success/35"
          : record.stage === "rejected"
            ? "border-error/30"
            : record.stage === "archived"
              ? "opacity-75"
              : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {job ? (
          <CompanyLogo company={row.company} size={compact ? 36 : 42} />
        ) : (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-raised text-sm font-extrabold text-faint"
          >
            {initials(row.company)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-fg">
            {row.company}
          </p>
          <h3
            className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted"
            title={row.jobTitle}
          >
            {row.jobTitle}
          </h3>
          <p className="mt-1 truncate text-xs text-faint">
            {row.locationArrangement}
          </p>
        </div>
        {!compact && (
          <button
            type="button"
            aria-label={`Edit ${label}`}
            onClick={onEdit}
            className="ui-button ui-button--quiet ui-button--sm shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      {record.nextAction && (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${nextActionTone}`}>
          <p className="text-[10px] font-extrabold tracking-[0.1em] uppercase">
            Next action
          </p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold">
            {record.nextAction}
          </p>
          {record.nextActionAt && (
            <time
              dateTime={record.nextActionAt}
              className="mt-1 block text-[11px]"
            >
              {formatDate(record.nextActionAt)}
            </time>
          )}
        </div>
      )}

      {!compact && record.notes && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">
          {record.notes}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        <ApplicationStageMenu
          stage={record.stage}
          jobLabel={label}
          onChange={onStageChange}
        />
        {compact && (
          <button
            type="button"
            aria-label={`View details for ${label}`}
            onClick={onEdit}
            className="ui-button ui-button--quiet ui-button--sm"
          >
            Details
          </button>
        )}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open application for ${label}`}
            className="ui-button ui-button--quiet ui-button--sm"
          >
            Open ↗
          </a>
        )}
        {record.stage !== "archived" && (
          <button
            type="button"
            aria-label={`Archive ${label}`}
            onClick={onArchive}
            className="ui-button ui-button--quiet ui-button--sm ml-auto text-faint"
          >
            Archive
          </button>
        )}
      </div>

      {!compact && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-faint">
          <span>
            {job
              ? "Active listing"
              : feedAvailable
                ? "Listing not in active feed"
                : "Active feed unavailable"}
          </span>
          <time dateTime={record.updatedAt}>
            Updated {formatDate(record.updatedAt)}
          </time>
        </div>
      )}
      <span className="sr-only">
        Current stage: {APPLICATION_STAGE_LABELS[record.stage]}
      </span>
    </article>
  );
}

function todayKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function initials(value: string): string {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A"
  );
}

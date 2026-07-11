"use client";

import {
  ApplicationStageBadge,
  ApplicationStageMenu,
} from "@/components/ApplicationStageMenu";
import { CompanyLogo } from "@/components/CompanyLogo";
import { TruncatedTooltip } from "@/components/TruncatedTooltip";
import type { ApplicationStage } from "@/lib/applicationTracking";
import {
  compensationFor,
  type Compensation,
} from "@/lib/compensation";
import { classifySponsorship } from "@/lib/jobFilters";
import { getUsLocationDisplay } from "@/lib/jobLocations";
import {
  HOT_DAYS,
  NEW_DAYS,
  daysAgo,
  relativeJobAge,
} from "@/lib/jobTime";
import { CATEGORY_LABELS, type Internship } from "@/lib/types";

export const JOB_GRID =
  "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[auto_minmax(12rem,2fr)_6.5rem_minmax(8rem,1.15fr)_7.5rem_3.5rem_minmax(7rem,auto)] lg:items-center lg:gap-x-4";

export function JobCard({
  job,
  now,
  dense,
  saved,
  stage,
  onToggleSaved,
  onStageChange,
}: {
  job: Internship;
  now: number;
  dense: boolean;
  saved: boolean;
  stage: ApplicationStage;
  onToggleSaved: () => void;
  onStageChange: (stage: ApplicationStage) => void;
}) {
  const days = daysAgo(job, now);
  const compensation = compensationFor(job);
  const displayLocation = getUsLocationDisplay(job.location) || "Location unavailable";
  const logoSize = dense ? 28 : 40;
  const statusAccent =
    stage === "offer"
      ? "border-new/35"
      : stage === "interview"
        ? "border-hot/35"
        : stage === "rejected"
          ? "border-[#ff453a]/25"
          : "border-border";

  return (
    <li>
      <article
        data-job-row
        data-testid="job-row"
        data-company={job.company}
        data-application-stage={stage}
        className={`group relative ${JOB_GRID} rounded-2xl border bg-surface transition-[border-color,box-shadow,background-color] hover:border-white/25 hover:bg-surface/70 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] ${statusAccent} ${
          dense
            ? "px-4 py-4 sm:px-5 lg:py-2"
            : "px-4 py-4 sm:px-5"
        }`}
      >
        <a
          href={job.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${job.title} at ${job.company} — open listing`}
          className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />

        <span className="pointer-events-none relative z-10 row-span-3 lg:row-span-1">
          <CompanyLogo company={job.company} size={logoSize} />
        </span>

        <div className="pointer-events-none relative z-10 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`truncate font-semibold ${dense ? "text-[15px] lg:text-[13px]" : "text-[15px]"}`}
            >
              {job.company}
            </span>
            <FreshnessBadge days={days} />
            {job.season && !dense && (
              <span className="hidden text-[11px] font-medium text-faint xl:inline">
                {job.season}
              </span>
            )}
          </div>
          <div className="pointer-events-auto relative z-20 mt-0.5 min-w-0">
            <TruncatedTooltip
              text={job.title}
              className={`text-muted focus:whitespace-normal focus:overflow-visible ${
                dense ? "text-sm lg:text-xs" : "text-sm"
              }`}
            />
          </div>
        </div>

        <div className="pointer-events-none relative z-10 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:col-start-3 lg:row-start-1">
          <span className={`cat cat-${job.category}`}>
            {CATEGORY_LABELS[job.category]}
          </span>
          <span className="inline-flex sm:hidden">
            <ApplicationStageBadge stage={stage} compact />
          </span>
          <CompensationTag compensation={compensation} className="sm:hidden" />
          <SponsorshipTag sponsorship={job.sponsorship} className="sm:hidden" />
        </div>

        <div className="pointer-events-none relative z-10 col-start-2 row-start-2 flex min-w-0 items-center lg:col-start-4 lg:row-start-1">
          <span className="hidden truncate text-xs text-muted lg:inline" title={displayLocation}>
            {displayLocation}
          </span>
        </div>

        <div className="pointer-events-none relative z-10 hidden min-w-0 flex-col items-start justify-center lg:col-start-5 lg:row-start-1 lg:flex">
          <CompensationTag compensation={compensation} />
          <SponsorshipTag sponsorship={job.sponsorship} />
        </div>

        <div className="pointer-events-none relative z-10 col-start-2 col-span-2 row-start-3 mt-2 hidden min-w-0 items-center gap-2 sm:flex lg:hidden">
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted"
            title={displayLocation}
          >
            {displayLocation}
          </span>
          <CompensationTag compensation={compensation} className="shrink-0" />
          <SponsorshipTag
            sponsorship={job.sponsorship}
            className="max-w-28 shrink-0"
          />
        </div>

        <div className="pointer-events-none relative z-10 col-start-3 row-start-2 flex items-center justify-end lg:col-start-6 lg:row-start-1">
          <span
            className="text-right text-xs font-medium text-faint"
            title={job.posted_date ?? undefined}
          >
            {relativeJobAge(job, now)}
          </span>
        </div>

        <div className="pointer-events-none relative z-30 col-start-3 row-start-1 flex items-center justify-end gap-1.5 justify-self-end lg:col-start-7">
          <SaveButton saved={saved} onToggle={onToggleSaved} />
          <ApplicationStageMenu
            stage={stage}
            jobLabel={`${job.title} at ${job.company}`}
            onChange={onStageChange}
          />
          {!dense && (
            <a
              href={job.link}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto ml-0.5 hidden min-h-9 items-center rounded-full border border-accent/45 bg-accent/10 px-3.5 text-xs font-semibold text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-[color,background-color,border-color,box-shadow] hover:border-accent hover:bg-accent hover:text-white hover:shadow-[0_8px_24px_rgba(10,132,255,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"
            >
              Apply
            </a>
          )}
        </div>
      </article>
    </li>
  );
}

function CompensationTag({
  compensation,
  className = "",
}: {
  compensation: Compensation;
  className?: string;
}) {
  return (
    <span
      data-salary-kind={compensation.kind}
      data-testid="salary-pill"
      title={compensation.disclosure}
      aria-label={`${compensation.label}. ${compensation.disclosure}`}
      className={`inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        compensation.kind === "category-estimate"
          ? "border-champagne/30 bg-champagne/10 text-champagne"
          : "border-new/30 bg-new-soft text-new"
      } ${className}`}
    >
      {compensation.label}
    </span>
  );
}

function SponsorshipTag({
  sponsorship,
  className = "",
}: {
  sponsorship: string | null;
  className?: string;
}) {
  const status = classifySponsorship(sponsorship);
  const label =
    status === "offers-sponsorship"
      ? "Sponsors visa"
      : status === "citizens-only"
        ? "Citizens only"
        : status === "no-sponsorship"
          ? "No sponsorship"
          : "Sponsorship unknown";

  return (
    <span
      className={`max-w-full truncate text-[10px] font-medium ${
        status === "offers-sponsorship"
          ? "text-new"
          : status === "unknown"
            ? "text-faint"
            : "text-muted"
      } ${className}`}
    >
      {label}
    </span>
  );
}

function FreshnessBadge({ days }: { days: number }) {
  if (days <= HOT_DAYS) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide text-hot">
        <span className="size-1.5 animate-pulse rounded-full bg-hot motion-reduce:animate-none" />
        HOT
      </span>
    );
  }
  if (days <= NEW_DAYS) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide text-new">
        <span className="size-1.5 rounded-full bg-new" />
        NEW
      </span>
    );
  }
  return null;
}

function SaveButton({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={saved ? "Remove from saved" : "Save role"}
      aria-pressed={saved}
      title={saved ? "Remove from saved" : "Save role"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`pointer-events-auto flex size-11 items-center justify-center rounded-full transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-9 ${
        saved ? "text-hot" : "text-faint hover:text-fg"
      }`}
    >
      <StarIcon filled={saved} />
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

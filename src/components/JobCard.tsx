"use client";

import { ApplicationStageMenu } from "@/components/ApplicationStageMenu";
import { CompanyLogo } from "@/components/CompanyLogo";
import { JobSaveButton } from "@/components/JobSaveButton";
import { trackApplyClicked } from "@/lib/analytics";
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
import { listingEvidenceFor } from "@/lib/jobPresentation";
import { CATEGORY_LABELS, type Internship } from "@/lib/types";

export function JobCard({
  job,
  now,
  dense,
  saved,
  stage,
  onOpenDetails,
  onToggleSaved,
  onStageChange,
}: {
  job: Internship;
  now: number;
  dense: boolean;
  saved: boolean;
  stage: ApplicationStage;
  onOpenDetails: () => void;
  onToggleSaved: () => void;
  onStageChange: (stage: ApplicationStage) => void;
}) {
  const days = daysAgo(job, now);
  const compensation = compensationFor(job);
  const evidence = listingEvidenceFor(job, now);
  const displayLocation =
    getUsLocationDisplay(job.location) || "Location unavailable";
  const statusAccent =
    stage === "offer"
      ? "border-success/35"
      : stage === "interview"
        ? "border-info/35"
        : stage === "rejected"
          ? "border-error/35"
          : "border-border";

  return (
    <li className="motion-product-card">
      <article
        data-job-row
        data-job-id={job.id}
        data-testid="job-row"
        data-company={job.company}
        data-application-stage={stage}
        data-view={dense ? "compact-card" : "card"}
        className={`ui-card group relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 overflow-hidden px-4 py-4 transition-[border-color,box-shadow,background-color] hover:border-border-strong hover:shadow-[var(--shadow-card-hover)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 ${statusAccent}`}
      >
        <button
          type="button"
          data-job-details-trigger
          aria-label={`View details for ${job.title} at ${job.company}`}
          onClick={onOpenDetails}
          className="absolute inset-0 z-0 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-focus"
        />

        <span className="pointer-events-none relative z-10">
          <CompanyLogo company={job.company} size={dense ? 36 : 44} />
        </span>

        <div className="pointer-events-none relative z-10 min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-extrabold text-fg sm:text-[15px]">
              {job.company}
            </span>
            <FreshnessBadge days={days} />
            {evidence.state === "verified" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-success">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                Verified at source
              </span>
            )}
            <span
              className="text-[11px] font-medium text-faint"
              title={job.posted_date ?? undefined}
            >
              {relativeJobAge(job, now)}
            </span>
          </div>
          <h3
            className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-muted sm:text-[15px]"
            title={job.title}
          >
            {job.title}
          </h3>
        </div>

        <div className="pointer-events-auto relative z-20 col-span-2 flex items-center gap-1.5 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end">
          <JobSaveButton saved={saved} onToggle={onToggleSaved} />
          <ApplicationStageMenu
            stage={stage}
            jobLabel={`${job.title} at ${job.company}`}
            onChange={onStageChange}
          />
          <a
            href={job.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackApplyClicked({
                surface: "job-board",
                roleType: job.role_type,
                category: job.category,
              })
            }
            className="ui-button ui-button--primary ui-button--apply ui-button--sm ml-auto min-h-11 px-3 sm:ml-0 sm:min-h-9"
          >
            Apply
            <span aria-hidden>↗</span>
          </a>
        </div>

        <div className="pointer-events-none relative z-10 col-span-2 grid min-w-0 gap-2 border-t border-border/70 pt-3 sm:col-start-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            <span className="max-w-full truncate" title={displayLocation}>
              {displayLocation}
            </span>
            <span aria-hidden className="hidden text-border-strong sm:inline">
              ·
            </span>
            <span>{job.season?.trim() || "Start period unavailable"}</span>
            <span className={`cat cat-${job.category}`}>
              {CATEGORY_LABELS[job.category]}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <CompensationTag compensation={compensation} />
            <SponsorshipTag sponsorship={job.sponsorship} />
          </div>
        </div>
      </article>
    </li>
  );
}

export function CompensationTag({
  compensation,
  className = "",
}: {
  compensation: Compensation;
  className?: string;
}) {
  const sourceListed = compensation.kind === "source-listed";
  return (
    <span
      data-salary-kind={compensation.kind}
      data-testid="salary-pill"
      title={compensation.disclosure}
      aria-label={`${compensation.label}. ${compensation.disclosure}`}
      className={`ui-badge max-w-full overflow-hidden text-ellipsis text-[10px] ${
        sourceListed
          ? "border-success/30 bg-success-soft text-success"
          : "border-warning/30 bg-warning-soft text-warning"
      } ${className}`}
    >
      <span className="font-extrabold">
        {sourceListed ? "Employer-listed" : "Timley estimate"}
      </span>
      <span aria-hidden>·</span>
      {compensation.label}
    </span>
  );
}

export function SponsorshipTag({
  sponsorship,
  className = "",
}: {
  sponsorship: string | null;
  className?: string;
}) {
  const status = classifySponsorship(sponsorship);
  const label =
    status === "offers-sponsorship"
      ? "Sponsorship confirmed"
      : status === "citizens-only"
        ? "Citizens only"
        : status === "no-sponsorship"
          ? "No sponsorship"
          : "Sponsorship unknown";

  return (
    <span
      className={`max-w-full truncate text-[10px] font-semibold ${
        status === "offers-sponsorship"
          ? "text-success"
          : status === "unknown"
            ? "text-faint"
            : "text-muted"
      } ${className}`}
    >
      {label}
    </span>
  );
}

export function FreshnessBadge({ days }: { days: number }) {
  if (days <= HOT_DAYS) {
    return (
      <span className="motion-value-update inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wide text-accent-hover">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        HOT
      </span>
    );
  }
  if (days <= NEW_DAYS) {
    return (
      <span className="motion-value-update inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wide text-info">
        <span className="size-1.5 rounded-full bg-info" aria-hidden />
        NEW
      </span>
    );
  }
  return null;
}

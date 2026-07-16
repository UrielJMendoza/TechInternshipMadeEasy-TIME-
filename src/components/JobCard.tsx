"use client";

import { useId } from "react";
import { ApplicationStageMenu } from "@/components/ApplicationStageMenu";
import { CompanyLogo } from "@/components/CompanyLogo";
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
  relativeTimestamp,
} from "@/lib/jobTime";
import {
  UNKNOWN_TERM_KEY,
  termLabelFromKey,
  type InternshipTermKey,
} from "@/lib/jobTerms";
import { SOURCE_LABELS } from "@/lib/ingest/sourceRegistry";
import {
  CATEGORY_LABELS,
  type Internship,
  type SourceId,
} from "@/lib/types";

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
  const titleId = useId();
  const companyId = useId();
  const days = daysAgo(job, now);
  const compensation = compensationFor(job);
  const termLabels = job.role_type === "internship"
    ? termLabelsFromKeys(job.term_keys)
    : [];
  const displayLocation =
    getUsLocationDisplay(job.location, {
      allowAmbiguousRemote: job.country_code === "US",
    }) || "Location unavailable";
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
        data-tracking-key={job.tracking_key}
        data-application-stage={stage}
        aria-labelledby={`${titleId} ${companyId}`}
        className={`group relative isolate ${JOB_GRID} rounded-2xl border bg-surface transition-[border-color,box-shadow,background-color] hover:border-white/25 hover:bg-surface/70 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] ${statusAccent} ${
          dense
            ? "px-4 py-4 sm:px-5 lg:py-2"
            : "px-4 py-4 sm:px-5"
        }`}
      >
        <span className="pointer-events-none relative z-10 row-span-3 lg:row-span-1">
          <CompanyLogo
            company={job.company}
            domain={job.company_domain}
            listingUrl={job.link}
            size={logoSize}
          />
        </span>

        <a
          href={job.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${job.title} at ${job.company} — open listing${
            termLabels.length > 0
              ? `. Internship ${termLabels.length === 1 ? "term" : "terms"}: ${termLabels.join(", ")}`
              : ""
          }`}
          className="pointer-events-auto min-w-0 after:absolute after:inset-0 after:z-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
        >
          <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              id={companyId}
              className={`min-w-0 flex-1 basis-24 truncate font-semibold ${dense ? "text-[15px] lg:text-[13px]" : "text-[15px]"}`}
            >
              {job.company}
            </span>
            <FreshnessBadge days={days} />
            {job.role_type === "internship" && (
              <JobTermBadges termKeys={job.term_keys} />
            )}
          </div>
          <h2
            id={titleId}
            title={job.title}
            className={`relative z-10 mt-0.5 truncate font-normal text-muted ${
              dense ? "text-sm lg:text-xs" : "text-sm"
            }`}
          >
            {job.title}
          </h2>
        </a>

        <div className="pointer-events-none relative z-10 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:col-start-3 lg:row-start-1">
          <span className={`cat cat-${job.category}`}>
            {CATEGORY_LABELS[job.category]}
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
          <time
            dateTime={job.posted_date ?? job.first_seen_at}
            className="text-right text-xs font-medium text-faint"
            title={job.posted_date ?? job.first_seen_at}
          >
            {relativeJobAge(job, now)}
          </time>
        </div>

        <div className="pointer-events-none relative z-30 col-start-2 col-span-2 row-start-3 mt-3 flex items-center justify-end gap-1.5 justify-self-end sm:col-start-3 sm:col-span-1 sm:row-start-1 sm:mt-0 lg:col-start-7">
          <SaveButton saved={saved} onToggle={onToggleSaved} />
          <ApplicationStageMenu
            stage={stage}
            jobLabel={`${job.title} at ${job.company}`}
            onChange={onStageChange}
          />
          <a
            href={job.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Apply to ${job.title} at ${job.company} (opens in a new tab)`}
            className="pointer-events-auto ml-0.5 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent bg-action px-3.5 text-xs font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[background-color,border-color,box-shadow] hover:border-accent hover:bg-action-hover hover:shadow-[0_8px_24px_rgba(0,102,204,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:min-h-9"
          >
            Apply
            <ExternalLinkIcon />
          </a>
        </div>
      </article>
      <JobTrustPanel job={job} now={now} dense={dense} />
    </li>
  );
}

function sourceLabel(source: string): string {
  return source in SOURCE_LABELS
    ? SOURCE_LABELS[source as SourceId]
    : source;
}

function reportUrl(job: Internship, kind: string, label: string): string {
  const query = new URLSearchParams({
    title: `${label}: ${job.company} — ${job.title}`,
    body: [
      `Report type: ${kind}`,
      `Tracking key: ${job.tracking_key}`,
      `Listing: ${job.link}`,
      "",
      "What should be corrected?",
    ].join("\n"),
  });
  return `https://github.com/UrielJMendoza/TechInternshipMadeEasy-TIME-/issues/new?${query}`;
}

function confidenceLabel(value: number): string {
  if (value >= 0.8) return "High";
  if (value >= 0.6) return "Medium";
  return "Low";
}

function displayDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Unknown"
    : parsed.toISOString().slice(0, 10);
}

function JobTrustPanel({
  job,
  now,
  dense,
}: {
  job: Internship;
  now: number;
  dense: boolean;
}) {
  const sourceNames = job.contributing_sources.map(sourceLabel);
  const salaryTrust = job.salary_provenance === "source-listed"
    ? "Source-listed; not independently verified"
    : "No source-listed pay; estimates never affect sorting";

  return (
    <details
      className={`group/trust mx-2 border-x border-b border-border/70 bg-surface/70 px-3 ${
        dense ? "rounded-b-xl" : "rounded-b-2xl"
      }`}
    >
      <summary className="cursor-pointer py-1.5 text-xs font-semibold text-faint marker:text-accent hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        Source &amp; trust details
      </summary>
      <div className="grid gap-4 border-t border-border/70 py-3 text-xs text-muted sm:grid-cols-2 lg:grid-cols-3">
        <dl className="space-y-1.5">
          <div>
            <dt className="font-semibold text-faint">Contributing sources</dt>
            <dd>{sourceNames.length > 0 ? sourceNames.join(", ") : sourceLabel(job.source)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-faint">First seen</dt>
            <dd>
              <time dateTime={job.first_seen_at}>{displayDate(job.first_seen_at)}</time>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-faint">Last checked</dt>
            <dd title={job.last_checked_at}>
              {relativeTimestamp(job.last_checked_at, now)}
            </dd>
          </div>
        </dl>

        <dl className="space-y-1.5">
          <div>
            <dt className="font-semibold text-faint">Location confidence</dt>
            <dd>{confidenceLabel(job.normalization_confidence)} ({Math.round(job.normalization_confidence * 100)}%)</dd>
          </div>
          <div>
            <dt className="font-semibold text-faint">Pay provenance</dt>
            <dd>{salaryTrust}</dd>
          </div>
          <div>
            <dt className="font-semibold text-faint">Recent listing changes</dt>
            <dd>
              {job.listing_changes.length === 0
                ? "No changes recorded"
                : job.listing_changes.map((change) =>
                    change.changed_fields.join(", ").replaceAll("_", " "),
                  ).join("; ")}
            </dd>
          </div>
        </dl>

        <div>
          <p className="font-semibold text-faint">Report an issue</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-2">
            {[
              ["closed", "Closed role"],
              ["duplicate", "Duplicate"],
              ["wrong_location", "Wrong location"],
              ["wrong_pay", "Wrong pay"],
            ].map(([kind, label]) => (
              <a
                key={kind}
                href={reportUrl(job, kind, label)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm text-accent underline underline-offset-2 hover:text-[#64aeff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </details>
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
      className={`inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${
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
      className={`max-w-full truncate text-xs font-medium ${
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
      <span className="inline-flex items-center gap-1 text-xs font-bold tracking-wide text-hot">
        <span className="size-1.5 animate-pulse rounded-full bg-hot motion-reduce:animate-none" />
        HOT
      </span>
    );
  }
  if (days <= NEW_DAYS) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold tracking-wide text-new">
        <span className="size-1.5 rounded-full bg-new" />
        NEW
      </span>
    );
  }
  return null;
}

function JobTermBadges({
  termKeys,
}: {
  termKeys: readonly InternshipTermKey[];
}) {
  const uniqueTerms = [...new Set(termKeys)];
  const labels = termLabelsFromKeys(uniqueTerms);
  const visibleLabels = labels.slice(0, 2);
  const hiddenCount = Math.max(0, labels.length - visibleLabels.length);

  return (
    <span
      data-testid="job-term-badges"
      data-term-keys={uniqueTerms.length > 0 ? uniqueTerms.join(",") : UNKNOWN_TERM_KEY}
      role="group"
      aria-label={`${labels.length === 1 ? "Internship term" : "Internship terms"}: ${labels.join(", ")}`}
      title={labels.join(", ")}
      className="inline-flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1"
    >
      {visibleLabels.map((label) => (
        <span
          key={label}
          aria-hidden
          className={`inline-flex max-w-full items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${
            label === "Term not listed"
              ? "border-border bg-raised text-faint"
              : "border-champagne/30 bg-champagne/10 text-champagne"
          }`}
        >
          {label}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          aria-hidden
          className="inline-flex items-center rounded-full border border-border bg-raised px-1.5 py-0.5 text-[10px] font-bold text-faint whitespace-nowrap"
        >
          +{hiddenCount}
        </span>
      )}
    </span>
  );
}

function termLabelsFromKeys(
  termKeys: readonly InternshipTermKey[],
): string[] {
  const uniqueTerms = [...new Set(termKeys)];
  return uniqueTerms.length > 0
    ? uniqueTerms.map(termLabelFromKey)
    : ["Term not listed"];
}

function SaveButton({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  const label = saved ? "Remove from To apply" : "Add to To apply";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={`pointer-events-auto flex size-11 items-center justify-center rounded-full transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:size-9 ${
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

function ExternalLinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

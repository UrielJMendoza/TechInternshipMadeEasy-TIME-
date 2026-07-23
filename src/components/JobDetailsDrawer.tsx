"use client";

import {
  ApplicationStageBadge,
  ApplicationStageMenu,
} from "@/components/ApplicationStageMenu";
import { BottomSheet } from "@/components/BottomSheet";
import { CompanyLogo } from "@/components/CompanyLogo";
import { JobSaveButton } from "@/components/JobSaveButton";
import { ReportListing } from "@/components/ReportListing";
import { ShareControls } from "@/components/ShareControls";
import type { ApplicationStage } from "@/lib/applicationTracking";
import { trackApplyClicked } from "@/lib/analytics";
import { compensationFor } from "@/lib/compensation";
import { classifySponsorship } from "@/lib/jobFilters";
import { getUsLocationDisplay } from "@/lib/jobLocations";
import {
  formatEvidenceDate,
  listingEvidenceFor,
  missingJobEvidence,
  sourceDetailsFor,
} from "@/lib/jobPresentation";
import { relativeTimestamp } from "@/lib/jobTime";
import { jobPublicPath } from "@/lib/publicCatalog";
import {
  CATEGORY_LABELS,
  type Internship,
} from "@/lib/types";

interface JobDetailsDrawerProps {
  job: Internship;
  now: number;
  saved: boolean;
  stage: ApplicationStage;
  similarJobs: Internship[];
  onClose: () => void;
  onToggleSaved: () => void;
  onStageChange: (stage: ApplicationStage) => void;
  onSelectSimilar: (job: Internship) => void;
}

type JobDetailsContentProps = Omit<JobDetailsDrawerProps, "onClose">;

export function JobDetailsDrawer({
  job,
  now,
  saved,
  stage,
  similarJobs,
  onClose,
  onToggleSaved,
  onStageChange,
  onSelectSimilar,
}: JobDetailsDrawerProps) {
  const listingEvidence = listingEvidenceFor(job, now);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Job details"
      presentation="detail-drawer"
      footer={
        listingEvidence.state === "possibly-closed" ||
        listingEvidence.state === "expired" ? (
          <div
            role="status"
            className="ui-control flex min-h-11 w-full items-center justify-center bg-raised px-4 text-sm font-bold text-muted"
          >
            {listingEvidence.state === "expired"
              ? "Listing has expired"
              : "Listing may no longer be active"}
          </div>
        ) : (
          <a
            data-sticky-apply
            href={job.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackApplyClicked({
                surface: "job-drawer",
                roleType: job.role_type,
                category: job.category,
              })
            }
            className="ui-button ui-button--primary ui-button--apply w-full"
          >
            Apply on external site
            <span aria-hidden>↗</span>
          </a>
        )
      }
    >
      <JobDetailsContent
        job={job}
        now={now}
        saved={saved}
        stage={stage}
        similarJobs={similarJobs}
        onToggleSaved={onToggleSaved}
        onStageChange={onStageChange}
        onSelectSimilar={onSelectSimilar}
      />
    </BottomSheet>
  );
}

export function JobDetailsContent({
  job,
  now,
  saved,
  stage,
  similarJobs,
  onToggleSaved,
  onStageChange,
  onSelectSimilar,
}: JobDetailsContentProps) {
  const compensation = compensationFor(job);
  const listingEvidence = listingEvidenceFor(job, now);
  const source = sourceDetailsFor(job.source);
  const missing = missingJobEvidence(job);
  const location = getUsLocationDisplay(job.location) || "Unavailable";
  const sponsorship = sponsorshipDetails(job.sponsorship);

  return (
    <article className="job-detail">
      <div className="flex items-start gap-4">
        <CompanyLogo company={job.company} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-fg">{job.company}</p>
            <span className={`cat cat-${job.category}`}>
              {CATEGORY_LABELS[job.category]}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-[-0.025em] text-fg sm:text-2xl">
            {job.title}
          </h2>
          <p className="mt-2 text-sm text-muted">{location}</p>
        </div>
      </div>

      <div
        data-listing-state={listingEvidence.state}
        className={`mt-5 rounded-lg border px-3.5 py-3 ${
          listingEvidence.state === "verified"
            ? "border-success/30 bg-success-soft text-success"
            : listingEvidence.state === "active"
              ? "border-info/30 bg-info-soft text-info"
              : listingEvidence.state === "possibly-closed"
              ? "border-warning/35 bg-warning-soft text-warning"
              : "border-error/30 bg-error-soft text-error"
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.08em]">
          <span className="size-2 rounded-full bg-current" aria-hidden />
          {listingEvidence.label}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-current">
          {listingEvidence.description}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-border pb-5">
        <JobSaveButton
          saved={saved}
          onToggle={onToggleSaved}
          showLabel
        />
        <ApplicationStageMenu
          stage={stage}
          jobLabel={`${job.title} at ${job.company}`}
          onChange={onStageChange}
        />
        <ApplicationStageBadge stage={stage} />
        <ShareControls
          path={jobPublicPath(job)}
          title={`${job.title} at ${job.company}`}
          compact
        />
      </div>

      <section className="mt-6" aria-labelledby="job-facts-heading">
        <h3
          id="job-facts-heading"
          className="text-xs font-extrabold uppercase tracking-[0.1em] text-faint"
        >
          Role facts
        </h3>
        <dl className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          <EvidenceItem label="Location" value={location} />
          <EvidenceItem
            label="Role category"
            value={CATEGORY_LABELS[job.category]}
          />
          <EvidenceItem
            label="Opportunity"
            value={
              job.role_type === "internship" ? "Internship" : "New graduate"
            }
          />
          <EvidenceItem
            label="Start period"
            value={job.season?.trim() || "Unavailable"}
          />
          <EvidenceItem
            label="Source"
            value={
              source.repositoryUrl ? (
                <a
                  href={source.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-accent-hover underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                >
                  {source.label}
                  <span className="sr-only"> (opens source repository)</span>
                </a>
              ) : (
                source.label
              )
            }
          />
          <EvidenceItem
            label="First seen"
            value={formatEvidenceDate(job.first_seen_at)}
            detail={relativeEvidenceTime(job.first_seen_at, now)}
          />
          <EvidenceItem
            label="Original posting date"
            value={formatEvidenceDate(job.posted_date)}
          />
          <EvidenceItem
            label="Last observed in source"
            value={formatEvidenceDate(job.last_seen_at)}
            detail={relativeEvidenceTime(job.last_seen_at, now)}
          />
          <EvidenceItem
            label="Last verified"
            value={formatEvidenceDate(job.last_verified_at ?? null)}
            detail={relativeEvidenceTime(job.last_verified_at ?? null, now)}
          />
          <EvidenceItem
            label="Canonical application URL"
            value={
              <a
                href={job.canonical_url ?? job.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-accent-hover underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
              >
                Open canonical destination
              </a>
            }
          />
          {(job.requisition_id || job.external_job_id) && (
            <EvidenceItem
              label="Listing identifier"
              value={job.requisition_id ?? job.external_job_id}
            />
          )}
          {job.duplicate_group && (
            <EvidenceItem
              label="Duplicate group"
              value={job.duplicate_group}
            />
          )}
        </dl>
      </section>

      <section className="mt-6" aria-labelledby="pay-evidence-heading">
        <h3
          id="pay-evidence-heading"
          className="text-xs font-extrabold uppercase tracking-[0.1em] text-faint"
        >
          Compensation
        </h3>
        <div
          data-salary-kind={compensation.kind}
          className={`mt-3 rounded-lg border px-4 py-4 ${
            compensation.kind === "source-listed"
              ? "border-success/30 bg-success-soft"
              : "border-warning/35 bg-warning-soft"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p
              className={`text-lg font-extrabold ${
                compensation.kind === "source-listed"
                  ? "text-success"
                  : "text-warning"
              }`}
            >
              {compensation.label}
            </p>
            <span
              className={`ui-badge ${
                compensation.kind === "source-listed"
                  ? "border-success/30 bg-surface text-success"
                  : "border-warning/30 bg-surface text-warning"
              }`}
            >
              {compensation.kind === "source-listed"
                ? "Employer-listed pay"
                : "Timley estimate"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {compensation.disclosure}
          </p>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="sponsorship-evidence-heading">
        <h3
          id="sponsorship-evidence-heading"
          className="text-xs font-extrabold uppercase tracking-[0.1em] text-faint"
        >
          Sponsorship
        </h3>
        <div className="mt-3 rounded-lg border border-border bg-raised px-4 py-4">
          <p className="text-sm font-extrabold text-fg">
            {sponsorship.label}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {sponsorship.evidence}
          </p>
        </div>
      </section>

      {missing.length > 0 && (
        <aside className="mt-6 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-xs font-extrabold text-fg">Partial listing data</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The source did not provide {naturalList(missing)}. Timley leaves
            those fields unavailable or clearly marks its broad pay estimate.
          </p>
        </aside>
      )}

      <ReportListing job={job} />

      <section className="mt-7 border-t border-border pt-6" aria-labelledby="similar-roles-heading">
        <h3
          id="similar-roles-heading"
          className="text-xs font-extrabold uppercase tracking-[0.1em] text-faint"
        >
          Similar roles
        </h3>
        {similarJobs.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {similarJobs.map((similar) => (
              <li key={similar.id}>
                <button
                  type="button"
                  onClick={() => onSelectSimilar(similar)}
                  className="ui-card flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition-[border-color,background-color] hover:border-border-strong hover:bg-raised"
                >
                  <CompanyLogo company={similar.company} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-fg">
                      {similar.company}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {similar.title}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-accent-hover">
                    View
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">
            No closely related active roles are available in the current
            results.
          </p>
        )}
      </section>
    </article>
  );
}

function EvidenceItem({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="min-w-0 bg-surface px-3.5 py-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-fg">
        {value}
      </dd>
      {detail && <p className="mt-0.5 text-[11px] text-faint">{detail}</p>}
    </div>
  );
}

function sponsorshipDetails(value: string | null): {
  label: string;
  evidence: string;
} {
  const status = classifySponsorship(value);
  if (status === "offers-sponsorship") {
    return {
      label: "Sponsorship confirmed",
      evidence: value?.trim() || "The source explicitly marks this role as sponsoring.",
    };
  }
  if (status === "citizens-only") {
    return {
      label: "Citizenship or work-authorization restriction",
      evidence:
        value?.trim() ||
        "The source indicates a citizenship or security-clearance restriction.",
    };
  }
  if (status === "no-sponsorship") {
    return {
      label: "No sponsorship",
      evidence:
        value?.trim() ||
        "The source explicitly indicates that sponsorship is unavailable.",
    };
  }
  return {
    label: "Sponsorship unknown",
    evidence:
      "The source does not provide clear sponsorship evidence. Timley does not infer eligibility.",
  };
}

function naturalList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items.at(-1)}`;
}

function relativeEvidenceTime(
  value: string | null,
  now: number,
): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) return undefined;
  return relativeTimestamp(value, now);
}

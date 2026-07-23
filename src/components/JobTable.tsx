"use client";

import { ApplicationStageMenu } from "@/components/ApplicationStageMenu";
import { CompanyLogo } from "@/components/CompanyLogo";
import {
  CompensationTag,
  FreshnessBadge,
  SponsorshipTag,
} from "@/components/JobCard";
import { JobSaveButton } from "@/components/JobSaveButton";
import { trackApplyClicked } from "@/lib/analytics";
import {
  getApplicationStage,
  type ApplicationRecords,
  type ApplicationStage,
} from "@/lib/applicationTracking";
import { compensationFor } from "@/lib/compensation";
import { getUsLocationDisplay } from "@/lib/jobLocations";
import { daysAgo, relativeJobAge } from "@/lib/jobTime";
import { CATEGORY_LABELS, type Internship } from "@/lib/types";

export function JobTable({
  jobs,
  now,
  saved,
  applications,
  onOpenDetails,
  onToggleSaved,
  onStageChange,
}: {
  jobs: Internship[];
  now: number;
  saved: ReadonlySet<string>;
  applications: ApplicationRecords;
  onOpenDetails: (job: Internship) => void;
  onToggleSaved: (job: Internship) => void;
  onStageChange: (job: Internship, stage: ApplicationStage) => void;
}) {
  return (
    <div className="ui-card overflow-hidden">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">
          Job results in compact table view
        </caption>
        <colgroup>
          <col className="w-[31%]" />
          <col className="w-[16%]" />
          <col className="w-[11%]" />
          <col className="w-[15%]" />
          <col className="w-[8%]" />
          <col className="w-[10%]" />
          <col className="w-[9%]" />
        </colgroup>
        <thead className="border-b border-border bg-raised">
          <tr className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint">
            <th scope="col" className="px-4 py-2.5">
              Company / role
            </th>
            <th scope="col" className="px-3 py-2.5">
              Location
            </th>
            <th scope="col" className="px-3 py-2.5">
              Start
            </th>
            <th scope="col" className="px-3 py-2.5">
              Pay / eligibility
            </th>
            <th scope="col" className="px-3 py-2.5">
              Freshness
            </th>
            <th scope="col" className="px-3 py-2.5">
              Stage
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => {
            const stage = getApplicationStage(applications, job.link);
            const location =
              getUsLocationDisplay(job.location) || "Unavailable";
            const days = daysAgo(job, now);
            return (
              <tr
                key={job.id}
                data-job-row
                data-job-id={job.id}
                data-testid="job-table-row"
                data-application-stage={stage}
                className="group bg-surface align-middle transition-colors hover:bg-raised"
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyLogo company={job.company} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-extrabold text-fg">
                        {job.company}
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenDetails(job)}
                        className="mt-0.5 block max-w-full truncate text-left text-xs font-semibold text-muted underline decoration-transparent underline-offset-2 transition-colors hover:text-accent-hover hover:decoration-accent/40"
                        title={job.title}
                      >
                        {job.title}
                      </button>
                      <span className={`cat cat-${job.category} mt-1`}>
                        {CATEGORY_LABELS[job.category]}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="line-clamp-2 text-xs text-muted"
                    title={location}
                  >
                    {location}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted">
                  {job.season?.trim() || "Unavailable"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <CompensationTag
                      compensation={compensationFor(job)}
                    />
                    <SponsorshipTag sponsorship={job.sponsorship} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <FreshnessBadge days={days} />
                  <span className="mt-1 block text-[11px] font-medium text-faint">
                    {relativeJobAge(job, now)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ApplicationStageMenu
                    stage={stage}
                    jobLabel={`${job.title} at ${job.company}`}
                    onChange={(nextStage) =>
                      onStageChange(job, nextStage)
                    }
                  />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <JobSaveButton
                      saved={saved.has(job.link)}
                      onToggle={() => onToggleSaved(job)}
                    />
                    <a
                      href={job.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackApplyClicked({
                          surface: "job-table",
                          roleType: job.role_type,
                          category: job.category,
                        })
                      }
                      className="ui-button ui-button--primary ui-button--apply ui-button--sm px-2.5"
                    >
                      Apply
                      <span aria-hidden>↗</span>
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

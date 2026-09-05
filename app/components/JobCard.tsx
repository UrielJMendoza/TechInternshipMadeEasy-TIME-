"use client";

import type { JobCardData } from "./job-types";
import { CompanyLogo } from "./CompanyLogo";
import { Recency } from "./Recency";
import { SaveButton } from "./SaveButton";
import { jobDetailHref } from "@/lib/navigation/job-return-path";

type JobCardProps = {
  job: JobCardData;
  liveRecency?: boolean;
  returnTo?: string;
};

export function JobCard({ job, liveRecency = false, returnTo = "/jobs" }: JobCardProps) {
  const titleId = `job-${job.id}-title`;
  const cardId = `listing-${job.id}`;
  const compensation = job.compensation?.replace(/[–—]/g, " to ");
  const sponsorship =
    job.sponsorship === "Confirmed"
      ? "Visa support confirmed"
      : job.sponsorship === "Not offered"
        ? "No visa support"
        : undefined;
  const compensationAndSponsorship = [compensation, sponsorship].filter(Boolean).join(" · ");

  return (
    <article className="job-card" id={cardId} aria-labelledby={titleId}>
      <CompanyLogo company={job.company} domain={job.companyDomain} />
      <div className="job-primary">
        <a className="job-card-link" href={jobDetailHref(job.id, `${returnTo}#${cardId}`)}>
          <h3 id={titleId}>{job.title}</h3>
        </a>
        {job.titleIncomplete ? (
          <span className="job-title-note">Source title appears shortened</span>
        ) : null}
        <p className="job-company">
          <span>{job.company}</span>
          <span aria-hidden="true">/</span>
          <span>{job.location}</span>
        </p>
      </div>
      <div className="job-facts" aria-label="Job details">
        <Recency
          kind={job.freshnessKind}
          label={job.freshnessLabel}
          timestamp={job.postedAt ?? job.firstSeenAt}
          precision={job.postedAtPrecision}
          recalculate={liveRecency}
        />
        <span>{job.roleLevel} · {job.workplace}</span>
        {compensationAndSponsorship ? <span>{compensationAndSponsorship}</span> : null}
      </div>
      <div className="job-actions">
        <SaveButton job={job} />
        <a
          className="apply"
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Apply for ${job.title} at ${job.company} on the employer website`}
        >
          Apply
        </a>
      </div>
    </article>
  );
}

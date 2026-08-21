"use client";

import type { JobCardData } from "./job-types";
import { CompanyLogo } from "./CompanyLogo";
import { SaveButton } from "./SaveButton";

type JobCardProps = {
  job: JobCardData;
};

export function JobCard({ job }: JobCardProps) {
  const titleId = `job-${job.id}-title`;
  const compensation = (job.compensation ?? "Compensation not listed").replace(/[–—]/g, " to ");
  const sponsorship =
    job.sponsorship === "Confirmed"
      ? "Visa support confirmed"
      : job.sponsorship === "Not offered"
        ? "No visa support"
        : undefined;

  return (
    <article className="job-card" aria-labelledby={titleId}>
      <CompanyLogo company={job.company} />
      <div className="job-primary">
        <a className="job-card-link" href={`/jobs/${encodeURIComponent(job.id)}`}>
          <h3 id={titleId}>{job.title}</h3>
        </a>
        <p className="job-company">
          <span>{job.company}</span>
          <span aria-hidden="true">/</span>
          <span>{job.location}</span>
        </p>
      </div>
      <div className="job-facts" aria-label="Job details">
        <strong className={job.freshnessKind === "found" ? "fresh-found" : undefined}>
          {job.freshnessLabel}
        </strong>
        <span>{job.roleLevel} · {job.workplace}</span>
        <span>{compensation}{sponsorship ? ` · ${sponsorship}` : ""}</span>
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

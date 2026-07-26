import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { compensationFor } from "@/lib/compensation";
import { relativeJobAge } from "@/lib/jobTime";
import { jobPublicPath } from "@/lib/publicCatalog";
import type { Internship } from "@/lib/types";

interface DiscoveryShowcaseProps {
  jobs: Internship[];
  generatedAt: string;
}

function DiscoveryListing({
  job,
  now,
}: {
  job: Internship;
  now: number;
}) {
  const compensation = compensationFor(job);

  return (
    <Link
      href={jobPublicPath(job)}
      className="landing-search-result"
      aria-label={`View ${job.title} at ${job.company}`}
    >
      <CompanyLogo company={job.company} size={42} curatedOnly />
      <div className="landing-search-result__identity">
        <p>{job.company}</p>
        <h3>{job.title}</h3>
      </div>
      <div className="landing-search-result__context">
        <span>{job.location || "Location unavailable"}</span>
        <strong className={compensation.estimated ? "text-warning" : "text-info"}>
          {compensation.label}
        </strong>
      </div>
      <time dateTime={job.first_seen_at}>{relativeJobAge(job, now)}</time>
      <span className="landing-search-result__open" aria-hidden>
        →
      </span>
    </Link>
  );
}

export function DiscoveryShowcase({
  jobs,
  generatedAt,
}: DiscoveryShowcaseProps) {
  const now = Date.parse(generatedAt);

  return (
    <section
      id="job-discovery"
      aria-labelledby="job-discovery-title"
      className="theme-application landing-search-showcase"
    >
      <div className="landing-reveal mx-auto max-w-[90rem] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <header className="landing-section-heading">
          <h2 id="job-discovery-title">Jobs</h2>
          <Link
            href="/jobs"
            className="ui-button ui-button--primary min-h-11 px-5"
          >
            View all jobs
            <span aria-hidden>↗</span>
          </Link>
        </header>

        <div className="landing-search-product">
          <div className="landing-search-window">
            <div className="landing-search-window__top">
              <strong>Current listings</strong>
              <span>{Math.min(jobs.length, 3)} shown</span>
            </div>

            <Link
              href="/jobs"
              className="landing-search-control"
              aria-label="Search all jobs"
            >
              <span aria-hidden>⌕</span>
              <span>Search jobs</span>
              <span aria-hidden>→</span>
            </Link>

            <div className="landing-search-results">
              {jobs.length > 0 ? (
                jobs
                  .slice(0, 3)
                  .map((job) => (
                    <DiscoveryListing key={job.id} job={job} now={now} />
                  ))
              ) : (
                <div className="landing-search-empty">
                  Current results will appear when the listing feed returns.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

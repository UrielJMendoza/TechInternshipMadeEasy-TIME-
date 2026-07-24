import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { compensationFor } from "@/lib/compensation";
import { relativeJobAge } from "@/lib/jobTime";
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
    <article className="landing-search-result">
      <CompanyLogo company={job.company} size={42} />
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
      <time>{relativeJobAge(job, now)}</time>
      <span className="landing-search-result__save">Save</span>
    </article>
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
      <div className="landing-reveal mx-auto grid max-w-[90rem] gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.72fr)_minmax(36rem,1.28fr)] lg:items-center lg:gap-20 lg:px-8 lg:py-32">
        <div className="landing-showcase-copy">
          <h2 id="job-discovery-title">
            Search the signal.
            <br />
            Keep the context.
          </h2>
          <p>
            Search by role, major, location, freshness, pay, and sponsorship—then
            save the jobs worth pursuing.
          </p>
          <p className="landing-showcase-copy__note">
            The details that matter stay beside each role.
          </p>
          <Link
            href="/jobs"
            className="ui-button ui-button--primary mt-8 min-h-12 px-6"
          >
            Explore Jobs
            <span aria-hidden>↗</span>
          </Link>
        </div>

        <div className="landing-search-product">
          <div className="landing-search-product__beam" aria-hidden />
          <div className="landing-search-window">
            <div className="landing-search-window__top">
              <div>
                <strong>Find your next role</strong>
                <span>Internships and new-grad opportunities</span>
              </div>
              <span>Freshest first</span>
            </div>

            <div className="landing-search-control">
              <span aria-hidden>⌕</span>
              <span>Search company, role, or city</span>
              <kbd>/</kbd>
            </div>

            <div className="landing-search-filters" aria-label="Available search filters">
              <span>Role</span>
              <span>Major</span>
              <span>Location</span>
              <span>Freshness</span>
              <span>Pay</span>
              <span>Sponsorship</span>
            </div>

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

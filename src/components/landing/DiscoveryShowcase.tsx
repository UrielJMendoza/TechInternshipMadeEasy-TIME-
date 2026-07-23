import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { compensationFor } from "@/lib/compensation";
import { relativeJobAge } from "@/lib/jobTime";
import {
  CATEGORY_LABELS,
  type Internship,
} from "@/lib/types";

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
    <article className="landing-discovery-row">
      <CompanyLogo company={job.company} size={38} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-extrabold text-fg">
            {job.company}
          </p>
          <span className="landing-discovery-row__age">
            {relativeJobAge(job, now)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{job.title}</p>
      </div>
      <span className={`cat cat-${job.category}`}>
        {CATEGORY_LABELS[job.category]}
      </span>
      <div className="hidden min-w-0 sm:block">
        <p className="truncate text-xs text-muted">
          {job.location || "Location unavailable"}
        </p>
        <p
          className={`mt-1 truncate text-[11px] font-semibold ${
            compensation.estimated ? "text-warning" : "text-info"
          }`}
        >
          {compensation.label}
        </p>
      </div>
      <span className="landing-discovery-row__track">Track</span>
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
      className="theme-application bg-bg py-20 sm:py-24 lg:py-28"
    >
      <div className="landing-reveal mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(32rem,1.18fr)] lg:items-center lg:gap-16 lg:px-8">
        <div>
          <p className="landing-section-kicker">Job discovery</p>
          <h2
            id="job-discovery-title"
            className="landing-section-title mt-4"
          >
            Search the signal. Keep the context.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Timley brings search, filters, freshness, pay evidence,
            sponsorship details, saving, and application stages into the same
            readable result.
          </p>
          <ul className="landing-feature-list mt-8">
            {[
              "Filter by role type, major, specialization, location, and freshness.",
              "See whether pay came from a source listing or a labeled estimate.",
              "Keep unknown sponsorship information unknown instead of guessing.",
              "Save a role or move it into your tracker without leaving the results.",
            ].map((item) => (
              <li key={item}>
                <span aria-hidden>✓</span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/jobs"
            className="ui-button ui-button--primary mt-9 min-h-11 px-5"
          >
            Explore every filter
            <span aria-hidden>↗</span>
          </Link>
        </div>

        <div className="landing-discovery-window">
          <div className="landing-discovery-window__top">
            <div>
              <p className="text-xs font-extrabold tracking-[0.12em] text-faint uppercase">
                Job results
              </p>
              <p className="mt-1 text-lg font-extrabold tracking-[-0.025em] text-fg">
                Current active listings
              </p>
            </div>
            <span className="landing-discovery-window__count">
              {jobs.length > 0 ? "Live data" : "Data unavailable"}
            </span>
          </div>

          <div className="landing-discovery-search">
            <span aria-hidden>○</span>
            Search company, role, or city
            <kbd>/</kbd>
          </div>

          <div className="landing-discovery-chips">
            <Link href="/jobs?major=computer-science">Computer Science</Link>
            <Link href="/jobs?freshness=new">New</Link>
            <Link href="/jobs?remote=1">Remote</Link>
            <Link href="/jobs?visa=1">Visa sponsorship</Link>
          </div>

          <div className="mt-4 space-y-2">
            {jobs.length > 0 ? (
              jobs
                .slice(0, 3)
                .map((job) => (
                  <DiscoveryListing key={job.id} job={job} now={now} />
                ))
            ) : (
              <div className="rounded-xl border border-border bg-surface px-5 py-10 text-center">
                <p className="font-bold text-fg">Live rows unavailable</p>
                <p className="mt-2 text-sm text-muted">
                  Timley does not substitute fictional roles or companies.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

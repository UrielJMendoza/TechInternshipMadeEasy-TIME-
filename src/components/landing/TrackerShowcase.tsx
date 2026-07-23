import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import type { Internship } from "@/lib/types";

interface TrackerShowcaseProps {
  jobs: Internship[];
}

const EXAMPLE_STAGES = ["Applied", "Interview", "Offer"] as const;

export function TrackerShowcase({ jobs }: TrackerShowcaseProps) {
  return (
    <section
      id="tracker-showcase"
      aria-labelledby="tracker-showcase-title"
      className="theme-application bg-surface py-20 sm:py-24 lg:py-28"
    >
      <div className="landing-reveal mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(32rem,1.12fr)_minmax(0,0.88fr)] lg:items-center lg:gap-16 lg:px-8">
        <div className="landing-tracker-window">
          <div className="landing-tracker-window__top">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.12em] text-faint uppercase">
                Example workflow using current listings
              </p>
              <h3 className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-fg">
                Application tracker
              </h3>
            </div>
            <span>Stored in this browser</span>
          </div>

          <div className="landing-tracker-columns">
            {EXAMPLE_STAGES.map((stage, index) => {
              const job = jobs[index];
              return (
                <article key={stage}>
                  <div className="landing-tracker-column__title">
                    <span aria-hidden />
                    <p>{stage}</p>
                    <small>{job ? "1" : "0"}</small>
                  </div>
                  {job ? (
                    <div className="landing-tracker-card">
                      <CompanyLogo company={job.company} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-fg">
                          {job.company}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">
                          {job.title}
                        </p>
                      </div>
                      <span aria-hidden>⋯</span>
                    </div>
                  ) : (
                    <div className="landing-tracker-card landing-tracker-card--empty">
                      Live example unavailable
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <div>
          <p className="landing-section-kicker">Application tracking</p>
          <h2
            id="tracker-showcase-title"
            className="landing-section-title mt-4"
          >
            A calm record of what happened next.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Move saved roles through Applied, Assessment, Interview, Rejected,
            or Offer. The dedicated tracker reads the same local data you
            update from the job board.
          </p>
          <div className="mt-8 rounded-xl border border-info/25 bg-info-soft p-4">
            <p className="font-bold text-info">Local by default</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Today, saved jobs and application stages stay in this browser.
              Browsing never requires an account.
            </p>
          </div>
          <Link
            href="/tracker"
            className="ui-button ui-button--primary mt-9 min-h-11 px-5"
          >
            Open your tracker
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import type { Internship } from "@/lib/types";

interface TrackerShowcaseProps {
  jobs: Internship[];
}

const STAGES = ["Saved", "Applied", "Assessment", "Interview", "Offer"] as const;

export function TrackerShowcase({ jobs }: TrackerShowcaseProps) {
  const jobsByStage = [jobs[0], jobs[1], null, jobs[2], null] as const;

  return (
    <section
      id="tracker-showcase"
      aria-labelledby="tracker-showcase-title"
      className="theme-marketing landing-tracker-showcase"
    >
      <div className="landing-reveal mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <header className="landing-section-heading">
          <h2 id="tracker-showcase-title">Application tracker</h2>
          <Link
            href="/tracker"
            className="ui-button ui-button--primary min-h-11 px-5"
          >
            Open tracker
            <span aria-hidden>↗</span>
          </Link>
        </header>

        <div className="landing-tracker-product">
          <div
            className="theme-application landing-tracker-board"
            aria-label="Application pipeline with Saved, Applied, Assessment, Interview, and Offer stages"
          >
            <div className="landing-tracker-board__top">
              <strong>Applications</strong>
              <span>{jobs.length} shown</span>
            </div>

            <div className="landing-tracker-pipeline">
              {STAGES.map((stage, index) => {
                const job = jobsByStage[index];
                return (
                  <section key={stage} aria-label={`${stage} applications`}>
                    <header>
                      <span aria-hidden />
                      <h3>{stage}</h3>
                      <small>{job ? "1" : "0"}</small>
                    </header>
                    {job ? (
                      <article className="landing-pipeline-card">
                        <CompanyLogo
                          company={job.company}
                          size={32}
                          curatedOnly
                        />
                        <div className="min-w-0">
                          <p>{job.company}</p>
                          <span>{job.title}</span>
                        </div>
                      </article>
                    ) : (
                      <div className="landing-pipeline-empty" aria-hidden />
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

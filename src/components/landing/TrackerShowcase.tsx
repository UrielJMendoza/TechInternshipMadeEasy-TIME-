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
      <div className="landing-reveal mx-auto grid max-w-[90rem] gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(36rem,1.25fr)_minmax(0,0.75fr)] lg:items-center lg:gap-20 lg:px-8 lg:py-32">
        <div className="landing-tracker-product">
          <div
            className="theme-application landing-tracker-board"
            aria-label="Application pipeline with Saved, Applied, Assessment, Interview, and Offer stages"
          >
            <div className="landing-tracker-board__top">
              <div>
                <strong>Application tracker</strong>
                <span>Your next steps, at a glance</span>
              </div>
              <span>{jobs.length} active examples</span>
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
                      <article
                        className={
                          stage === "Applied"
                            ? "landing-pipeline-card landing-pipeline-card--moving"
                            : "landing-pipeline-card"
                        }
                      >
                        <CompanyLogo company={job.company} size={32} />
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

          <article className="theme-application landing-next-action">
            <span aria-hidden className="landing-next-action__line" />
            <div>
              <p>Next action</p>
              <strong>Prepare for interview</strong>
              <span>Tomorrow · 10:00 AM</span>
            </div>
          </article>

          <article className="theme-application landing-tracker-note">
            <p>Follow-up</p>
            <strong>Send thank-you note</strong>
          </article>
        </div>

        <div className="landing-showcase-copy landing-showcase-copy--dark">
          <h2 id="tracker-showcase-title">
            Every application.
            <br />
            One clear next step.
          </h2>
          <p>
            Save a role, move it through your pipeline, and keep notes, dates,
            and follow-ups together.
          </p>
          <p className="landing-showcase-copy__note">
            Your tracker works without an account.
          </p>
          <Link
            href="/tracker"
            className="ui-button ui-button--primary mt-8 min-h-12 px-6"
          >
            Open Tracker
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

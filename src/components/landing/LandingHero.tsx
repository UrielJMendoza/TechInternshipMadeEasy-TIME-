import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { CompanyMarquee } from "@/components/landing/CompanyMarquee";
import { compensationFor } from "@/lib/compensation";
import type { Internship } from "@/lib/types";

interface LandingHeroProps {
  jobs: Internship[];
  showcaseJob: Internship | null;
  companies: string[];
}

function HeroResult({
  job,
  priority = false,
}: {
  job: Internship;
  priority?: boolean;
}) {
  const compensation = compensationFor(job);

  return (
    <article className="landing-hero-result">
      <CompanyLogo
        company={job.company}
        size={36}
        curatedOnly
        priority={priority}
      />
      <div className="min-w-0">
        <p className="truncate font-extrabold text-fg">{job.company}</p>
        <p className="truncate text-xs text-muted">{job.title}</p>
      </div>
      <div className="landing-hero-result__meta">
        <span>{job.location || "Location unavailable"}</span>
        <strong className={compensation.estimated ? "text-warning" : "text-info"}>
          {compensation.label}
        </strong>
      </div>
    </article>
  );
}

export function LandingHero({
  jobs,
  showcaseJob,
  companies,
}: LandingHeroProps) {
  const heroJobs = jobs.slice(0, 3);

  return (
    <section
      aria-labelledby="landing-title"
      className="theme-marketing landing-hero"
    >
      <div className="landing-hero__glow" aria-hidden />
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <div className="landing-hero__grid">
          <div className="motion-section-reveal landing-hero__copy">
            <div className="landing-hero__eyebrow">
              <span aria-hidden />
              Internships + new grad
            </div>
            <h1 id="landing-title">
              Your next role,
              <br />
              <span>right on time.</span>
            </h1>
            <p>
              Fresh internships and new-grad roles, plus a simple tracker for
              every next step. No account required.
            </p>
            <div className="landing-hero__actions">
              <Link
                href="/jobs"
                className="ui-button ui-button--primary min-h-12 px-6"
              >
                Browse fresh roles
                <span aria-hidden>↗</span>
              </Link>
              <Link
                href="/tracker"
                className="ui-button ui-button--secondary min-h-12 px-6"
              >
                Open your tracker
                <span aria-hidden>→</span>
              </Link>
            </div>
            <div
              className="landing-hero__proof"
              aria-label="Current public listings, built-in tracker, and no account required"
            >
              <span>Current public listings</span>
              <span>Built-in tracker</span>
              <span>No account required</span>
            </div>
          </div>

          <div className="motion-section-reveal motion-delay-1 landing-hero-product">
            {showcaseJob ? (
              <>
                <div className="theme-application landing-hero-results">
                  <div className="landing-hero-results__top">
                    <strong>timley / fresh openings</strong>
                    <span>{jobs.length > 0 ? "Active listings" : "Jobs"}</span>
                  </div>
                  <div className="landing-hero-search">
                    <span aria-hidden>⌕</span>
                    Search company, role, or city
                    <kbd>/</kbd>
                  </div>
                  <div className="landing-hero-results__filters">
                    <span>Internships</span>
                    <span>New grad</span>
                    <span>Featured current roles</span>
                  </div>
                  <div className="landing-hero-results__list">
                    {heroJobs.map((job, index) => (
                      <HeroResult
                        key={job.id}
                        job={job}
                        priority={index < 2}
                      />
                    ))}
                  </div>
                </div>

                <article className="theme-application landing-hero-detail">
                  <div className="landing-hero-detail__company">
                    <CompanyLogo
                      company={showcaseJob.company}
                      size={42}
                      curatedOnly
                      priority
                    />
                    <div className="min-w-0">
                      <p>{showcaseJob.company}</p>
                      <span>{showcaseJob.location || "Location unavailable"}</span>
                    </div>
                  </div>
                  <h2>{showcaseJob.title}</h2>
                  <div className="landing-hero-detail__actions">
                    <span className="landing-hero-save">Saved</span>
                    <span className="ui-button ui-button--apply ui-button--sm">
                      Apply
                    </span>
                  </div>
                </article>

                <div
                  className="theme-application landing-hero-pipeline"
                  aria-label="Application moves from Saved to Applied"
                >
                  {["Saved", "Applied", "Interview"].map((stage, index) => (
                    <div
                      key={stage}
                      className={index === 1 ? "is-active" : ""}
                    >
                      <span aria-hidden />
                      <p>{stage}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="theme-application landing-hero-results landing-hero-results--empty">
                <p>Current listings will appear here when the job feed returns.</p>
              </div>
            )}
          </div>
        </div>

        <CompanyMarquee companies={companies} />
      </div>
    </section>
  );
}

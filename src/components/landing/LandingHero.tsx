import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { compensationFor } from "@/lib/compensation";
import { relativeTimestamp } from "@/lib/jobTime";
import type { LandingStats } from "@/lib/landingData";
import {
  CATEGORY_LABELS,
  SOURCE_LABELS,
  type Internship,
} from "@/lib/types";

interface LandingHeroProps {
  showcaseJob: Internship | null;
  stats: LandingStats;
  generatedAt: string;
}

function sponsorshipLabel(value: string | null): string {
  if (!value) return "Sponsorship not stated";
  if (value === "offers-sponsorship") return "Sponsorship offered";
  if (value === "no-sponsorship") return "No sponsorship";
  if (value === "citizens-only") return "Citizenship restriction";
  return "Sponsorship details listed";
}

export function LandingHero({
  showcaseJob,
  stats,
  generatedAt,
}: LandingHeroProps) {
  const now = Date.parse(generatedAt);
  const compensation = showcaseJob ? compensationFor(showcaseJob) : null;
  const sourceName = showcaseJob
    ? (SOURCE_LABELS[showcaseJob.source] ?? showcaseJob.source)
    : null;

  return (
    <section
      aria-labelledby="landing-title"
      className="theme-marketing landing-hero"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-16 pb-14 sm:px-6 sm:pt-20 sm:pb-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1.1fr)] lg:items-center lg:gap-14 lg:px-8 lg:pt-24 lg:pb-20">
        <div className="motion-section-reveal">
          <p className="landing-eyebrow">
            <span aria-hidden className="landing-eyebrow__dot" />
            Fresh roles. Clear evidence. One workspace.
          </p>
          <h1
            id="landing-title"
            className="mt-7 max-w-3xl text-[clamp(3.4rem,7.4vw,6.8rem)] leading-[0.91] font-extrabold tracking-[-0.065em] text-fg"
          >
            Your next opportunity{" "}
            <span className="text-[var(--token-marketing-color-primary-display)]">
              shouldn&apos;t be buried.
            </span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
            Find fresh internships and new-grad roles, verify the details, and
            track every application from one clean workspace.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/jobs"
              className="ui-button ui-button--primary min-h-12 px-5"
            >
              Browse Jobs
              <span aria-hidden>↗</span>
            </Link>
            <Link
              href="/tracker"
              className="ui-button ui-button--secondary min-h-12 px-5"
            >
              Open Tracker
              <span aria-hidden>→</span>
            </Link>
          </div>

          {stats.openRoles === null ? (
            <p className="mt-8 max-w-xl rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              Live listing totals are temporarily unavailable. The job board
              will retry when you open it.
            </p>
          ) : (
            <dl className="landing-hero-stats mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt>Open roles</dt>
                <dd className="motion-value-update">
                  {stats.openRoles.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Added in 14 days</dt>
                <dd className="motion-value-update">
                  {stats.recentlyAdded?.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Sources represented</dt>
                <dd className="motion-value-update">
                  {stats.sourcesRepresented}
                </dd>
              </div>
              <div>
                <dt>Latest observation</dt>
                <dd className="motion-value-update landing-hero-stats__time">
                  {stats.updatedAt
                    ? relativeTimestamp(stats.updatedAt, now)
                    : "Unavailable"}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="motion-section-reveal motion-delay-1">
          <div
            className="theme-application landing-product-demo"
            aria-label="Timley product preview using a current listing"
          >
            <div className="landing-product-demo__bar">
              <div className="flex items-center gap-2" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <p>timley / jobs</p>
              <span className="landing-product-demo__live">
                <span aria-hidden />
                Live workspace
              </span>
            </div>

            <div className="landing-product-demo__canvas">
              <div className="landing-product-demo__search">
                <span aria-hidden className="text-faint">
                  ○
                </span>
                <span>Search company, role, or city</span>
                <kbd>/</kbd>
              </div>

              <div className="landing-product-demo__filters" aria-label="Example filters">
                <span className="ui-selected">Internships</span>
                <span>New</span>
                <span>Software</span>
                <span>Remote</span>
              </div>

              {showcaseJob ? (
                <article className="landing-demo-job">
                  <div className="landing-demo-job__main">
                    <CompanyLogo company={showcaseJob.company} size={44} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-sm font-extrabold text-fg">
                          {showcaseJob.company}
                        </h2>
                        <span className="landing-fresh-badge">
                          <span aria-hidden />
                          Fresh
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted">
                        {showcaseJob.title}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="landing-demo-save"
                      title="Save role"
                    >
                      ★
                    </span>
                  </div>

                  <div className="landing-demo-job__meta">
                    <span className={`cat cat-${showcaseJob.category}`}>
                      {CATEGORY_LABELS[showcaseJob.category]}
                    </span>
                    <span>{showcaseJob.location || "Location unavailable"}</span>
                    {compensation ? (
                      <span
                        className={
                          compensation.estimated
                            ? "text-warning"
                            : "text-info"
                        }
                      >
                        {compensation.label}
                      </span>
                    ) : null}
                  </div>

                  <div className="landing-demo-evidence">
                    <div>
                      <p>Source evidence</p>
                      <strong>
                        <span
                          aria-hidden
                          className="landing-demo-evidence__dot"
                        />
                        Active in current results
                      </strong>
                    </div>
                    <div>
                      <p>Found via</p>
                      <strong>{sourceName}</strong>
                    </div>
                    <div>
                      <p>Sponsorship</p>
                      <strong>{sponsorshipLabel(showcaseJob.sponsorship)}</strong>
                    </div>
                  </div>
                </article>
              ) : (
                <div className="landing-demo-unavailable">
                  <span aria-hidden>↻</span>
                  <div>
                    <p className="font-bold text-fg">
                      Live listing preview unavailable
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      No example company or role is substituted.
                    </p>
                  </div>
                </div>
              )}

              <div className="landing-demo-tracker">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold tracking-[0.12em] text-faint uppercase">
                      Tracker preview
                    </p>
                    <p className="mt-1 text-sm font-bold text-fg">
                      From shortlist to outcome
                    </p>
                  </div>
                  <span className="landing-demo-local">Stored in this browser</span>
                </div>
                <div className="landing-demo-stages">
                  {["Saved", "Applied", "Interview", "Offer"].map(
                    (stage, index) => (
                      <div
                        key={stage}
                        className={
                          index === 1 ? "landing-demo-stage--active" : ""
                        }
                      >
                        <span aria-hidden />
                        <p>{stage}</p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-xs leading-relaxed text-faint">
            Product preview uses a current active listing when data is available.
            Motion is presentation-only and never changes your tracker.
          </p>
        </div>
      </div>
    </section>
  );
}

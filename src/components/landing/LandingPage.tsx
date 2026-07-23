import Link from "next/link";
import { CompanyMarquee } from "@/components/landing/CompanyMarquee";
import { DiscoveryShowcase } from "@/components/landing/DiscoveryShowcase";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingStats } from "@/components/landing/LandingStats";
import { TrackerShowcase } from "@/components/landing/TrackerShowcase";
import { TrustShowcase } from "@/components/landing/TrustShowcase";
import type { LandingStats as LandingStatsData } from "@/lib/landingData";
import type { Internship } from "@/lib/types";

interface LandingPageProps {
  jobs: Internship[];
  companies: string[];
  showcaseJob: Internship | null;
  stats: LandingStatsData;
  generatedAt: string;
}

const PROBLEMS = [
  {
    number: "01",
    title: "Sources are fragmented",
    body: "Useful roles live across public lists and employer systems, each with different structure.",
  },
  {
    number: "02",
    title: "Listings go stale",
    body: "A role can remain visible long after its details or availability have changed.",
  },
  {
    number: "03",
    title: "Evidence is inconsistent",
    body: "Pay and sponsorship details may be explicit, absent, or phrased differently across sources.",
  },
  {
    number: "04",
    title: "Applications get scattered",
    body: "Saved links, notes, and next steps are easy to lose across tabs and spreadsheets.",
  },
] as const;

const WORKFLOW = [
  {
    number: "01",
    title: "Find",
    body: "Search and filter active internship and new-grad listings without creating an account.",
  },
  {
    number: "02",
    title: "Inspect",
    body: "Check freshness, source, pay labeling, location, and sponsorship before you apply.",
  },
  {
    number: "03",
    title: "Track",
    body: "Save the role and move it through your browser-local application pipeline.",
  },
] as const;

export function LandingPage({
  jobs,
  companies,
  showcaseJob,
  stats,
  generatedAt,
}: LandingPageProps) {
  return (
    <main id="main-content">
      <LandingHero
        showcaseJob={showcaseJob}
        stats={stats}
        generatedAt={generatedAt}
      />
      <CompanyMarquee companies={companies} />

      <section
        id="problem"
        aria-labelledby="problem-title"
        className="theme-application bg-surface py-20 sm:py-24 lg:py-28"
      >
        <div className="landing-reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,0.78fr)_minmax(28rem,1.22fr)] lg:items-end lg:gap-16">
            <div>
              <p className="landing-section-kicker">The messy middle</p>
              <h2 id="problem-title" className="landing-section-title mt-4">
                The opportunity is only useful if you can find and trust it.
              </h2>
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-muted">
              Job discovery is not one problem. It is a handful of small,
              practical problems that compound. Timley gives them one
              organized home.
            </p>
          </div>

          <div className="landing-problem-grid mt-12">
            {PROBLEMS.map((problem) => (
              <article key={problem.number}>
                <span>{problem.number}</span>
                <h3>{problem.title}</h3>
                <p>{problem.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <DiscoveryShowcase jobs={jobs} generatedAt={generatedAt} />
      <TrustShowcase stats={stats} generatedAt={generatedAt} />
      <TrackerShowcase jobs={jobs.slice(0, 3)} />

      <section
        id="how-it-works"
        aria-labelledby="how-it-works-title"
        className="theme-application bg-bg py-20 sm:py-24 lg:py-28"
      >
        <div className="landing-reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="landing-section-kicker justify-center">
              How it works
            </p>
            <h2 id="how-it-works-title" className="landing-section-title mt-4">
              From open tab to organized next step.
            </h2>
          </div>
          <div className="landing-workflow-grid mt-12">
            {WORKFLOW.map((step, index) => (
              <article key={step.number}>
                <div className="landing-workflow-grid__number">
                  {step.number}
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {index < WORKFLOW.length - 1 ? (
                  <span
                    aria-hidden
                    className="landing-workflow-grid__connector"
                  />
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <LandingStats stats={stats} />

      <section
        aria-labelledby="final-cta-title"
        className="theme-marketing landing-final-cta py-16 text-fg sm:py-20"
      >
        <div className="landing-reveal mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="landing-section-kicker landing-section-kicker--dark">
              Your next move
            </p>
            <h2
              id="final-cta-title"
              className="mt-4 max-w-3xl text-4xl leading-[1] font-extrabold tracking-[-0.05em] sm:text-5xl"
            >
              Start with the role. Keep everything after it organized.
            </h2>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
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
            </Link>
          </div>
        </div>
      </section>

      <LandingFaq />
    </main>
  );
}

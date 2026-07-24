import Link from "next/link";
import { DiscoveryShowcase } from "@/components/landing/DiscoveryShowcase";
import { LandingHero } from "@/components/landing/LandingHero";
import { TrackerShowcase } from "@/components/landing/TrackerShowcase";
import type { Internship } from "@/lib/types";

interface LandingPageProps {
  jobs: Internship[];
  companies: string[];
  showcaseJob: Internship | null;
  generatedAt: string;
}

export function LandingPage({
  jobs,
  companies,
  showcaseJob,
  generatedAt,
}: LandingPageProps) {
  return (
    <main id="main-content" className="landing-page">
      <LandingHero
        jobs={jobs}
        showcaseJob={showcaseJob}
        companies={companies}
      />

      <DiscoveryShowcase jobs={jobs} generatedAt={generatedAt} />
      <TrackerShowcase jobs={jobs.slice(0, 3)} />

      <section
        aria-labelledby="final-cta-title"
        className="theme-marketing landing-final-cta py-14 text-fg sm:py-16"
      >
        <div className="landing-reveal mx-auto flex max-w-7xl flex-col gap-7 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2
              id="final-cta-title"
              className="max-w-3xl text-4xl leading-[1] font-extrabold tracking-[-0.05em] sm:text-5xl"
            >
              Ready for what opens next.
            </h2>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link
              href="/jobs"
              className="ui-button ui-button--primary min-h-12 px-5"
            >
              Find Jobs
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
    </main>
  );
}

import Link from "next/link";
import { CompanyMarquee } from "@/components/landing/CompanyMarquee";

interface LandingHeroProps {
  companies: string[];
}

export function LandingHero({ companies }: LandingHeroProps) {
  return (
    <section
      aria-labelledby="landing-title"
      className="theme-marketing landing-hero"
    >
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <h1 id="landing-title" className="sr-only">
          Timley
        </h1>
        <div className="motion-section-reveal landing-hero__utility">
          <nav className="landing-hero__actions" aria-label="Primary actions">
            <Link
              href="/jobs"
              className="ui-button ui-button--primary min-h-12 px-6"
            >
              Browse jobs
              <span aria-hidden>↗</span>
            </Link>
            <Link
              href="/tracker"
              className="ui-button ui-button--secondary min-h-12 px-6"
            >
              Open tracker
              <span aria-hidden>→</span>
            </Link>
          </nav>
        </div>

        <CompanyMarquee companies={companies} />
      </div>
    </section>
  );
}

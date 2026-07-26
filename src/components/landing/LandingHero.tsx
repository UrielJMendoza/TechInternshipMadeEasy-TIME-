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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="landing-hero__main">
          <div className="motion-section-reveal landing-hero__copy">
            <h1 id="landing-title">Find your next role</h1>
            <p>
              Fresh internships and new-grad opportunities, all in one place.
            </p>

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

          <div
            className="motion-section-reveal motion-delay-1 landing-hero__signal"
            aria-hidden
          >
            <span>↗</span>
          </div>
        </div>

        <CompanyMarquee companies={companies} />
      </div>
    </section>
  );
}

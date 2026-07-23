import Link from "next/link";
import { relativeTimestamp } from "@/lib/jobTime";
import type { LandingStats } from "@/lib/landingData";

interface TrustShowcaseProps {
  stats: LandingStats;
  generatedAt: string;
}

export function TrustShowcase({
  stats,
  generatedAt,
}: TrustShowcaseProps) {
  const now = Date.parse(generatedAt);

  return (
    <section
      id="freshness"
      aria-labelledby="freshness-title"
      className="theme-marketing landing-trust-section py-20 text-fg sm:py-24 lg:py-28"
    >
      <div className="landing-reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(34rem,1.2fr)] lg:items-end lg:gap-16">
          <div>
            <p className="landing-section-kicker landing-section-kicker--dark">
              Trust and freshness
            </p>
            <h2
              id="freshness-title"
              className="landing-section-title landing-section-title--dark mt-4"
            >
              Evidence should travel with the listing.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            Timley keeps the source, observation time, pay type, and
            sponsorship signal visible. It also removes explicit non-US and
            old dated rows before they reach the board.
          </p>
        </div>

        <div className="landing-evidence-flow mt-12">
          {[
            ["01", "Collect", "Read public community-maintained job lists."],
            ["02", "Normalize", "Clean titles, locations, links, and categories."],
            ["03", "Check", "Apply age and US eligibility rules, then deduplicate."],
            ["04", "Present", "Show the source evidence beside the role."],
          ].map(([number, title, body]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <article className="landing-evidence-card">
            <p>Latest active observation</p>
            <strong className="motion-value-update">
              {stats.updatedAt
                ? relativeTimestamp(stats.updatedAt, now)
                : "Unavailable"}
            </strong>
            <span>
              This is a listing observation, not a guarantee that every source
              succeeded.
            </span>
          </article>
          <article className="landing-evidence-card">
            <p>Pay evidence</p>
            <strong>Source-listed or “Est.”</strong>
            <span>
              Broad category estimates are always labeled and never presented
              as employer-provided pay.
            </span>
          </article>
          <article className="landing-evidence-card">
            <p>Sponsorship evidence</p>
            <strong>Explicit or unknown</strong>
            <span>
              Timley only marks sponsorship when a source states it; ambiguity
              stays visible.
            </span>
          </article>
        </div>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/methodology"
            className="ui-button ui-button--secondary min-h-11 px-5"
          >
            Read the Methodology
          </Link>
          <Link
            href="/status"
            className="ui-button ui-button--quiet min-h-11 px-5"
          >
            View Data Status
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

import type { LandingStats as LandingStatsData } from "@/lib/landingData";

interface LandingStatsProps {
  stats: LandingStatsData;
}

const METRICS = [
  {
    key: "openRoles",
    label: "Active listings",
    note: "After active, age, and US eligibility checks.",
  },
  {
    key: "recentlyAdded",
    label: "Added in 14 days",
    note: "Based on when Timley first saw the listing.",
  },
  {
    key: "sourceListedPay",
    label: "With employer-listed pay",
    note: "Excludes Timley’s clearly labeled estimates.",
  },
  {
    key: "sponsorshipKnown",
    label: "With explicit sponsorship data",
    note: "Unknown values are not inferred.",
  },
] as const;

export function LandingStats({ stats }: LandingStatsProps) {
  return (
    <section
      id="product-statistics"
      aria-labelledby="product-statistics-title"
      className="theme-application bg-bg py-20 sm:py-24"
    >
      <div className="landing-reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="landing-section-kicker">Product statistics</p>
            <h2
              id="product-statistics-title"
              className="landing-section-title mt-4 max-w-3xl"
            >
              Counts from the product—not the pitch deck.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            These totals come from the same active snapshot used by the job
            board. They are not user, partnership, or outcome claims.
          </p>
        </div>

        {stats.openRoles === null ? (
          <div className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="font-bold text-fg">Live totals unavailable</p>
            <p className="mt-2 text-sm text-muted">
              Timley will not replace missing data with invented numbers.
            </p>
          </div>
        ) : (
          <dl className="landing-stat-grid mt-10">
            {METRICS.map((metric) => {
              const value = stats[metric.key];
              return (
                <div key={metric.key}>
                  <dd className="motion-value-update">
                    {typeof value === "number" ? value.toLocaleString() : "—"}
                  </dd>
                  <dt>{metric.label}</dt>
                  <p>{metric.note}</p>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </section>
  );
}

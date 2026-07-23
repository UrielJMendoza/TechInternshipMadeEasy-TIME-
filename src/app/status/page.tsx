import type { Metadata } from "next";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { publicPageMetadata } from "@/lib/seo";
import { SOURCE_CATALOG } from "@/lib/sourceCatalog";

const title = "Data status";
const description =
  "Visible Timley listing counts and last-observed timestamps by public source.";

export const metadata: Metadata = publicPageMetadata({
  title,
  description,
  path: "/status",
});

export const revalidate = 300;

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatTimestamp(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return `${dateTimeFormatter.format(date)} UTC`;
}

export default async function StatusPage() {
  const snapshot = await fetchJobsSnapshot();
  const sourceRows = SOURCE_CATALOG.map((source) => {
    const jobs = snapshot.jobs.filter((job) => job.source === source.id);
    const lastVerified =
      jobs
        .map((job) => job.last_verified_at)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
    const verifiedCount = jobs.filter(
      (job) =>
        job.verification_status === "source-observed" ||
        job.verification_status === "destination-reachable",
    ).length;

    return {
      ...source,
      activeCount: jobs.length,
      verifiedCount,
      lastVerified,
    };
  });
  const representedSources = sourceRows.filter(
    (source) => source.activeCount > 0,
  ).length;
  const sourceVerifiedRows = sourceRows.reduce(
    (total, source) => total + source.verifiedCount,
    0,
  );

  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg text-fg">
      <section className="border-b border-border bg-raised">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              Data status
            </p>
            <span
              className={`ui-badge ${
                snapshot.loadError
                  ? "bg-error-soft text-error"
                  : "bg-success-soft text-success"
              }`}
            >
              {snapshot.loadError
                ? "Snapshot unavailable"
                : "Snapshot available"}
            </span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.05] font-bold tracking-[-0.035em] sm:text-5xl">
            What the current listing snapshot can tell us.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            This page reports visible active rows and their database observation
            times. It does not turn those rows into a claim that the latest
            ingestion run succeeded.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="snapshot-summary"
        className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8"
      >
        <h2 id="snapshot-summary" className="text-xl font-bold">
          Listing snapshot
        </h2>

        {snapshot.loadError ? (
          <div className="mt-6 rounded-xl border border-error/35 bg-error-soft p-6 sm:p-8">
            <p className="font-bold text-error">Listing data is unavailable</p>
            <p className="mt-2 max-w-2xl leading-7 text-fg">
              Timley could not read the current job snapshot for this page.
              Counts and observation times are withheld rather than replaced
              with cached-looking or estimated values. Try again later or
              browse the public source repositories below.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="ui-card p-5">
              <p className="text-sm font-semibold text-muted">
                Verified at source
              </p>
              <p className="mt-3 font-mono text-3xl font-bold text-fg">
                {sourceVerifiedRows.toLocaleString("en-US")}
              </p>
            </article>
            <article className="ui-card p-5">
              <p className="text-sm font-semibold text-muted">
                Visible active roles
              </p>
              <p className="mt-3 font-mono text-3xl font-bold text-fg">
                {snapshot.jobs.length.toLocaleString("en-US")}
              </p>
            </article>
            <article className="ui-card p-5">
              <p className="text-sm font-semibold text-muted">
                Sources represented
              </p>
              <p className="mt-3 font-mono text-3xl font-bold text-fg">
                {representedSources}
                <span className="text-base font-medium text-faint">
                  {" "}
                  / {SOURCE_CATALOG.length}
                </span>
              </p>
            </article>
            <article className="ui-card p-5">
              <p className="text-sm font-semibold text-muted">
                Snapshot generated
              </p>
              <p className="mt-3 text-sm leading-6 font-bold text-fg">
                <time dateTime={snapshot.generatedAt}>
                  {formatTimestamp(snapshot.generatedAt)}
                </time>
              </p>
            </article>
          </div>
        )}
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              By source
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Visible rows, not health checks
            </h2>
            <p className="mt-4 leading-7 text-muted">
              A zero means no row from that source passed the current active,
              U.S.-location, and 120-day display rules. It does not identify why.
              Counts reflect the source retained after deduplication, not raw
              totals in each upstream repository.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-xl border border-border bg-border">
            <div className="hidden grid-cols-[minmax(0,1.35fr)_0.55fr_0.55fr_1fr] gap-5 bg-raised px-5 py-3 text-xs font-bold tracking-wide text-faint uppercase md:grid">
              <span>Public source</span>
              <span>Visible roles</span>
              <span>Verified</span>
              <span>Latest source verification</span>
            </div>
            <div className="grid gap-px">
              {sourceRows.map((source) => (
                <article
                  key={source.id}
                  className="grid gap-4 bg-bg px-5 py-5 md:grid-cols-[minmax(0,1.35fr)_0.55fr_0.55fr_1fr] md:items-center md:gap-5"
                >
                  <div>
                    <a
                      href={source.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-fg underline decoration-border-strong underline-offset-4 hover:text-accent"
                    >
                      {source.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                    <p className="mt-1 text-sm text-muted">
                      {source.coverage}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-faint uppercase md:hidden">
                      Visible roles
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold md:mt-0">
                      {snapshot.loadError
                        ? "—"
                        : source.activeCount.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-faint uppercase md:hidden">
                      Verified at source
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold md:mt-0">
                      {snapshot.loadError
                        ? "—"
                        : source.verifiedCount.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-faint uppercase md:hidden">
                      Latest source verification
                    </p>
                    {snapshot.loadError || !source.lastVerified ? (
                      <p className="mt-1 text-sm text-faint md:mt-0">
                        Not available
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-semibold text-muted md:mt-0">
                        <time dateTime={source.lastVerified}>
                          {formatTimestamp(source.lastVerified)}
                        </time>
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-accent uppercase">
              Interpretation
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              What is not shown
            </h2>
          </div>
          <div className="space-y-4 leading-7 text-muted">
            <p>
              Active rows alone cannot establish the latest fetch result, parser
              completeness, or whether a repository is temporarily unavailable.
              A row can remain active after a source failure by design.
            </p>
            <p>
              &ldquo;Verified at source&rdquo; means a listing was observed in
              its upstream feed; it is not a comprehensive application-link
              health check. Timley does not display live ingest success because
              the checked-in database policy does not expose run logs publicly.
              Always open the application destination to confirm that a role is
              still open.
              For the filtering and deduplication rules behind this snapshot,
              read the{" "}
              <a
                href="/methodology"
                className="font-semibold text-accent underline decoration-border-strong underline-offset-4 hover:text-accent-hover"
              >
                methodology
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

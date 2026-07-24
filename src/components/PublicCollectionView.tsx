import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PublicJobList } from "@/components/PublicJobList";
import { ShareControls } from "@/components/ShareControls";
import { StructuredData } from "@/components/StructuredData";
import type { PublicCollection } from "@/lib/publicCatalog";
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  type BreadcrumbItem,
} from "@/lib/seo";

function formatTimestamp(value: string | null): string {
  if (!value) return "Latest source observation unavailable";
  return `Latest visible source observation ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value))}`;
}

export function PublicCollectionView({
  collection,
  breadcrumbs,
  partialData,
}: {
  collection: PublicCollection;
  breadcrumbs: readonly BreadcrumbItem[];
  partialData: boolean;
}) {
  const visibleJobs = collection.jobs.slice(0, 30);
  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg text-fg"
    >
      <StructuredData
        data={[
          breadcrumbJsonLd(breadcrumbs),
          itemListJsonLd(collection.title, visibleJobs, collection.path),
        ]}
      />

      <section className="border-b border-border bg-raised">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Breadcrumbs items={breadcrumbs} />
          <p className="mt-8 text-xs font-extrabold tracking-[0.14em] text-accent-hover uppercase">
            Data-backed collection
          </p>
          <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
                {collection.title}
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
                {collection.description}
              </p>
            </div>
            <ShareControls
              path={collection.path}
              title={collection.title}
              kind={collection.kind === "campus" ? "campus" : "collection"}
            />
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <div className="ui-card px-4 py-3">
              <p className="text-2xl font-extrabold tabular-nums">
                {collection.jobs.length}
              </p>
              <p className="text-xs text-faint">active matching roles</p>
            </div>
            <div className="ui-card px-4 py-3">
              <p className="text-sm font-bold">
                {formatTimestamp(collection.updatedAt)}
              </p>
              <p className="mt-1 text-xs text-faint">
                Freshness describes visible source observations, not employer
                confirmation.
              </p>
            </div>
          </div>

          {partialData ? (
            <p className="mt-5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
              The current snapshot is partial. Results remain usable, but this
              count may be incomplete.
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:px-8 lg:py-16">
        <section aria-labelledby="collection-results">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="collection-results"
                className="text-2xl font-extrabold tracking-[-0.03em]"
              >
                Current listings
              </h2>
              <p className="mt-1 text-sm text-muted">
                Showing {visibleJobs.length} of {collection.jobs.length} real
                matches.
              </p>
            </div>
            <Link
              href={collection.jobsPath}
              className="ui-button ui-button--primary"
            >
              Open in job search
            </Link>
          </div>
          <div className="mt-5">
            <PublicJobList jobs={visibleJobs} />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="ui-card p-5" aria-labelledby="collection-method">
            <h2 id="collection-method" className="text-base font-extrabold">
              How this collection works
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {collection.methodology}
            </p>
            <p className="mt-3 text-xs leading-5 text-faint">
              Timley aggregates public source observations. Inclusion does not
              imply employer endorsement, partnership, or a comprehensive
              inventory of openings.
            </p>
          </section>

          <section className="ui-card p-5" aria-labelledby="collection-digest">
            <h2 id="collection-digest" className="text-base font-extrabold">
              Fresh-role digest
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Open the same public filters in job search, save them, and choose
              an in-app or foreground browser cadence.
            </p>
            <Link
              href={collection.jobsPath}
              className="ui-button ui-button--secondary ui-button--sm mt-4"
            >
              Save these filters
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}

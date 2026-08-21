import type { Metadata } from "next";
import { JobsExplorer } from "@/app/components/JobsExplorer";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SOURCE_CATALOG, parseFilters, queryJobs, serializeFilters } from "@/lib/jobs";

export const metadata: Metadata = {
  title: "Newest internships and new-grad jobs · Timley",
  description: "Browse the newest internships and new-grad roles across nine public sources. No account required.",
};

type JobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const filters = parseFilters(await searchParams);
  const page = queryJobs(filters, { limit: 36 });

  return (
    <main id="main-content">
      <SiteHeader active="jobs" />
      <section className="page-intro jobs-intro">
        <div className="jobs-intro-copy">
          <h1>All jobs, newest first</h1>
        </div>
        <p>Employer posting dates stay separate from discovery dates. Old backfills never appear as new jobs.</p>
      </section>
      <div className="jobs-shell">
        <JobsExplorer
          key={serializeFilters(filters) || "all-jobs"}
          initialJobs={page.items}
          initialCursor={page.nextCursor}
          initialFilters={filters}
          initialQuery={serializeFilters(filters)}
          total={page.total}
          sourceOptions={SOURCE_CATALOG.map(({ id, name }) => ({ id, name }))}
        />
      </div>
      <SiteFooter />
    </main>
  );
}

import type { Metadata } from "next";
import { JobsExplorer } from "@/app/components/JobsExplorer";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SnapshotNotice } from "@/app/components/SnapshotNotice";
import { JOB_MAJOR_OPTIONS, parseFilters, queryJobs, serializeFilters } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";

export const metadata: Metadata = {
  title: "Newest jobs, grouped by company · Timley",
  description: "Browse internships and new-grad roles by major, specialization, location, and work style. No account required.",
};

type JobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const filters = parseFilters(await searchParams);
  const snapshot = await getPublicJobsSnapshot();
  const page = queryJobs(filters, { limit: 36, snapshot });

  return (
    <main id="main-content">
      <SiteHeader active="jobs" />
      <section className="page-intro">
        <h1>Newest jobs, grouped by company</h1>
      </section>
      <SnapshotNotice capturedAt={snapshot.fallbackCapturedAt} />
      <div className="jobs-shell">
        <JobsExplorer
          key={serializeFilters(filters) || "all-jobs"}
          initialJobs={page.items}
          initialCursor={page.nextCursor}
          initialFilters={filters}
          initialQuery={serializeFilters(filters)}
          total={page.total}
          majorOptions={JOB_MAJOR_OPTIONS.map((major) => ({
            ...major,
            niches: major.niches.map((niche) => ({ ...niche })),
          }))}
        />
      </div>
      <SiteFooter />
    </main>
  );
}

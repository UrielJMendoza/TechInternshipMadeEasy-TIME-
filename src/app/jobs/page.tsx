import type { Metadata } from "next";
import { Board } from "@/components/Board";
import { createBoardJobs } from "@/lib/boardJobs";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 21600;

export const metadata: Metadata = publicPageMetadata({
  title: "Browse internships and new-grad jobs",
  description:
    "Search, filter, save, and track active internship and new-grad listings on Timley.",
  path: "/jobs",
});

export default async function JobsPage() {
  const snapshot = await fetchJobsSnapshot();
  const jobs = createBoardJobs(snapshot.jobs);

  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg">
      <section
        id="job-board"
        aria-label="Timley job board"
        className="border-t border-border bg-bg"
      >
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
          <Board
            jobs={jobs}
            loadError={snapshot.loadError}
            partialData={snapshot.partialData}
            generatedAt={snapshot.generatedAt}
            updatedAt={snapshot.updatedAt}
          />
        </div>
      </section>
    </main>
  );
}

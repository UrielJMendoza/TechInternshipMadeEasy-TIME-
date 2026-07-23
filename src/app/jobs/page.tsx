import type { Metadata } from "next";
import { Board } from "@/components/Board";
import { hasBoardFilterParams } from "@/lib/boardFilterState";
import { fetchJobsSnapshot } from "@/lib/jobs";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  const filtered = hasBoardFilterParams(params.toString());
  return publicPageMetadata({
    title: "Browse internships and new-grad jobs",
    description:
      "Search, filter, save, and track active internship and new-grad listings on Timley.",
    path: "/jobs",
    indexable: !filtered,
  });
}

export default async function JobsPage() {
  const snapshot = await fetchJobsSnapshot();

  return (
    <main id="main-content" className="theme-application min-h-screen bg-bg">
      <section
        id="job-board"
        aria-label="Timley job board"
        className="border-t border-border bg-bg"
      >
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
          <Board
            jobs={snapshot.jobs}
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

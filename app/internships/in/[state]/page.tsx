import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobsExplorer } from "@/app/components/JobsExplorer";
import { JsonLd } from "@/app/components/JsonLd";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { findStatePage, JOB_MAJOR_OPTIONS, parseFilters, queryJobs, serializeFilters } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { pageMetadata } from "@/lib/site";

type StatePageProps = {
  params: Promise<{ state: string }>;
};

function stateCopy(name: string, activeJobs: number) {
  const roles = `${activeJobs} open ${activeJobs === 1 ? "role" : "roles"}`;
  return {
    title: `Internships and new-grad jobs in ${name} · Timley`,
    description: `${roles} in ${name}: software, data, hardware and more internships and new-grad jobs, newest first. Apply on the employer website. No account required.`,
  };
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const [{ state: slug }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const state = findStatePage(slug, { snapshot });
  if (!state) {
    return { title: "Location not found · Timley", robots: { index: false, follow: true } };
  }
  return pageMetadata({ ...stateCopy(state.name, state.activeJobs), path: `/internships/in/${state.slug}` });
}

export default async function StatePage({ params }: StatePageProps) {
  const [{ state: slug }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const state = findStatePage(slug, { snapshot });
  if (!state) notFound();

  const filters = parseFilters({ location: state.code });
  const page = queryJobs(filters, { limit: 36, snapshot });
  const path = `/internships/in/${state.slug}`;

  return (
    <main id="main-content">
      <JsonLd data={breadcrumbJsonLd([
        { name: "Timley", path: "/" },
        { name: "Jobs", path: "/jobs" },
        { name: `Jobs in ${state.name}`, path },
      ])} />
      <SiteHeader active="jobs" />
      <section className="page-intro">
        <h1>{`Internships and new-grad jobs in ${state.name}`}</h1>
        <p>
          {`${page.total} open ${page.total === 1 ? "role" : "roles"} in ${state.name}, newest first. Apply on the employer website.`}
        </p>
      </section>
      <div className="jobs-shell">
        <JobsExplorer
          key={serializeFilters(filters)}
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

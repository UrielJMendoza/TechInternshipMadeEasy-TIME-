import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobsExplorer } from "@/app/components/JobsExplorer";
import { JsonLd } from "@/app/components/JsonLd";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { findCategoryPage, JOB_MAJOR_OPTIONS, parseFilters, queryJobs, serializeFilters } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { pageMetadata } from "@/lib/site";

type CategoryPageProps = {
  params: Promise<{ category: string }>;
};

function categoryCopy(label: string, activeJobs: number) {
  const roles = `${activeJobs} open ${activeJobs === 1 ? "role" : "roles"}`;
  return {
    title: `${label} internships and new-grad jobs · Timley`,
    description: `${roles} in ${label}: internships and new-grad jobs across the US, newest first. Apply on the employer website. No account required.`,
  };
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const [{ category: slug }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const category = findCategoryPage(slug, { snapshot });
  if (!category) {
    return { title: "Category not found · Timley", robots: { index: false, follow: true } };
  }
  return pageMetadata({ ...categoryCopy(category.label, category.activeJobs), path: `/internships/category/${category.slug}` });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const [{ category: slug }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const category = findCategoryPage(slug, { snapshot });
  if (!category) notFound();

  const filters = parseFilters({ major: category.major, niche: category.niche });
  const page = queryJobs(filters, { limit: 36, snapshot });
  const path = `/internships/category/${category.slug}`;

  return (
    <main id="main-content">
      <JsonLd data={breadcrumbJsonLd([
        { name: "Timley", path: "/" },
        { name: "Jobs", path: "/jobs" },
        { name: `${category.label} jobs`, path },
      ])} />
      <SiteHeader active="jobs" />
      <section className="page-intro">
        <h1>{`${category.label} internships and new-grad jobs`}</h1>
        <p>
          {`${page.total} open ${page.total === 1 ? "role" : "roles"} in ${category.label}, newest first. Apply on the employer website.`}
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

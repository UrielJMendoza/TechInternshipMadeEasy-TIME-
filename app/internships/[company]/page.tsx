import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobsExplorer } from "@/app/components/JobsExplorer";
import { JsonLd } from "@/app/components/JsonLd";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { findCompanyPage, JOB_MAJOR_OPTIONS, parseFilters, queryJobs, serializeFilters } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";
import { breadcrumbJsonLd } from "@/lib/seo/structured-data";
import { pageMetadata } from "@/lib/site";

type CompanyPageProps = {
  params: Promise<{ company: string }>;
};

function companyCopy(name: string, activeJobs: number) {
  const roles = `${activeJobs} open ${activeJobs === 1 ? "role" : "roles"}`;
  return {
    title: `${name} internships and new-grad jobs · Timley`,
    description: `${roles} at ${name}: internships and new-grad jobs, newest first. Apply on the ${name} website. No account required.`,
  };
}

export async function generateMetadata({ params }: CompanyPageProps): Promise<Metadata> {
  const [{ company: slug }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const company = findCompanyPage(slug, { snapshot });
  if (!company) {
    return { title: "Company not found · Timley", robots: { index: false, follow: true } };
  }
  return pageMetadata({ ...companyCopy(company.name, company.activeJobs), path: `/internships/${company.slug}` });
}

export default async function CompanyPage({ params }: CompanyPageProps) {
  const [{ company: slug }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const company = findCompanyPage(slug, { snapshot });
  if (!company) notFound();

  const filters = parseFilters({ company: company.name });
  const page = queryJobs(filters, { limit: 36, snapshot });
  const path = `/internships/${company.slug}`;

  return (
    <main id="main-content">
      <JsonLd data={breadcrumbJsonLd([
        { name: "Timley", path: "/" },
        { name: "Jobs", path: "/jobs" },
        { name: `${company.name} jobs`, path },
      ])} />
      <SiteHeader active="jobs" />
      <section className="page-intro">
        <h1>{`${company.name} internships and new-grad jobs`}</h1>
        <p>
          {`${page.total} open ${page.total === 1 ? "role" : "roles"} at ${company.name}, newest first. Apply on the employer website.`}
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

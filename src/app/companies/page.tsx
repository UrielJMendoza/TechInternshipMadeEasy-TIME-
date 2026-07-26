import type { Metadata } from "next";
import Link from "next/link";
import { StructuredData } from "@/components/StructuredData";
import { fetchPublicJobsSnapshot } from "@/lib/jobs";
import { buildCompanyProfiles } from "@/lib/publicCatalog";
import { absoluteUrl, publicPageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = publicPageMetadata({
  title: "Companies with active listings",
  description:
    "Browse company pages built from real active Timley listings, visible evidence, and bounded source-observation history.",
  path: "/companies",
});

export default async function CompaniesPage() {
  const snapshot = await fetchPublicJobsSnapshot();
  const companies = buildCompanyProfiles(
    snapshot.jobs,
    snapshot.recentlyClosedJobs,
  ).filter((company) => company.indexable);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Companies with active listings on Timley",
    numberOfItems: companies.length,
    itemListElement: companies.map((company, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/companies/${company.slug}`),
      name: company.name,
    })),
  };

  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg text-fg"
    >
      <StructuredData data={itemList} />
      <section className="border-b-2 border-fg bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <p className="text-xs font-extrabold tracking-[0.14em] text-accent-hover uppercase">
            Real listing observations
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
            Companies with active roles on Timley.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
            Each page summarizes active roles and available category, location,
            pay, sponsorship, and recent source-removal evidence. Appearance
            does not imply employer partnership or endorsement.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="company-directory"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
      >
        <h2 id="company-directory" className="text-2xl font-extrabold">
          Company pages with enough active evidence
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Pages enter this directory only when at least three current active
          roles are visible in the complete snapshot.
        </p>
        {companies.length > 0 ? (
          <ul className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {companies.map((company) => (
              <li key={company.slug}>
                <article className="ui-card h-full p-5">
                  <p className="text-xs font-bold text-accent-hover">
                    {company.activeJobs.length} active{" "}
                    {company.activeJobs.length === 1 ? "role" : "roles"}
                  </p>
                  <h3 className="mt-2 text-xl font-extrabold">
                    <Link
                      href={`/companies/${company.slug}`}
                      className="hover:text-accent-hover"
                    >
                      {company.name}
                    </Link>
                  </h3>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
                    <p>
                      <span className="block font-extrabold text-fg">
                        {company.categoryCounts.length}
                      </span>
                      categories
                    </p>
                    <p>
                      <span className="block font-extrabold text-fg">
                        {company.locationCounts.length}
                      </span>
                      locations
                    </p>
                    <p>
                      <span className="block font-extrabold text-fg">
                        {company.employerPayCount}
                      </span>
                      with listed pay
                    </p>
                    <p>
                      <span className="block font-extrabold text-fg">
                        {company.recentlyClosedJobs.length}
                      </span>
                      recently removed
                    </p>
                  </div>
                  <Link
                    href={`/companies/${company.slug}`}
                    className="mt-5 inline-block text-sm font-bold text-accent-hover hover:underline"
                  >
                    View observations
                  </Link>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ui-card mt-7 border-dashed px-5 py-10 text-sm text-muted">
            Company pages are temporarily unavailable because the current
            active snapshot could not be verified.
          </div>
        )}
      </section>
    </main>
  );
}

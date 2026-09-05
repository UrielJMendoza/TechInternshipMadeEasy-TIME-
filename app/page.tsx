import type { Metadata } from "next";
import { JobCard } from "@/app/components/JobCard";
import { PopularCompanyRail } from "@/app/components/PopularCompanyRail";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getFeedStats, getNewestPostedJobs, getPopularCompanies } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

function count(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function Home() {
  const snapshot = await getPublicJobsSnapshot();
  const stats = getFeedStats({ snapshot });
  const recentJobs = getNewestPostedJobs({ limit: 60, snapshot });
  const featuredCompanies = new Set<string>();
  const newestJobs = recentJobs.filter((job) => {
    if (featuredCompanies.has(job.company)) return false;
    featuredCompanies.add(job.company);
    return true;
  }).slice(0, 6);
  const popularCompanies = getPopularCompanies({ limit: 30, snapshot });

  return (
    <main id="main-content">
      <SiteHeader />

      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-intro-copy">
          <h1 id="home-title">Internships and new-grad jobs, newest first</h1>
          <form className="home-search" action="/jobs" method="get" role="search">
            <label className="sr-only" htmlFor="home-job-search">Search internships and new-grad jobs</label>
            <input
              id="home-job-search"
              name="q"
              type="search"
              placeholder="Search title, company, location, or keyword"
              autoComplete="off"
            />
            <button type="submit">Search jobs</button>
          </form>
          <a className="text-link home-intro-link" href="/jobs">Browse all jobs</a>
        </div>
      </section>

      <PopularCompanyRail companies={popularCompanies} />

      <section className="feed-preview" aria-labelledby="newest-listings-title">
        <div className="section-heading">
          <h2 id="newest-listings-title">Newest listings</h2>
          <a href="/jobs">View all {count(stats.activeJobs)}</a>
        </div>
        <div className="job-list">
          {newestJobs.map((job) => <JobCard job={job} key={job.id} returnTo="/" />)}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

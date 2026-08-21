import { JobCard } from "@/app/components/JobCard";
import { PopularCompanyRail } from "@/app/components/PopularCompanyRail";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getFeedStats, getNewestPostedJobs } from "@/lib/jobs";

function count(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function Home() {
  const stats = getFeedStats();
  const newestJobs = getNewestPostedJobs({ limit: 6, todayOnly: true });

  return (
    <main id="main-content">
      <SiteHeader />

      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-intro-copy">
          <h1 id="home-title">Internships and new-grad jobs, newest first</h1>
          <a className="text-link home-intro-link" href="/jobs">Browse jobs</a>
        </div>
      </section>

      <PopularCompanyRail />

      <section className="feed-preview" aria-labelledby="newest-listings-title">
        <div className="section-heading">
          <h2 id="newest-listings-title">Newest listings</h2>
          <a href="/jobs">View all {count(stats.activeJobs)}</a>
        </div>
        <div className="job-list">
          {newestJobs.map((job) => <JobCard job={job} key={job.id} />)}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

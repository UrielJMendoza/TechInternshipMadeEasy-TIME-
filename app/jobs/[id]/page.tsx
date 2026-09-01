import type { Metadata } from "next";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { Recency } from "@/app/components/Recency";
import { SaveButton } from "@/app/components/SaveButton";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SnapshotNotice } from "@/app/components/SnapshotNotice";
import { getJobById } from "@/lib/jobs";
import { getPublicJobsSnapshot } from "@/lib/jobs/live";

type JobDetailProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: JobDetailProps): Promise<Metadata> {
  const { id } = await params;
  const snapshot = await getPublicJobsSnapshot();
  const job = getJobById(id, { snapshot });
  const title = job ? `${job.title} at ${job.company} · Timley` : "Job not found · Timley";
  const description = job?.summary ?? "This Timley job is no longer available in the current feed.";

  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

export default async function JobDetailPage({ params }: JobDetailProps) {
  const { id } = await params;
  const snapshot = await getPublicJobsSnapshot();
  const job = getJobById(id, { snapshot });

  if (!job) {
    return (
      <main id="main-content">
        <SiteHeader active="jobs" />
        <SnapshotNotice capturedAt={snapshot.fallbackCapturedAt} />
        <div className="detail-shell">
          <a className="back-link" href="/jobs"><span aria-hidden="true">←</span> Back to newest jobs</a>
          <div className="empty-state">
            <h1>This job is no longer in the feed.</h1>
            <p>It may have closed or the employer may have removed it. Your saved copy, if any, stays on this device.</p>
            <a className="button primary" href="/jobs">See newest jobs</a>
          </div>
        </div>
        <SiteFooter />
      </main>
    );
  }

  const compensation = job.compensation?.replace(/[–—]/g, " to ");
  const chips = [
    job.location,
    job.roleLevel,
    job.workplace,
    compensation,
    job.sponsorship === "Confirmed" ? "Visa support confirmed" : undefined,
  ].filter(Boolean) as string[];

  return (
    <main id="main-content">
      <SiteHeader active="jobs" />
      <SnapshotNotice capturedAt={snapshot.fallbackCapturedAt} />
      <div className="detail-shell">
        <a className="back-link" href="/jobs"><span aria-hidden="true">←</span> Back to newest jobs</a>
        <article className="detail-card">
          <div className="detail-top">
            <CompanyLogo company={job.company} domain={job.companyDomain} size="detail" priority />
            <div className="detail-title">
              <div className="job-meta">
                <span>{job.company}</span>
                <Recency kind={job.freshnessKind} label={job.freshnessLabel} timestamp={job.postedAt ?? job.firstSeenAt} precision={job.postedAtPrecision} />
              </div>
              <h1>{job.title}</h1>
              <p>{job.location}{job.team ? ` · ${job.team}` : ""}</p>
            </div>
            <div className="detail-actions">
              <SaveButton job={job} />
              <a className="apply" href={job.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={`Apply for ${job.title} at ${job.company} on the employer website`}>
                Apply now
              </a>
            </div>
          </div>
          <div className="detail-facts-line" aria-label="Job attributes">
            {chips.map((chip, index) => (
              <span key={chip}>
                {index > 0 ? <i aria-hidden="true">·</i> : null}
                {chip}
              </span>
            ))}
          </div>

          <div className="detail-body">
            <div className="detail-copy">
              <h2>About this opportunity</h2>
              <p>{job.summary ?? `${job.company} is hiring for this early-career ${job.team?.toLowerCase() ?? "role"}.`}</p>
              <h2>Before you apply</h2>
              <ul>
                <li>Review the complete requirements and closing date on the employer’s application page.</li>
                <li>Compensation appears here only when it was listed by the employer.</li>
                <li>Timley does not collect your résumé or application data.</li>
              </ul>
            </div>
            <aside className="detail-aside" aria-label="Listing details">
              <h2>Listing details</h2>
              <div className="detail-fact"><span>Recency</span><Recency kind={job.freshnessKind} label={job.freshnessLabel} timestamp={job.postedAt ?? job.firstSeenAt} precision={job.postedAtPrecision} /></div>
              <div className="detail-fact"><span>Role</span><strong>{job.roleLevel}</strong></div>
              <div className="detail-fact"><span>Work style</span><strong>{job.workplace}</strong></div>
              <div className="detail-fact"><span>Application</span><strong>Employer website</strong></div>
              <p className="direct-note">Apply opens the employer’s website in a new tab.</p>
            </aside>
          </div>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}

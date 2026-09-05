import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/app/components/CompanyLogo";
import { Recency } from "@/app/components/Recency";
import { ReportListing } from "@/app/components/ReportListing";
import { SaveButton } from "@/app/components/SaveButton";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getPublicJobsSnapshot, getPublicJobsByIds } from "@/lib/jobs/live";
import { sanitizeJobReturnPath } from "@/lib/navigation/job-return-path";

type JobDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: JobDetailProps): Promise<Metadata> {
  const [{ id }, snapshot] = await Promise.all([params, getPublicJobsSnapshot()]);
  const job = (await getPublicJobsByIds([id], snapshot)).get(id);
  const title = job ? `${job.title} at ${job.company} · Timley` : "Job not found · Timley";
  const description = job?.summary ?? (job
    ? `Review ${job.title} at ${job.company} and continue to the employer application for complete role details.`
    : "This Timley job is no longer available in the current feed.");

  return {
    title,
    description,
    alternates: job ? { canonical: `/jobs/${encodeURIComponent(job.id)}` } : undefined,
    robots: job ? undefined : { index: false, follow: true },
    openGraph: { title, description, images: [] },
    twitter: { card: "summary", title, description, images: [] },
  };
}

function formatCheckedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export default async function JobDetailPage({ params, searchParams }: JobDetailProps) {
  const [{ id }, query, snapshot] = await Promise.all([
    params,
    searchParams,
    getPublicJobsSnapshot(),
  ]);
  const job = (await getPublicJobsByIds([id], snapshot)).get(id);

  if (!job) {
    notFound();
  }

  const compensation = job.compensation?.replace(/[–—]/g, " to ");
  const returnPath = sanitizeJobReturnPath(query.returnTo);
  const dateSource = job.freshnessKind === "posted"
    ? "Verified employer date"
    : job.freshnessKind === "reported"
      ? "Source-reported date"
      : "First observed by Timley";
  const lastCheckedLabel = job.lastCheckedAt ? formatCheckedAt(job.lastCheckedAt) : null;
  const compensationNote = job.compensation
    ? "The listing source reports the compensation shown here. Confirm it on the employer application."
    : "Timley does not have compensation data for this listing. Check the employer application for current terms.";
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
      <div className="detail-shell">
        <a className="back-link" href={returnPath}><span aria-hidden="true">←</span> Back to job results</a>
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
              <p>{job.summary ?? "Timley does not have a verified description for this listing. Use “Apply now” to review the complete role details on the employer’s application page."}</p>
              {job.requirements?.length ? <><h2>From the employer’s requirements</h2><ul>{job.requirements.map(requirement=><li key={requirement}>{requirement}</li>)}</ul></> : null}
              <h2>Before you apply</h2>
              <ul>
                <li>Review the complete requirements and closing date on the employer’s application page.</li>
                <li>{compensationNote}</li>
                <li>Timley does not collect your résumé or application data.</li>
              </ul>
            </div>
            <aside className="detail-aside" aria-label="Listing details">
              <h2>Listing details</h2>
              <div className="detail-fact"><span>Recency</span><Recency kind={job.freshnessKind} label={job.freshnessLabel} timestamp={job.postedAt ?? job.firstSeenAt} precision={job.postedAtPrecision} /></div>
              <div className="detail-fact"><span>Date source</span><strong>{dateSource}</strong></div>
              {job.titleIncomplete ? (
                <div className="detail-fact"><span>Title</span><strong>Source title is shortened</strong></div>
              ) : null}
              <div className="detail-fact"><span>Visa sponsorship</span><strong>{job.sponsorship ?? "Not confirmed"}</strong></div>
              {job.deadline ? <div className="detail-fact"><span>Apply by</span><strong><time dateTime={job.deadline}>{new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(job.deadline))}</time></strong></div> : null}
              {job.degrees?.length ? <div className="detail-fact"><span>Degrees mentioned</span><strong>{job.degrees.join(", ")}</strong></div> : null}
              {job.evidenceUrl && job.evidenceCheckedAt ? <p className="direct-note">Employer details checked {formatCheckedAt(job.evidenceCheckedAt)}. <a href={job.evidenceUrl} target="_blank" rel="noopener noreferrer">Review the employer source</a>.</p> : null}
              <div className="detail-fact"><span>Role</span><strong>{job.roleLevel}</strong></div>
              <div className="detail-fact"><span>Work style</span><strong>{job.workplace}</strong></div>
              {lastCheckedLabel && job.lastCheckedAt ? (
                <div className="detail-fact">
                  <span>Last checked</span>
                  <strong><time dateTime={job.lastCheckedAt}>{lastCheckedLabel}</time></strong>
                </div>
              ) : null}
              <div className="detail-fact"><span>Application</span><strong>Employer website</strong></div>
              {job.possibleRepost ? (
                <p className="direct-note">The source-reported date is newer than Timley’s first observation. It may reflect a repost or a source update.</p>
              ) : null}
              <p className="direct-note">Apply opens the employer’s website in a new tab.</p>
              <ReportListing jobId={job.id} />
            </aside>
          </div>
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JobOpenedEvent } from "@/components/JobOpenedEvent";
import { PublicJobList } from "@/components/PublicJobList";
import { ShareControls } from "@/components/ShareControls";
import { StructuredData } from "@/components/StructuredData";
import { TrackedApplyLink } from "@/components/TrackedApplyLink";
import { classifySponsorship } from "@/lib/jobFilters";
import { getUsLocationDisplay } from "@/lib/jobLocations";
import {
  fetchJobsSnapshot,
  fetchPublicJobById,
} from "@/lib/jobs";
import {
  companySlugForJob,
  isLegitimateActiveJob,
  jobPublicPath,
} from "@/lib/publicCatalog";
import {
  breadcrumbJsonLd,
  jobPostingDescription,
  jobPostingJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { CATEGORY_LABELS, SOURCE_LABELS } from "@/lib/types";

export const revalidate = 300;

const getJob = cache(fetchPublicJobById);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const result = await getJob(id);
  const path = `/jobs/${encodeURIComponent(id)}`;
  if (!result.job) {
    return publicPageMetadata({
      title: result.loadError ? "Job details unavailable" : "Job not found",
      description: result.loadError
        ? "Timley could not load this public listing record."
        : "This Timley public listing record does not exist or is outside the retained public-history window.",
      path,
      indexable: false,
    });
  }
  const active = isLegitimateActiveJob(result.job);
  return publicPageMetadata({
    title: `${result.job.title} at ${result.job.company}`,
    description: active
      ? jobPostingDescription(result.job)
      : `A retained Timley source observation for ${result.job.title} at ${result.job.company}. This role is no longer shown as active.`,
    path: jobPublicPath(result.job),
    indexable: active,
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function EvidenceRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-xs font-bold text-faint">{term}</dt>
      <dd className="text-sm text-muted">{children}</dd>
    </div>
  );
}

export default async function PublicJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, snapshot] = await Promise.all([
    getJob(id),
    fetchJobsSnapshot(),
  ]);

  if (!result.job) {
    if (!result.loadError) notFound();
    return (
      <main
        id="main-content"
        className="theme-application min-h-screen bg-bg px-4 py-20 text-fg"
      >
        <div className="ui-card mx-auto max-w-2xl px-6 py-12 text-center">
          <h1 className="text-3xl font-extrabold">Job details unavailable</h1>
          <p className="mt-3 text-muted">
            Timley could not read this listing record. The active job board may
            still be available.
          </p>
          <Link href="/jobs" className="ui-button ui-button--primary mt-6">
            Browse jobs
          </Link>
        </div>
      </main>
    );
  }

  const job = result.job;
  const active = isLegitimateActiveJob(job);
  const path = jobPublicPath(job);
  const companyPath = `/companies/${companySlugForJob(job)}`;
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Jobs", path: "/jobs" },
    { name: job.title, path },
  ];
  const related = snapshot.jobs
    .filter(
      (candidate) =>
        candidate.id !== job.id &&
        (companySlugForJob(candidate) === companySlugForJob(job) ||
          candidate.category === job.category),
    )
    .slice(0, 6);
  const sponsorship = classifySponsorship(job.sponsorship);

  return (
    <main
      id="main-content"
      className="theme-application min-h-screen bg-bg text-fg"
    >
      <JobOpenedEvent
        surface="job-detail"
        roleType={job.role_type}
        category={job.category}
      />
      <StructuredData
        data={
          active
            ? [breadcrumbJsonLd(breadcrumbs), jobPostingJsonLd(job)]
            : breadcrumbJsonLd(breadcrumbs)
        }
      />

      <section className="border-b-2 border-fg bg-bg">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Breadcrumbs items={breadcrumbs} />
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span
              className={`ui-badge ${active ? "ui-badge--success" : "ui-badge--warning"}`}
            >
              {active
                ? "Active source observation"
                : job.verification_status === "destination-closed"
                  ? "Destination closed"
                  : "Removed from active source"}
            </span>
            <span className="ui-badge ui-badge--neutral">
              {job.role_type === "internship" ? "Internship" : "New grad"}
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
            {job.title}
          </h1>
          <p className="mt-3 text-xl font-bold text-muted">
            <Link href={companyPath} className="hover:text-accent-hover">
              {job.company}
            </Link>
          </p>
          <p className="mt-2 text-base text-muted">
            {getUsLocationDisplay(job.location)}
          </p>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted">
            {active
              ? jobPostingDescription(job)
              : "Timley retains this bounded public observation so an old share link does not become misleading. The Apply action is suppressed because the role is no longer in the active feed."}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {active ? (
              <TrackedApplyLink
                href={job.canonical_url ?? job.link}
                surface="job-detail"
                roleType={job.role_type}
                category={job.category}
                className="ui-button ui-button--apply"
              >
                Apply on external site
                <span aria-hidden>↗</span>
              </TrackedApplyLink>
            ) : null}
            <ShareControls
              path={path}
              title={`${job.title} at ${job.company}`}
            />
            <Link
              href={`/jobs?q=${encodeURIComponent(job.company)}`}
              className="ui-button ui-button--quiet"
            >
              More from this company
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:px-8 lg:py-16">
        <section aria-labelledby="listing-evidence">
          <h2 id="listing-evidence" className="text-2xl font-extrabold">
            Listing evidence
          </h2>
          <dl className="mt-5 border-t border-border">
            <EvidenceRow term="Timley category">
              {CATEGORY_LABELS[job.category]}
            </EvidenceRow>
            <EvidenceRow term="Source">
              {SOURCE_LABELS[job.source] ?? job.original_source ?? job.source}
            </EvidenceRow>
            <EvidenceRow term="First observed">
              {formatDate(job.first_seen_at)}
            </EvidenceRow>
            <EvidenceRow term="Source posting date">
              {formatDate(job.posted_date)}
            </EvidenceRow>
            <EvidenceRow term="Last observed">
              {formatDate(job.last_seen_at)}
            </EvidenceRow>
            <EvidenceRow term="Last source verification">
              {formatDate(job.last_verified_at)}
            </EvidenceRow>
            <EvidenceRow term="Season">
              {job.season?.trim() || "Unavailable"}
            </EvidenceRow>
            <EvidenceRow term="Employer-listed pay">
              {job.pay_evidence === "employer-listed"
                ? job.salary?.trim() || "Unavailable"
                : "Unavailable"}
            </EvidenceRow>
            <EvidenceRow term="Sponsorship evidence">
              {sponsorship === "offers-sponsorship"
                ? "Source explicitly offers sponsorship"
                : sponsorship === "no-sponsorship"
                  ? "Source explicitly says no sponsorship"
                  : sponsorship === "citizens-only"
                    ? "Source includes a citizenship restriction"
                    : "Unavailable"}
            </EvidenceRow>
            <EvidenceRow term="Requisition / external ID">
              {job.requisition_id ?? job.external_job_id ?? "Unavailable"}
            </EvidenceRow>
            <EvidenceRow term="Public record ID">{job.id}</EvidenceRow>
          </dl>
        </section>

        <aside className="space-y-4">
          <section className="ui-card p-5" aria-labelledby="detail-meaning">
            <h2 id="detail-meaning" className="text-base font-extrabold">
              What “observed” means
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Timley saw this record in a named public source. That is not
              comprehensive destination verification or employer endorsement.
            </p>
          </section>
          <section className="ui-card p-5" aria-labelledby="detail-privacy">
            <h2 id="detail-privacy" className="text-base font-extrabold">
              Safe to share
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              This URL contains only the stable public listing ID. Saved status,
              application stages, notes, contacts, and tracker history are
              never included.
            </p>
          </section>
        </aside>
      </div>

      {related.length > 0 ? (
        <section
          aria-labelledby="related-roles"
          className="border-t-2 border-fg bg-bg"
        >
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 id="related-roles" className="text-2xl font-extrabold">
              Related active roles
            </h2>
            <p className="mt-2 text-sm text-muted">
              Deterministic matches from the same company or Timley category.
            </p>
            <div className="mt-5">
              <PublicJobList jobs={related} />
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
